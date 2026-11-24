import {LIMITS,SyncError,requireThat,validateRows} from './v12-data.mjs';
const VERSION='13.4.0';
export async function connectFirebase(config,onUser){
 const [appSDK,authSDK,dbSDK]=await Promise.all([import(`https://www.gstatic.com/firebasejs/${VERSION}/firebase-app.js`),import(`https://www.gstatic.com/firebasejs/${VERSION}/firebase-auth.js`),import(`https://www.gstatic.com/firebasejs/${VERSION}/firebase-firestore.js`)]);
 const app=appSDK.initializeApp(config,'hondana-v12'),auth=authSDK.initializeAuth(app,{persistence:authSDK.browserSessionPersistence});const db=dbSDK.initializeFirestore(app,{localCache:dbSDK.memoryLocalCache()});
 const unsubscribe=authSDK.onAuthStateChanged(auth,user=>onUser(user?{uid:user.uid,email:user.email||'',verified:user.emailVerified}:null));
 const current=()=>{requireThat(!!auth.currentUser,'login-required');return auth.currentUser};
 return {store:createFirebaseStore(dbSDK,db),unsubscribe,
  signUp:async(email,password)=>{const c=await authSDK.createUserWithEmailAndPassword(auth,email,password);await authSDK.sendEmailVerification(c.user)},
  signIn:(email,password)=>authSDK.signInWithEmailAndPassword(auth,email,password),signOut:()=>authSDK.signOut(auth),
  verify:()=>authSDK.sendEmailVerification(current()),reset:email=>authSDK.sendPasswordResetEmail(auth,email),
  refresh:async()=>{const user=current();await authSDK.reload(user);await user.getIdToken(true);onUser({uid:user.uid,email:user.email||'',verified:user.emailVerified})}
 };
}
function deadline(guard,budget=30000){const end=Date.now()+budget;return async promise=>{guard();const remaining=end-Date.now();if(remaining<=0)throw new SyncError('timeout');let timer;try{return await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(new SyncError('timeout')),remaining))])}finally{clearTimeout(timer)}}}
function time(value){requireThat(value&&typeof value.toDate==='function','invalid-cloud');const date=value.toDate();requireThat(Number.isFinite(date.getTime()),'invalid-cloud');return date.toISOString()}
export function createFirebaseStore(sdk,db){
 const ref=(uid,...parts)=>sdk.doc(db,'users',uid,...parts),headRef=uid=>ref(uid,'sync','head'),manifest=(uid,gen)=>ref(uid,'snapshots',gen),bookRef=(uid,gen,key)=>ref(uid,'snapshots',gen,'books',key);
 async function head(uid,wait){const snap=await wait(sdk.getDocFromServer(headRef(uid)));if(!snap.exists())return null;const d=snap.data();requireThat(Object.keys(d).length===5&&d.schemaVersion===1&&Number.isInteger(d.revision)&&d.revision>0&&d.revision<2147483647&&/^[a-f0-9]{32}$/.test(d.generation)&&Number.isInteger(d.bookCount)&&d.bookCount>=0&&d.bookCount<=LIMITS.books,'invalid-cloud');return {schemaVersion:1,revision:d.revision,generation:d.generation,bookCount:d.bookCount,updatedAt:time(d.updatedAt)}}
 return {
  async peek(uid,guard){const wait=deadline(guard),h=await head(uid,wait);guard();return h},
  async read(uid,guard){const wait=deadline(guard),h=await head(uid,wait);guard();if(!h)return {head:null,rows:[]};const ms=await wait(sdk.getDocFromServer(manifest(uid,h.generation)));requireThat(ms.exists(),'incomplete-cloud');const m=ms.data();requireThat(Object.keys(m).length===5&&m.schemaVersion===1&&m.state==='committed'&&m.bookCount===h.bookCount&&m.baseRevision===h.revision-1,'incomplete-cloud');time(m.createdAt);const qs=await wait(sdk.getDocsFromServer(sdk.query(sdk.collection(db,'users',uid,'snapshots',h.generation,'books'),sdk.limit(LIMITS.books+1))));guard();const rows=qs.docs.map(d=>({key:d.id,data:d.data()}));requireThat(rows.length===h.bookCount,'incomplete-cloud');await validateRows(rows);return {head:h,rows}},
  async upload(uid,expected,rows,guard,progress=()=>{}){
   await validateRows(rows);guard();const wait=deadline(guard),gen=crypto.randomUUID().replaceAll('-','');let started=false;const keys=rows.map(r=>r.key);
   try{const h=await head(uid,wait);requireThat((h?.revision||0)===expected,'conflict');guard();progress('stage',0,rows.length);await wait(sdk.setDoc(manifest(uid,gen),{schemaVersion:1,baseRevision:expected,bookCount:rows.length,createdAt:sdk.serverTimestamp(),state:'staging'}));
    for(let offset=0;offset<rows.length;offset+=LIMITS.batch){guard();const batch=sdk.writeBatch(db);for(const row of rows.slice(offset,offset+LIMITS.batch))batch.set(bookRef(uid,gen,row.key),row.data);await wait(batch.commit());progress('stage',Math.min(rows.length,offset+LIMITS.batch),rows.length)}
    guard();started=true;progress('publish',rows.length,rows.length);await wait(sdk.runTransaction(db,async tx=>{guard();const hs=await tx.get(headRef(uid)),ms=await tx.get(manifest(uid,gen));requireThat((hs.exists()?hs.data().revision:0)===expected,'conflict');requireThat(ms.exists()&&ms.data().state==='staging'&&ms.data().bookCount===rows.length,'incomplete-cloud');guard();tx.update(manifest(uid,gen),{state:'committed'});tx.set(headRef(uid),{schemaVersion:1,revision:expected+1,generation:gen,bookCount:rows.length,updatedAt:sdk.serverTimestamp()})},{maxAttempts:LIMITS.attempts}));
    return {revision:expected+1,generation:gen,bookCount:rows.length};
   }catch(error){
    // Never race cleanup against a possibly committed head transaction.
    // A timed-out write can finish later, so publication is never assumed rolled back.
    if(!started){try{guard();const cleanupWait=deadline(guard,3000),ms=await cleanupWait(sdk.getDocFromServer(manifest(uid,gen)));if(ms.exists()&&ms.data().state==='staging'){for(let offset=0;offset<keys.length;offset+=LIMITS.batch){const batch=sdk.writeBatch(db);for(const key of keys.slice(offset,offset+LIMITS.batch))batch.delete(bookRef(uid,gen,key));await cleanupWait(batch.commit())}await cleanupWait(sdk.deleteDoc(manifest(uid,gen)))}}catch{}}
    if(started&&error.code!=='conflict')throw new SyncError('save-uncertain');throw error;
   }
  }
 };
}
