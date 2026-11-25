// Opt-in, read-only production checks. No sign-in/signup/email or Firestore writes.
const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const SDK='https://www.gstatic.com/firebasejs/13.4.0/';
const ORIGIN='https://growth1invest-bot.github.io',PREFIX='/minna-no-hondana/';
const HASHES={
 'firebase-app.js':'26673f502611bc7b382edfee3230c70954dd5e4982779185c7b6b657b5f69737',
 'firebase-auth.js':'9be3b6574c0c46f4a0bfb8d85436c30c89871a8d5a9fbeb0e0137d90a74667e9',
 'firebase-firestore.js':'758596fa33e277d38925d05e8111acfd209dc0dbff593e3bb4eaeb35aec2f85c'
};
test('registered public config, real SDK/Auth initialization and anonymous Firestore rejection at Pages origin',async({page},info)=>{
 expect(process.env.HONDANA_READONLY_FIREBASE_CHECK).toBe('1');
 const cache=process.env.HONDANA_FIREBASE_SDK_CACHE||path.join(os.tmpdir(),'hondana-firebase-sdk-13.4.0');
 const blocked=[];
 page.on('requestfailed',r=>{const u=new URL(r.url());console.log('READONLY_NETWORK_FAILURE',u.hostname+u.pathname,r.failure()?.errorText)});
 await page.route('https://**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===ORIGIN&&url.pathname.startsWith(PREFIX)){
   const name=url.pathname.slice(PREFIX.length);
   if(!['index-v12.html','firebase-v12-config.mjs','cloud/v12-data.mjs','cloud/v12-controller.mjs','cloud/v12-firebase.mjs','cloud/v12-ui.mjs'].includes(name))return route.abort();
   return route.fulfill({contentType:name.endsWith('.html')?'text/html':'application/javascript',body:await fs.readFile(path.join(__dirname,'..',name))});
  }
  if(url.origin==='https://www.gstatic.com'&&url.pathname.startsWith('/firebasejs/13.4.0/')){
   const name=path.posix.basename(url.pathname);expect(Object.hasOwn(HASHES,name)).toBe(true);
   const bytes=await fs.readFile(path.join(cache,name));expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(HASHES[name]);
   return route.fulfill({contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:bytes});
  }
  if(url.hostname==='firebase.googleapis.com'&&['GET','OPTIONS'].includes(request.method())&&url.pathname.startsWith('/v1alpha/projects/-/apps/'))return route.continue();
  if(url.hostname==='identitytoolkit.googleapis.com'&&['GET','OPTIONS'].includes(request.method())&&url.pathname==='/v1/projects')return route.continue();
  if(url.hostname==='firestore.googleapis.com'&&url.pathname==='/google.firestore.v1.Firestore/Listen/channel'&&['GET','POST','OPTIONS'].includes(request.method()))return route.continue();
  blocked.push({host:url.hostname,path:url.pathname,method:request.method()});return route.abort();
 });
 await page.goto(ORIGIN+PREFIX+'index-v12.html');
 const before=await page.evaluate(()=>({records:JSON.stringify(hondanaV12Local.read()),storage:JSON.stringify({...localStorage})}));
 await page.locator('#cloud-panel').evaluate(e=>e.open=true);await expect(page.locator('#cloud-config-note')).toContainText('公開構成は設定済み');await expect(page.locator('#cloud-status')).toContainText('公開構成は設定済み');
 await page.locator('#cloud-connect').click();await expect(page.locator('#cloud-login')).toBeEnabled();await expect(page.locator('#cloud-user')).toContainText('ログアウト');
 const result=await page.evaluate(async({SDK,PREFIX})=>{
  const {firebaseConfig:config}=await import(PREFIX+'firebase-v12-config.mjs');
  const app=await import(SDK+'firebase-app.js'),auth=await import(SDK+'firebase-auth.js'),dbSDK=await import(SDK+'firebase-firestore.js');
  const instance=app.getApp('hondana-v12'),db=dbSDK.getFirestore(instance);
  const registrationResponse=await fetch('https://firebase.googleapis.com/v1alpha/projects/-/apps/'+config.appId+'/webConfig',{headers:{'X-Goog-Api-Key':config.apiKey}});
  const registration=await registrationResponse.json();
  const authResponse=await fetch('https://identitytoolkit.googleapis.com/v1/projects?key='+encodeURIComponent(config.apiKey));
  const authConfig=await authResponse.json();
  let timer,anonymousCode;
  try{await Promise.race([dbSDK.getDocFromServer(dbSDK.doc(db,'users','hondana-connection-probe','sync','head')),new Promise((_,reject)=>timer=setTimeout(()=>reject({code:'test-deadline'}),15000))]);anonymousCode='unexpectedly-allowed'}catch(error){anonymousCode=error.code}finally{clearTimeout(timer);await dbSDK.terminate(db)}
  return {registrationStatus:registrationResponse.status,registration:{projectId:registration.projectId,appId:registration.appId,authDomain:registration.authDomain},authStatus:authResponse.status,authProject:authConfig.projectId,authorizedDomains:authConfig.authorizedDomains,anonymousCode,loggedIn:auth.getAuth(instance).currentUser!==null,appOptions:{projectId:instance.options.projectId,appId:instance.options.appId},records:JSON.stringify(hondanaV12Local.read()),storage:JSON.stringify({...localStorage})};
 },{SDK,PREFIX});
 expect(result.registrationStatus).toBe(200);expect(result.registration).toEqual({projectId:'minna-no-hondana-e936b',appId:'1:750942409516:web:9b90598e435d9531685289',authDomain:'minna-no-hondana-e936b.firebaseapp.com'});
 expect(result.authStatus).toBe(200);expect(result.authProject).toBe('750942409516');expect(result.loggedIn).toBe(false);
 expect(result.anonymousCode).toBe('permission-denied');expect(result.records).toBe(before.records);expect(result.storage).toBe(before.storage);
 expect(blocked.filter(r=>['identitytoolkit.googleapis.com','securetoken.googleapis.com','firestore.googleapis.com'].includes(r.host))).toEqual([]);
 const {records,storage,...evidence}=result;
 await info.attach('read-only-production-evidence',{body:JSON.stringify({...evidence,origin:ORIGIN,pagesDomainAuthorized:result.authorizedDomains.includes('growth1invest-bot.github.io'),note:'Local candidate served at Pages origin; not a deployed page. Anonymous reads only; no real login, mail or writes.'},null,2),contentType:'application/json'});
});
