import fs from 'node:fs';
import {initializeApp,cert,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {EconomyStore} from './economy-store.js';
import {EconomyError} from './economy-engine.js';

export function createEconomyHttp({allowed=[],projectId='smm2-505da',testStore=null,testVerify=null,observe=()=>null}={}){
 let store=testStore,auth=null,error=null;const enabled=process.env.ECONOMY_ENABLED==='1';
 if(enabled&&!store){try{
  if(process.env.MIAMI_TEST_AUTH==='1'||process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('test authentication is forbidden for the production economy');
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(!raw&&!process.env.GOOGLE_APPLICATION_CREDENTIALS)throw Error('credentials missing');
  const credentials=raw?JSON.parse(raw):null;if(credentials&&credentials.project_id!==projectId)throw Error('project mismatch');
  const app=initializeApp({projectId,credential:credentials?cert(credentials):applicationDefault()},'economy');
  auth=getAuth(app);const db=getFirestore(app);db.settings({ignoreUndefinedProperties:true});
  const catalog=JSON.parse(fs.readFileSync(new URL('./economy-catalog.json',import.meta.url),'utf8'));store=new EconomyStore(db,catalog,{observe,coupons:JSON.parse(process.env.ECONOMY_COUPONS_JSON||'{}')});
 }catch{error='configuration-required';}}
 // Test injection is accepted only by explicitly constructed local test servers, never from requests.
 let available=!!testStore;const configured=!!store&&(enabled||!!testStore),limits=new Map(),balances=new Map();
 async function balance(uid){if(!available)return null;const cached=balances.get(uid);if(cached&&Date.now()-cached.at<60000)return cached.task||cached.value;const entry={at:Date.now(),value:null};entry.task=store.balance(uid).then(value=>{entry.value=value;delete entry.task;return value;}).catch(()=>{delete entry.task;return null;});balances.set(uid,entry);if(balances.size>10000)for(const [id,v]of balances)if(Date.now()-v.at>60000)balances.delete(id);return entry.task;}
 if(configured&&!testStore){const check=async()=>{try{available=(await store.db.doc('economyControl/config').get()).data()?.lockedVersion===1;}catch{available=false;}};check();setInterval(check,30000).unref();}
 const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
 async function handle(req,res){
  if(!req.url?.split('?')[0].startsWith('/economy/'))return false;
  const origin=req.headers.origin;if(origin){if(!allowed.includes(origin)){send(res,403,{ok:false,code:'origin-denied'});return true;}res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','POST, GET, OPTIONS');res.writeHead(204);res.end();return true;}
  if(req.url==='/economy/status'&&req.method==='GET'){send(res,200,{protocol:1,golfSets:1,fishing:1,enabled:enabled||!!testStore,configured,available,configuration:error});return true;}
  if(req.url!=='/economy/transaction'||req.method!=='POST'){send(res,404,{ok:false,code:'not-found'});return true;}
  if(!available){send(res,503,{ok:false,code:'economy-unavailable',message:'서버 거래 연결을 준비 중입니다.'});return true;}
  try{
   const token=/^Bearer (\S+)$/.exec(req.headers.authorization||'')?.[1];if(!token)throw new EconomyError('unauthorized','로그인이 필요합니다.',401);
   let uid;try{uid=testVerify?await testVerify(token):(await auth.verifyIdToken(token,true)).uid;}catch{throw new EconomyError('unauthorized','로그인을 다시 확인해 주세요.',401);}
   if(!uid)throw new EconomyError('unauthorized','로그인이 필요합니다.',401);
   const at=Date.now(),l=limits.get(uid);if(l&&at-l.at<60000&&l.n>=120)throw new EconomyError('rate-limit','거래 요청이 너무 빠릅니다.',429);limits.set(uid,l&&at-l.at<60000?{at:l.at,n:l.n+1}:{at,n:1});if(limits.size>10000)for(const [id,r]of limits)if(at-r.at>60000)limits.delete(id);
   if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new EconomyError('invalid-content-type','JSON 요청이 필요합니다.',415);
   let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>850000)throw new EconomyError('payload-too-large','요청이 너무 큽니다.',413);chunks.push(chunk);}
   let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new EconomyError('invalid-json','요청 형식을 확인해 주세요.');}
   // uid, price, cash, reward fields in the body do not select identity or authority.
   const out=await store.execute(uid,data);balances.set(uid,{at:Date.now(),value:out.account.property.cash});send(res,200,{ok:true,...out});
  }catch(e){const known=e instanceof EconomyError;send(res,known?e.status:503,{ok:false,code:known?e.code:'storage-unavailable',message:known?e.message:'서버 저장을 완료하지 못했습니다. 같은 거래로 다시 시도해 주세요.'});}
  return true;
 }
 return {fishingTick:()=>store?.fishing?.tick(),fishingState:uid=>available?store.fishing?.snapshot(uid):null,fishingAction:(uid,m)=>available?store.fishing?.action(uid,m):null,heistProtected:uid=>{const r=store?.heists?.get(uid);return !!r&&!['done','failed'].includes(r.phase);},heistTick:()=>store?.heists?.tick(),heistState:uid=>available?store.heists?.snapshot(uid):null,heistAction:(uid,m)=>available?store.heists?.action(uid,m):null,handle,status:()=>({protocol:1,enabled:enabled||!!testStore,configured,available,configuration:error}),balance,observe:(uid,s)=>{if(available&&uid){store.missions?.observe(uid,s);store.heists?.observe(uid,s);store.fishing?.observe(uid,s);}}};
}
