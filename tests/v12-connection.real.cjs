// Actual Firebase SDK + local Auth/Firestore emulators. No production credentials or writes.
const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const PROJECT='demo-hondana-v12',ROOT='http://127.0.0.1:8776',SDK='https://www.gstatic.com/firebasejs/13.4.0/';
const AUTH='http://127.0.0.1:9099',FIRESTORE='http://127.0.0.1:8089',KEY='minna-no-hondana.v12';
const CONFIG={apiKey:'TEST_ONLY_EMULATOR_PUBLIC_KEY',authDomain:PROJECT+'.firebaseapp.com',projectId:PROJECT,appId:'1:123456789:web:emulator-test'};
const HASHES={
 'firebase-app.js':'26673f502611bc7b382edfee3230c70954dd5e4982779185c7b6b657b5f69737',
 'firebase-auth.js':'9be3b6574c0c46f4a0bfb8d85436c30c89871a8d5a9fbeb0e0137d90a74667e9',
 'firebase-firestore.js':'758596fa33e277d38925d05e8111acfd209dc0dbff593e3bb4eaeb35aec2f85c'
};
test.beforeEach(async({request})=>{
 expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe('127.0.0.1:9099');
 expect(process.env.FIRESTORE_EMULATOR_HOST).toBe('127.0.0.1:8089');
 expect((await request.delete(AUTH+'/emulator/v1/projects/'+PROJECT+'/accounts')).ok()).toBe(true);
 expect((await request.delete(FIRESTORE+'/emulator/v1/projects/'+PROJECT+'/databases/(default)/documents')).ok()).toBe(true);
});
async function setup(page){
 const network=[];page.on('request',r=>network.push(r.url()));
 const cache=process.env.HONDANA_FIREBASE_SDK_CACHE||path.join(os.tmpdir(),'hondana-firebase-sdk-13.4.0');
 await page.route('https://**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin==='https://www.gstatic.com'&&url.pathname.startsWith('/firebasejs/13.4.0/')){
   const name=path.posix.basename(url.pathname);expect(Object.hasOwn(HASHES,name)).toBe(true);
   const bytes=await fs.readFile(path.join(cache,name));expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(HASHES[name]);
   if(!url.searchParams.has('original')&&name!=='firebase-app.js'){
    const original=SDK+name+'?original';
    const body=`export * from '${original}';import * as real from '${original}';`+(name==='firebase-auth.js'?
     `export function initializeAuth(app,options){const auth=real.initializeAuth(app,options);real.connectAuthEmulator(auth,'${AUTH}',{disableWarnings:true});return auth}`:
     `export function initializeFirestore(app,options){const db=real.initializeFirestore(app,options);real.connectFirestoreEmulator(db,'127.0.0.1',8089);return db}`);
    return route.fulfill({contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body});
   }
   return route.fulfill({contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:bytes});
  }
  return route.abort();
 });
 await page.route('**/firebase-v12-config.mjs',route=>route.fulfill({contentType:'application/javascript',body:'export const firebaseConfig='+JSON.stringify(CONFIG)}));
 await page.goto(ROOT+'/index-v12.html');
 await page.evaluate(key=>{
  const b={id:'PRIVATE_INTERNAL_ID',title:'嫌われる勇気',author:'岸見一郎・古賀史健',isbns:['9784478025819'],languages:['jpn'],type:'read',favorite:true,image:'',reading:{recommendedTagIds:['growth'],review:{text:'PRIVATE_MEMO_CANARY',visibility:'private',updatedAt:null},placement:{registrationOrder:0,position:null},addedAt:null}};
  const canvas=document.createElement('canvas');canvas.width=32;canvas.height=48;const dataUrl=canvas.toDataURL('image/jpeg');
  b.reading.coverOverride={kind:'device',bookId:b.id,mime:'image/jpeg',dataUrl,bytes:atob(dataUrl.split(',')[1]).length,width:32,height:48,updatedAt:'2026-11-25T00:00:00Z'};
  localStorage.setItem(key,JSON.stringify({version:12,books:[b],settings:{sort:'manual'},manualOrder:{read:[b.id],want:[]},sharing:{profile:{nickname:'PRIVATE_PROFILE',bio:'PRIVATE_BIO',approved:false},books:{}}}));
 },KEY);
 await page.reload();await connect(page);return network;
}
async function connect(page){await page.locator('#cloud-panel').evaluate(e=>e.open=true);await page.locator('#cloud-connect').click();await expect(page.locator('#cloud-login:enabled, #cloud-logout:enabled')).toHaveCount(1);}
async function signup(page,email,password='Emulator-'+crypto.randomUUID()+'!'){
 await page.locator('#cloud-email').fill(email);await page.locator('#cloud-password').fill(password);await page.locator('#cloud-register').click();
 await expect(page.locator('#cloud-user')).toContainText('未確認');await expect(page.locator('#cloud-status')).toContainText('登録しました');
}
async function verify(page,request,email,appName='hondana-v12'){
 const response=await request.get(AUTH+'/emulator/v1/projects/'+PROJECT+'/oobCodes');expect(response.ok()).toBe(true);
 const codes=(await response.json()).oobCodes;const entry=codes.find(c=>c.email===email&&c.requestType==='VERIFY_EMAIL');expect(entry).toBeTruthy();
 const verified=await page.evaluate(async({code,appName,SDK})=>{
  const app=await import(SDK+'firebase-app.js'),auth=await import(SDK+'firebase-auth.js?original');
  const a=auth.getAuth(app.getApp(appName));await auth.applyActionCode(a,code);await auth.reload(a.currentUser);await a.currentUser.getIdToken(true);return a.currentUser.emailVerified;
 },{code:entry.oobCode,appName,SDK});expect(verified).toBe(true);
}
function assertNoProductionCalls(network){expect(network.filter(raw=>['identitytoolkit.googleapis.com','securetoken.googleapis.com','firestore.googleapis.com'].includes(new URL(raw).hostname))).toEqual([]);}
test('real SDK signup verification reset login and session work without automatic Firestore access',async({page,request},info)=>{
 const network=await setup(page),email='sdk-'+info.project.name+'@example.test';
 const before=await page.evaluate(()=>hondanaV12Local.read());
 await signup(page,email);await expect(page.locator('#cloud-upload')).toBeDisabled();await verify(page,request,email);
 await page.locator('#cloud-refresh-user').click();await expect(page.locator('#cloud-user')).toContainText('確認済み');
 await page.locator('#cloud-logout').click();await page.locator('#cloud-email').fill(email);await page.locator('#cloud-reset').click();await expect(page.locator('#cloud-status')).toContainText('登録済みの場合');
 const codes=(await (await request.get(AUTH+'/emulator/v1/projects/'+PROJECT+'/oobCodes')).json()).oobCodes;
 const reset=codes.find(c=>c.email===email&&c.requestType==='PASSWORD_RESET');expect(reset).toBeTruthy();const changedPassword='Reset-'+crypto.randomUUID()+'!';
 await page.evaluate(async({SDK,code,password})=>{const a=await import(SDK+'firebase-app.js'),s=await import(SDK+'firebase-auth.js?original');await s.confirmPasswordReset(s.getAuth(a.getApp('hondana-v12')),code,password)},{SDK,code:reset.oobCode,password:changedPassword});
 await page.locator('#cloud-password').fill(changedPassword);await page.locator('#cloud-login').click();await expect(page.locator('#cloud-user')).toContainText(email);
 await page.reload();await connect(page);await expect(page.locator('#cloud-user')).toContainText(email);
 expect(network.filter(u=>new URL(u).port==='8089')).toEqual([]);expect(await page.evaluate(()=>hondanaV12Local.read())).toEqual(before);
 expect(await page.evaluate(()=>JSON.stringify({...localStorage}))).not.toContain(changedPassword);assertNoProductionCalls(network);
});
test('real SDK publishes privately, rejects verified other UID, and downloads without losing manual covers or notes',async({page,request},info)=>{
 const network=await setup(page),email='owner-'+info.project.name+'@example.test';await signup(page,email);await verify(page,request,email);
 await page.locator('#cloud-refresh-user').click();await expect(page.locator('#cloud-upload')).toBeEnabled();
 const before=await page.evaluate(()=>hondanaV12Local.read());await page.locator('#cloud-upload').click();await expect(page.locator('#cloud-preview')).toBeVisible();
 const download=page.waitForEvent('download');await page.locator('#cloud-export-backup').click();await download;
 for(const id of ['cloud-backup-check','cloud-account-check','cloud-confirm-check'])await page.locator('#'+id).check();await page.locator('#cloud-confirm').click();
 await expect(page.locator('#cloud-status')).toContainText('クラウドに1冊を保存しました');
 const remote=await page.evaluate(async({SDK})=>{const a=await import(SDK+'firebase-app.js'),s=await import(SDK+'firebase-firestore.js?original'),au=await import(SDK+'firebase-auth.js?original'),m=await import('/cloud/v12-firebase.mjs');const app=a.getApp('hondana-v12'),uid=au.getAuth(app).currentUser.uid;return {uid,...await m.createFirebaseStore(s,s.getFirestore(app)).read(uid,()=>{})}},{SDK});
 expect(remote.rows).toHaveLength(1);const text=JSON.stringify(remote.rows);for(const value of ['PRIVATE_','coverOverride','data:image','base64','review','sharing'])expect(text).not.toContain(value);
 const otherEmail='other-'+info.project.name+'@example.test';
 await page.evaluate(async({SDK,CONFIG,email,AUTH})=>{const a=await import(SDK+'firebase-app.js'),s=await import(SDK+'firebase-auth.js?original');const app=a.initializeApp(CONFIG,'other-reader'),auth=s.initializeAuth(app,{persistence:s.inMemoryPersistence});s.connectAuthEmulator(auth,AUTH,{disableWarnings:true});const c=await s.createUserWithEmailAndPassword(auth,email,'Other-'+crypto.randomUUID()+'!');await s.sendEmailVerification(c.user)},{SDK,CONFIG,email:otherEmail,AUTH});
 await verify(page,request,otherEmail,'other-reader');
 const denied=await page.evaluate(async({SDK,uid})=>{const a=await import(SDK+'firebase-app.js'),s=await import(SDK+'firebase-firestore.js?original');const db=s.initializeFirestore(a.getApp('other-reader'),{localCache:s.memoryLocalCache()});s.connectFirestoreEmulator(db,'127.0.0.1',8089);try{await s.getDocFromServer(s.doc(db,'users',uid,'sync','head'));return 'allowed'}catch(e){return e.code}},{SDK,uid:remote.uid});expect(denied).toBe('permission-denied');
 await page.locator('#cloud-download').click();await expect(page.locator('#cloud-preview')).toBeVisible();await page.locator('#cloud-confirm-check').check();await page.locator('#cloud-confirm').click();await expect(page.locator('#cloud-preview')).not.toBeVisible();expect(await page.evaluate(()=>hondanaV12Local.read())).toEqual(before);assertNoProductionCalls(network);
});
test('real SDK anonymous Firestore reads are denied without changing the local library',async({page})=>{
 const network=await setup(page),before=await page.evaluate(()=>hondanaV12Local.read());
 const code=await page.evaluate(async({SDK})=>{const a=await import(SDK+'firebase-app.js'),s=await import(SDK+'firebase-firestore.js?original');try{await s.getDocFromServer(s.doc(s.getFirestore(a.getApp('hondana-v12')),'users','not-a-real-user','sync','head'));return 'allowed'}catch(e){return e.code}},{SDK});
 expect(code).toBe('permission-denied');await expect(page.locator('#cloud-upload')).toBeDisabled();expect(await page.evaluate(()=>hondanaV12Local.read())).toEqual(before);assertNoProductionCalls(network);
});
