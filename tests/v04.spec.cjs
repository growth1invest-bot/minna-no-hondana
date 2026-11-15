const { test, expect } = require('@playwright/test');
const URL='http://127.0.0.1:8764/index-v04.html';
const G='https://www.googleapis.com/books/v1/volumes?**';
const O='https://openlibrary.org/search.json?**';
const B='https://api.openbd.jp/v1/get?**';
const OLD='minna-no-hondana.v03',KEY='minna-no-hondana.v04';
const google=(id,title,isbn='9784101010014')=>({id,volumeInfo:{title,authors:['夏目漱石'],industryIdentifiers:[{type:'ISBN_13',identifier:isbn}]}});
const library=(id,title,isbn='9784101010014',cover=123)=>({key:'/works/'+id+'W',title,author_name:['夏目漱石'],editions:{docs:[{key:'/books/'+id+'M',title,isbn:[isbn],cover_i:cover}]}});
const docs=[library('OL1','吾輩は猫である'),library('OL2','こころ','9784101010137',null),library('OL3','坊っちゃん','9784101010038')];
async function routes(page,{gstatus=429,gitems=[],odocs=docs,ostatus=200,bitems=[null],bstatus=200}={}){
  await page.route(G,r=>r.fulfill({status:gstatus,json:gstatus===200?{totalItems:gitems.length,items:gitems}:{error:{code:gstatus}}}));
  await page.route(O,r=>r.fulfill({status:ostatus,json:ostatus===200?{numFound:odocs.length,docs:odocs}:{error:'unavailable'}}));
  await page.route(B,r=>r.fulfill({status:bstatus,json:bitems}));
  await page.route('https://covers.openlibrary.org/**',r=>r.abort());
}
async function begin(page,text='吾輩は猫である',kind='intitle',provider='auto'){
  await page.goto(URL);await page.locator('#open-search').click();await page.locator('#provider').selectOption(provider);await page.locator('#search-kind').selectOption(kind);await page.locator('#query').fill(text);await page.getByRole('button',{name:'検索',exact:true}).click();
}
async function choose(page,title){await page.getByRole('checkbox',{name:title+'を選択',exact:true}).check()}
async function register(page,count){await page.getByRole('button',{name:`選択した本を登録（${count}冊）`}).click()}
test('Japanese title falls back from Google 429 and returns multiple books',async({page})=>{
  await routes(page);const requests=[];page.on('request',r=>{if(r.url().includes('search.json'))requests.push(new globalThis.URL(r.url()))});await begin(page);
  await expect(page.locator('.result')).toHaveCount(3);await expect(page.locator('#search-message')).toContainText('Google Books：利用上限（429） → Open Library');
  expect(requests[0].searchParams.get('title')).toBe('吾輩は猫である');expect(requests[0].searchParams.get('lang')).toBe('ja');await expect(page.locator('.result img')).toHaveCount(0);await expect(page.locator('.result .cover strong').first()).toHaveText('吾輩は猫である');
});
test('author search, bulk registration, tabs, favorite and reload',async({page})=>{
  await routes(page);const req=page.waitForRequest(r=>r.url().includes('search.json'));await begin(page,'夏目漱石','inauthor');expect(new globalThis.URL((await req).url()).searchParams.get('author')).toBe('夏目漱石');await expect(page.locator('.result')).toHaveCount(3);
  await choose(page,'吾輩は猫である');await choose(page,'こころ');await page.locator('#destination').selectOption('want');await register(page,2);await expect(page.locator('.book')).toHaveCount(2);await page.reload();await page.getByRole('button',{name:'読みたい本',exact:true}).click();await expect(page.locator('.book')).toHaveCount(2);
  await page.getByRole('button',{name:'こころの詳細'}).click();await page.locator('#book-type').selectOption('read');await page.locator('#book-favorite').check();await page.locator('#save-detail').click();await page.getByRole('button',{name:'お気に入り',exact:true}).click();await expect(page.locator('.book')).toHaveCount(1);await page.reload();await page.getByRole('button',{name:'お気に入り',exact:true}).click();await expect(page.locator('.book')).toHaveCount(1);
  const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);expect(stored.version).toBe(4);expect(stored.books[0].isbns).toEqual(['9784101010014']);expect(stored.books[0].identifiers.openlibraryEdition).toBe('/books/OL1M');
});
test('Google success retains ISBN and no fallback is called',async({page})=>{
  await routes(page,{gstatus:200,gitems:[google('g1','吾輩は猫である')]});let calls=0;page.on('request',r=>{if(r.url().includes('search.json'))calls++});await begin(page);await expect(page.locator('.result')).toHaveCount(1);await expect(page.locator('#search-message')).toContainText('Google Books：1件');expect(calls).toBe(0);await choose(page,'吾輩は猫である');await register(page,1);const b=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).books[0],KEY);expect(b.identifiers.google).toBe('g1');expect(b.isbns).toEqual(['9784101010014']);
});
test('same ISBN from another provider and ISBN10 cannot be registered twice',async({page})=>{
  await routes(page,{gstatus:200,gitems:[google('g1','吾輩は猫である')]});await begin(page);await expect(page.locator('.result')).toHaveCount(1);await choose(page,'吾輩は猫である');await register(page,1);
  await page.locator('#open-search').click();await page.locator('#provider').selectOption('openlibrary');await page.locator('#query').fill('吾輩は猫である');await page.getByRole('button',{name:'検索',exact:true}).click();await expect(page.getByRole('checkbox',{name:'吾輩は猫であるを選択',exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>isbn13('4-10-101001-3'))).toBe('9784101010014');expect(await page.evaluate(()=>isbn13('9784101010015'))).toBe('');
});
test('v03 import is read-only and title-author prevents legacy duplicates without ISBN',async({page})=>{
  await routes(page,{odocs:[{...docs[0],author_name:['夏目漱石','編集者']},docs[1],docs[2]]});await page.goto(URL);const raw=JSON.stringify({version:3,books:[{id:'legacy',title:'吾輩は猫である',author:'夏目漱石・編集者',image:'',type:'read',favorite:true,extra:'keep'}]});await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key:OLD,raw});await page.reload();await expect(page.locator('.book')).toHaveCount(1);await page.locator('#open-search').click();await page.locator('#query').fill('夏目漱石');await page.getByRole('button',{name:'検索',exact:true}).click();await expect(page.getByRole('checkbox',{name:'吾輩は猫であるを選択',exact:true})).toBeDisabled();await choose(page,'こころ');await register(page,1);expect(await page.evaluate(key=>localStorage.getItem(key),OLD)).toBe(raw);await page.reload();await expect(page.locator('.book')).toHaveCount(2);const b=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).books.find(b=>b.id==='legacy'),KEY);expect(b.extra).toBe('keep');expect(b.favorite).toBe(true);
});
test('ISBN lookup uses openBD before Google and retains identifiers',async({page})=>{
  await routes(page,{bitems:[{summary:{isbn:'9784101010014',title:'吾輩は猫である',author:'夏目漱石',cover:'',publisher:'新潮社'}}]});let googleCalls=0;page.on('request',r=>{if(r.url().includes('googleapis'))googleCalls++});await begin(page,'4-10-101001-3','isbn');await expect(page.locator('.result')).toHaveCount(1);await expect(page.locator('#search-message')).toContainText('openBD：1件');expect(googleCalls).toBe(0);await choose(page,'吾輩は猫である');await register(page,1);await page.locator('.book').click();await expect(page.locator('#detail-identifiers')).toContainText('9784101010014');
});
test('all providers failing shows specific errors and retry remains available',async({page})=>{
  await routes(page,{ostatus:503});await begin(page);await expect(page.locator('#search-message')).toContainText('書籍を取得できませんでした');await expect(page.locator('#search-message')).toContainText('Google Books：利用上限（429）');await expect(page.locator('#search-message')).toContainText('Open Library：HTTP 503');await expect(page.locator('#register')).toBeDisabled();await page.locator('#provider').selectOption('openlibrary');await page.unroute(O);await page.route(O,r=>r.fulfill({json:{numFound:3,docs}}));await page.getByRole('button',{name:'検索',exact:true}).click();await expect(page.locator('.result')).toHaveCount(3);
});
test('openBD failure, Google 429, Open Library failure are all reported',async({page})=>{
  await routes(page,{ostatus:503,bstatus:500});await begin(page,'9784101010014','isbn');await expect(page.locator('#search-message')).toContainText('openBD：HTTP 500');await expect(page.locator('#search-message')).toContainText('Open Library：HTTP 503');
});
test('missing Google results and network failure both fall back',async({page})=>{
  await routes(page,{gstatus:200});await begin(page);await expect(page.locator('#search-message')).toContainText('Google Books：該当なし → Open Library');await expect(page.locator('.result')).toHaveCount(3);
  await page.unroute(G);await page.route(G,r=>r.abort());await page.locator('#query').fill('新しい検索');await page.getByRole('button',{name:'検索',exact:true}).click();await expect(page.locator('#search-message')).toContainText('Google Books：通信エラー');await expect(page.locator('.result')).toHaveCount(3);
});
test('Google timeout switches provider without waiting for endless connection',async({page})=>{
  await routes(page);await page.unroute(G);await page.route(G,()=>{});await page.clock.install();const requested=page.waitForRequest(r=>r.url().includes('googleapis'));await begin(page);await requested;await page.clock.runFor(8100);await expect(page.locator('.result')).toHaveCount(3);await expect(page.locator('#search-message')).toContainText('タイムアウト（8秒）');
});
test('loaded cover and broken cover use correct fallback',async({page})=>{
  await routes(page);await page.unroute('https://covers.openlibrary.org/**');await page.route('https://covers.openlibrary.org/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="140"><rect width="100" height="140" fill="tan"/></svg>'}));await begin(page);await expect.poll(()=>page.locator('.result img').first().evaluate(i=>i.naturalWidth)).toBe(100);await expect(page.locator('.result').nth(1).locator('.cover strong')).toHaveText('こころ');
});
test('cache prevents identical repeat request and cooldown skips Google after 429',async({page})=>{
  await routes(page);let g=0,o=0;page.on('request',r=>{if(r.url().includes('googleapis'))g++;if(r.url().includes('search.json'))o++});await begin(page);await expect(page.locator('.result')).toHaveCount(3);await page.getByRole('button',{name:'検索',exact:true}).click();await expect(page.locator('#search-message')).toContainText('一時休止中');expect(g).toBe(1);expect(o).toBe(1);await page.locator('#query').fill('他の書籍');await page.getByRole('button',{name:'検索',exact:true}).click();await expect(page.locator('.result')).toHaveCount(3);expect(g).toBe(1);expect(o).toBe(2);
});
test('pagination failure preserves selected books and fallback offset starts at zero',async({page})=>{
  await routes(page,{gstatus:200});await page.unroute(G);await page.route(G,r=>{const n=Number(new globalThis.URL(r.request().url()).searchParams.get('startIndex'));return n?r.fulfill({status:429,json:{}}):r.fulfill({json:{totalItems:30,items:Array.from({length:20},(_,i)=>google('p'+i,'本'+i,''))}})});let offset;await page.unroute(O);await page.route(O,r=>{offset=new globalThis.URL(r.request().url()).searchParams.get('offset');return r.fulfill({json:{numFound:3,docs}})});await begin(page);await expect(page.locator('.result')).toHaveCount(20);await choose(page,'本0');await page.locator('#more').click();await expect(page.locator('.result')).toHaveCount(23);expect(offset).toBe('0');await choose(page,'こころ');await register(page,2);await expect(page.locator('.book')).toHaveCount(2);
});
test('late responses cannot overwrite a newer search or closed dialog',async({page})=>{
  await routes(page);await page.unroute(G);let release;await page.route(G,async r=>{const q=new globalThis.URL(r.request().url()).searchParams.get('q');if(q.includes('古い')){await new Promise(resolve=>release=resolve)}await r.fulfill({json:{totalItems:1,items:[google(q,q)]}}).catch(()=>{})});await begin(page,'古い');await expect.poll(()=>!!release).toBe(true);await page.locator('#query').fill('新しい');await page.getByRole('button',{name:'検索',exact:true}).click();await expect(page.locator('.result-info strong')).toHaveText('intitle:新しい');release();await page.waitForTimeout(50);await expect(page.locator('.result-info strong')).toHaveText('intitle:新しい');await page.locator('#close-search').click();await expect(page.locator('#search-dialog')).not.toBeVisible();
});
test('malformed data and storage failures protect existing records',async({page})=>{
  await routes(page);await page.goto(URL);await page.evaluate(key=>localStorage.setItem(key,'broken'),OLD);await page.reload();await expect(page.locator('#storage-error')).toContainText('読み込めません');await page.locator('#open-search').click();await page.locator('#query').fill('本');await page.getByRole('button',{name:'検索',exact:true}).click();await choose(page,'こころ');await register(page,1);await expect(page.locator('#search-dialog')).toBeVisible();expect(await page.evaluate(key=>localStorage.getItem(key),OLD)).toBe('broken');expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toBeNull();
});
test('touch-sized layouts fit phone and tablet viewports',async({page})=>{
  await routes(page);await begin(page);await expect(page.locator('.result')).toHaveCount(3);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('#search-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);await choose(page,'こころ');await register(page,1);expect(await page.locator('.shelf').first().evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length)).toBe(page.viewportSize().width>=620?4:3);
});
test('invalid JSON response falls back and is not cached',async({page})=>{
  await routes(page);await page.unroute(G);await page.route(G,r=>r.fulfill({json:{unexpected:true}}));await begin(page);await expect(page.locator('#search-message')).toContainText('Google Books：応答形式エラー');await expect(page.locator('.result')).toHaveCount(3);await page.unroute(G);await page.route(G,r=>r.fulfill({json:{totalItems:1,items:[google('fixed','復旧した本')]}}));await page.getByRole('button',{name:'検索',exact:true}).click();await expect(page.locator('.result-info strong')).toHaveText('復旧した本');
});
test('429 Retry-After suppresses requests until provider cooldown ends',async({page})=>{
  await routes(page);await page.unroute(G);await page.route(G,r=>r.fulfill({status:429,headers:{'Retry-After':'120','Access-Control-Expose-Headers':'Retry-After'},json:{}}));await page.clock.install();await begin(page);await expect(page.locator('.result')).toHaveCount(3);await page.clock.runFor(61000);let calls=0;page.on('request',r=>{if(r.url().includes('googleapis'))calls++});await page.locator('#query').fill('別の本');await page.getByRole('button',{name:'検索',exact:true}).click();await expect(page.locator('#search-message')).toContainText('一時休止中');expect(calls).toBe(0);await page.clock.runFor(61000);await page.locator('#query').fill('さらに別の本');await page.getByRole('button',{name:'検索',exact:true}).click();await expect(page.locator('#search-message')).toContainText('Google Books：利用上限（429）');expect(calls).toBe(1);
});
test('quota save failure leaves old data intact and does not report success',async({page})=>{
  await routes(page);await begin(page);await expect(page.locator('.result')).toHaveCount(3);await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('quota','QuotaExceededError')}});await choose(page,'こころ');await register(page,1);await expect(page.locator('#search-dialog')).toBeVisible();await page.locator('#close-search').click();await expect(page.locator('#storage-error')).toContainText('保存できません');await expect(page.locator('.book')).toHaveCount(0);
});
test('all providers returning no matches gives a no-results message',async({page})=>{
  await routes(page,{gstatus:200,odocs:[]});await begin(page);await expect(page.locator('#search-message')).toContainText('見つかりませんでした');await expect(page.locator('#search-message')).not.toContainText('取得できませんでした');
});
test('ISBN empty lookup falls back, and invalid ISBN makes no requests',async({page})=>{
  await routes(page);await begin(page,'9784101010014','isbn');await expect(page.locator('.result')).toHaveCount(3);await expect(page.locator('#search-message')).toContainText('openBD：該当なし');let calls=0;page.on('request',r=>{if(/googleapis|search.json|openbd/.test(r.url()))calls++});await page.locator('#query').fill('9784101010015');await page.getByRole('button',{name:'検索',exact:true}).click();await expect(page.locator('#search-message')).toContainText('有効なISBN');expect(calls).toBe(0);
});
