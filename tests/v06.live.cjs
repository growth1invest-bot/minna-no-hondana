// Real external API measurements. No API/cover routes are mocked.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const origin=process.env.BOOKS_TEST_ORIGIN||'http://127.0.0.1:8766',output=process.env.BOOKS_EVIDENCE_DIR||'test-results/v06-live';
(async()=>{
 fs.mkdirSync(output,{recursive:true});const pin=process.env.PLAYWRIGHT_TEST_CA_SPKI;
 const browser=await chromium.launch({args:pin?['--ignore-certificate-errors-spki-list='+pin]:[]});
 const evidence={mode:'live-no-mocks',time:new Date().toISOString(),cacheDefinition:'Cold means no app localStorage or memory cache; provider/CDN/browser HTTP caches are uncontrolled.',baseline:[],queries:[],responses:[],isbnChecks:[],migration:null};let ndlBlockedUntil=0;
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 async function waitForNDL(){while(ndlBlockedUntil>Date.now()){console.log('Respecting NDL cooldown');await sleep(Math.min(15000,ndlBlockedUntil-Date.now()))}}
 function observe(page){page.on('response',r=>{if(/ndlsearch|googleapis|openlibrary|openbd|books.google.com\/books\?/.test(r.url())){evidence.responses.push({url:r.url(),status:r.status()});if(r.url().includes('ndlsearch')&&r.status()===429)ndlBlockedUntil=Date.now()+61000}})}
 async function run(page,text,version,kind='intitle'){
  await page.locator('#search-kind').selectOption(kind);await page.locator('#query').fill(text);
  const start=performance.now();await page.getByRole('button',{name:'検索',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#search-message').textContent.includes('検索中')&&!document.querySelector('#search-message').textContent.includes('再試行して'),{},{timeout:95000});
  const metadataMs=Math.round(performance.now()-start),books=await page.evaluate(()=>[...results.values()]);assert.ok(books.every(b=>b.languages?.includes('jpn')));
  const row={query:text,kind,version,metadataMs,count:books.length,message:await page.locator('#search-message').innerText(),books,covers:[]};
  if(version===6&&books.length){
   await page.waitForFunction(()=>!coverTimer&&!coverRunning&&pendingCovers.size===0,{},{timeout:25000});
   await page.evaluate(async()=>{const images=[...document.querySelectorAll('.result .cover img')];images.forEach(i=>i.loading='eager');await Promise.all(images.map(i=>i.decode().catch(()=>{})))});
   await page.waitForFunction(()=>!coverTimer&&!coverRunning&&pendingCovers.size===0,{},{timeout:25000});
   row.coverPhaseMs=Math.round(performance.now()-start)-metadataMs;
   row.covers=await page.evaluate(()=>[...results.values()].flatMap(b=>{const c=coverFor(b);return c?.proof?.width>10?[{id:b.id,title:b.title,isbn:c.proof.isbn,languages:b.languages,image:c.image,proof:c.proof}]:[]}));
   const existingCovers=await page.evaluate(()=>{const books=[...results.values()];return [...document.querySelectorAll('.result')].flatMap((row,i)=>{const img=row.querySelector('.cover img'),b=books[i],cover=coverFor(b);return img?.complete&&img.naturalWidth>10&&b?.image&&normalizeISBNs(b.isbns).length===1?[{id:b.id,title:b.title,isbn:b.isbns[0],languages:b.languages,image:img.src,proof:{...cover?.proof,isbn:b.isbns[0],width:img.naturalWidth,height:img.naturalHeight}}]:[]})});
   row.covers.push(...existingCovers.filter(c=>!row.covers.some(x=>x.id===c.id)));
   for(const c of row.covers){assert.ok(books.find(b=>b.id===c.id).isbns.includes(c.isbn));assert.ok(c.proof.width>10&&c.proof.height>10)}
  }
  return row;
 }
 try{
  for(const text of ['嫌われる勇気','エッセンシャル思考']){
   await waitForNDL();const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();observe(page);await page.goto(origin+'/index-v05.html');await page.locator('#open-search').click();const row=await run(page,text,5);evidence.baseline.push(row);console.log('v05',text,row.count,row.metadataMs+'ms');await context.close();
  }
  for(const text of ['嫌われる勇気','7つの習慣','エッセンシャル思考','人を動かす','嫌われる']){
   await waitForNDL();const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();observe(page);await page.goto(origin+'/index-v06.html');await page.locator('#open-search').click();const row=await run(page,text,6);
   const before=evidence.responses.filter(r=>r.url.includes('ndlsearch')).length;const warm=await run(page,text,6);row.warmMetadataMs=warm.metadataMs;row.warmNDLRequests=evidence.responses.filter(r=>r.url.includes('ndlsearch')).length-before;
   evidence.queries.push(row);console.log('v06',text,row.count,row.metadataMs+'ms','warm',row.warmMetadataMs+'ms','covers',row.covers.length);await page.screenshot({path:path.join(output,'query-'+evidence.queries.length+'.png'),fullPage:true});await context.close();
  }
  // A separate ISBN test verifies the specific Japanese Carnegie edition, rather than a same-title book.
  await waitForNDL();const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();observe(page);await page.goto(origin+'/index-v06.html');await page.locator('#open-search').click();const isbn=await run(page,'9784422100517',6,'isbn');evidence.isbnChecks.push(isbn);console.log('ISBN check',isbn.count,'covers',isbn.covers.length);await context.close();
  const existing=[evidence.queries.find(q=>q.query==='嫌われる勇気')?.books[0],evidence.queries.find(q=>q.query==='エッセンシャル思考')?.books[0]].filter(Boolean);
  if(existing.length===2){
   const old=existing.map((b,i)=>({...b,type:i?'read':'want',favorite:!!i})),raw=JSON.stringify({version:5,books:old});
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();observe(page);await page.goto(origin+'/index-v06.html');await page.evaluate(raw=>localStorage.setItem('minna-no-hondana.v05',raw),raw);await page.reload();await page.getByRole('button',{name:'お気に入り',exact:true}).click();assert.equal(await page.locator('.book').count(),1);
   await page.locator('#open-search').click();const searched=await run(page,'嫌われる',6);const checks=page.locator('.result input:not(:disabled)');if(await checks.count()>=2){await checks.nth(0).check();await checks.nth(1).check();await page.getByRole('button',{name:'選択した本を登録（2冊）'}).click();await page.reload();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('minna-no-hondana.v06')).books.length),4);await page.getByRole('button',{name:'お気に入り',exact:true}).click();assert.equal(await page.locator('.book').count(),1);assert.equal(await page.evaluate(()=>localStorage.getItem('minna-no-hondana.v05')),raw);const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('minna-no-hondana.v06')).books.slice(0,2));assert.deepEqual(stored,old);evidence.migration={imported:2,bulkAdded:2,statusAndFavoritePreserved:true,isbnPreserved:true,sourceKeyUnchanged:true,reloaded:true};await page.waitForFunction(()=>!coverTimer&&!coverRunning&&pendingCovers.size===0,{},{timeout:25000});evidence.migration.covers=await page.evaluate(()=>books.flatMap(b=>{const c=coverFor(b);return c?.proof?.width>10?[{title:b.title,isbn:c.proof.isbn,image:c.image,proof:c.proof}]:[]}));await page.screenshot({path:path.join(output,'imported-shelf.png'),fullPage:true})}await context.close();
  }
 }finally{fs.writeFileSync(path.join(output,'v06-live.json'),JSON.stringify(evidence,null,2));await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
