// Live external APIs. No mocks, page.route(), fabricated titles, or hard-coded ISBN lookup.
const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const evidenceDir=process.env.BOOKS_EVIDENCE_DIR||'test-results/v05-live';
const origin=process.env.BOOKS_TEST_ORIGIN||'http://127.0.0.1:8765';
const queries=[['嫌われる','intitle'],['嫌われる勇気','intitle'],['7つの習慣','intitle'],['エッセンシャル思考','intitle'],['人を動かす','intitle'],['岸見一郎','inauthor']];
(async()=>{
 fs.mkdirSync(evidenceDir,{recursive:true});
 const pin=process.env.PLAYWRIGHT_TEST_CA_SPKI;
 const browser=await chromium.launch({args:pin?['--ignore-certificate-errors-spki-list='+pin]:[]});
 const evidence={mode:'real-APIs-no-mocks',time:new Date().toISOString(),origin,queries:[],responses:[],registration:null};
 let blockedUntil=0;
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  page.on('response',r=>{if(/ndlsearch|googleapis|openlibrary|openbd/.test(r.url())){evidence.responses.push({url:r.url(),status:r.status()});if(r.url().includes('ndlsearch')&&r.status()===429)blockedUntil=Date.now()+60000;}});
  await page.goto(origin+'/index-v05.html');await page.locator('#open-search').click();
  for(const [text,kind] of queries){
   while(Date.now()<blockedUntil){console.log('Respecting NDL 429 cooldown');await sleep(Math.min(15000,blockedUntil-Date.now()))}
   await page.locator('#search-kind').selectOption(kind);await page.locator('#query').fill(text);await page.getByRole('button',{name:'検索',exact:true}).click();
   await page.waitForFunction(()=>!document.querySelector('#search-message').textContent.includes('検索中'),{},{timeout:90000});
   const books=await page.evaluate(()=>[...results.values()]);
   assert.ok(books.every(b=>b.languages?.includes('jpn')),'Foreign/unknown edition leaked into Japanese results');
   for(const b of books){assert.ok(b.title&&b.author&&b.source);if(b.imageIdentity?.isbn)assert.ok(b.isbns.includes(b.imageIdentity.isbn));if(b.imageIdentity?.edition)assert.equal(b.imageIdentity.edition,b.identifiers.openlibraryEdition||b.identifiers.google)}
   const row={query:text,kind,message:await page.locator('#search-message').innerText(),japaneseCount:books.length,books,loadedCovers:[]};
   const imgs=page.locator('.result img');
   for(let i=0;i<Math.min(await imgs.count(),2);i++){
    const img=imgs.nth(i);await img.evaluate(e=>e.loading='eager');
    try{await img.evaluate(e=>e.decode());row.loadedCovers.push(await img.evaluate(e=>({url:e.src,width:e.naturalWidth,height:e.naturalHeight})))}catch{}
   }
   evidence.queries.push(row);console.log(text+': '+books.length+' Japanese results; '+row.message);
   await page.screenshot({path:path.join(evidenceDir,'query-'+evidence.queries.length+'.png'),fullPage:true});
  }
  const first=evidence.queries.find(q=>q.books.length>=2);
  if(first){
   while(Date.now()<blockedUntil)await sleep(Math.min(15000,blockedUntil-Date.now()));
   await page.locator('#search-kind').selectOption(first.kind);await page.locator('#query').fill(first.query);await page.getByRole('button',{name:'検索',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#search-message').textContent.includes('検索中'),{},{timeout:90000});
   const checks=page.locator('.result input:not(:disabled)');await checks.nth(0).check();await checks.nth(1).check();await page.locator('#destination').selectOption('want');await page.getByRole('button',{name:'選択した本を登録（2冊）'}).click();
   await page.reload();await page.getByRole('button',{name:'読みたい本',exact:true}).click();assert.equal(await page.locator('.book').count(),2);await page.locator('.book').first().click();await page.locator('#book-type').selectOption('read');await page.locator('#book-favorite').check();await page.locator('#save-detail').click();await page.reload();await page.getByRole('button',{name:'お気に入り',exact:true}).click();assert.equal(await page.locator('.book').count(),1);evidence.registration={bulk:2,reload:true,statusSwitch:true,favorite:true};
  }
  evidence.allSixQueriesSucceeded=evidence.queries.every(q=>q.japaneseCount>0);
 }finally{fs.writeFileSync(path.join(evidenceDir,'v05-live.json'),JSON.stringify(evidence,null,2));await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
