import {awardFounder,FOUNDERS_PATH} from './founders.js';
import {createHash} from 'node:crypto';
import {applyCommand,applyProgress,migrateAccount,EconomyError} from './economy-engine.js';
import {MissionMonitor} from './economy-missions.js';
import {EconomyPlanner} from './economy-planner.js';
import{Fishing}from'./fishing.js';
import {Heists} from './heists.js';

export class EconomyStore {
 constructor(db,catalog,{observe=()=>null,huntProof=()=>null,coupons={}}={}){this.db=db;this.catalog=catalog;this.observe=observe;this.huntProof=huntProof;this.coupons=coupons;this.missions=new MissionMonitor(catalog.fleet);this.planner=new EconomyPlanner();this.planning=new Map();this.fishing=new Fishing();this.heists=new Heists({fleet:catalog.fleet});}
 async execute(uid,request){
  const starting=request?.command?.type==='heist.start';
  if(starting){try{this.heists.reserve(uid);}catch(e){throw new EconomyError('heist-busy',e.message,409);}}
  try{return await this.executeReserved(uid,request);}finally{if(starting)this.heists.release(uid);}
 }
 async executeReserved(uid,request){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid))throw new EconomyError('unauthorized','로그인이 필요합니다.',401);
  const id=request?.id;if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(id))throw new EconomyError('invalid-request-id','거래 식별자가 필요합니다.');
  const hash=createHash('sha256').update(JSON.stringify(request)).digest('hex');
  const ref=this.db.doc('economyAccounts/'+uid),receipt=ref.collection('receipts').doc(id),legacyRef=this.db.doc('players/'+uid),controlRef=this.db.doc('economyControl/config');
  const observation=this.observe(uid);let plan=null;if(request.command?.type==='job.start'){
   if(!['delivery','freight','taxi','race','air'].includes(request.command.job))throw new EconomyError('invalid-job','없는 일거리입니다.');
   const prior=await receipt.get();if(!prior.exists){
    const current=(await ref.get()).data();if(current?.heist?.active||current?.fishing?.active?.expiresAt>Date.now())throw new EconomyError('job-active','진행 중인 습격을 먼저 종료하세요.',409);if(!current||request.version!==current.version)throw new EconomyError('version-conflict','계정 거래 정보를 다시 불러와 주세요.',409);
    if(current.work?.active?.expiresAt>Date.now()||(current.work?.next?.[request.command.job]||0)>Date.now())throw new EconomyError('job-active','진행 중인 임무 또는 대기시간이 남았습니다.',409);
    if(!observation||Date.now()-observation.at>5000)throw new EconomyError('relay-required','멀티플레이 서버에 연결한 뒤 시작해 주세요.',409);
    if(this.planning.has(uid)&&this.planning.get(uid).id!==id)throw new EconomyError('planner-busy','이전 업무 경로를 준비 중입니다.',409);
    let task=this.planning.get(uid)?.task;if(!task){task=this.planner.plan(request.command.job,request.command,observation,parseInt(hash.slice(0,8),16));this.planning.set(uid,{id,task});}
    try{plan=await task;}finally{if(this.planning.get(uid)?.id===id)this.planning.delete(uid);}
   }
  }
  const output=await this.db.runTransaction(async tx=>{
   const [control,ledger,done,legacy,founders]=await Promise.all([tx.get(controlRef),tx.get(ref),tx.get(receipt),tx.get(legacyRef),tx.get(this.db.doc(FOUNDERS_PATH))]);
   if(control.data()?.lockedVersion!==1)throw new EconomyError('cutover-required','서버 거래 전환을 준비 중입니다.',503);
   let account=ledger.exists?ledger.data():migrateAccount(legacy.exists?legacy.data():null,this.catalog);
   if(done.exists){if(done.data().hash!==hash)throw new EconomyError('idempotency-conflict','이미 사용한 거래 식별자입니다.',409);return {account,result:done.data().result||{},replayed:true};}
   if(request.type==='load'){
    // A relay restart or a lost race result must not strand an entry fee.
    if(account.speedRace?.expiresAt<Date.now()){
     account.property.cash+=1000;delete account.speedRace;account.version++;account.updatedAt=Date.now();
     tx.set(ref,account);tx.set(legacyRef,{save:{...(legacy.data()?.save||{}),property:account.property},economyVersion:account.version},{mergeFields:['save','economyVersion']});
    }
    const granted=awardFounder(account,uid,founders.data(),this.catalog);
    if(granted&&ledger.exists)tx.set(ref,account);
    if(granted)tx.set(legacyRef,{save:{...(legacy.data()?.save||{}),property:account.property},economyVersion:account.version},{mergeFields:['save','economyVersion']});
    if(!ledger.exists){tx.create(this.db.doc('economyMigrations/'+uid),{at:Date.now(),source:legacy.exists?legacy.data():null});tx.create(ref,account);}
    return {account,result:{},replayed:false};
   }
   if(!ledger.exists)throw new EconomyError('load-required','계정 원장을 먼저 불러와 주세요.',409);
   if(account.speedRace&&['job.start','heist.start','fishing.start','vehicle.use'].includes(request.command?.type))throw new EconomyError('race-active','스피드레이싱을 먼저 마쳐 주세요.',409);
   if(request.version!==account.version)throw new EconomyError('version-conflict','다른 창에서 거래가 변경되었습니다. 다시 확인해 주세요.',409);
   let out;
   if(request.type==='save')out=applyProgress(account,request.save,this.catalog);
   else out=applyCommand(account,request.command,this.catalog,{plan,proof:this.missions.proof(uid,request.command?.run),heistProof:this.heists.proof(uid,request.command?.run),fishingProof:this.fishing.proof(uid,request.command?.run),huntProof:this.huntProof(uid,request.command?.animal),coupons:this.coupons,observation:this.observe(uid)});
   account=out.account;
   if(Buffer.byteLength(JSON.stringify(account))>750000)throw new EconomyError('account-too-large','계정 저장 한도를 관리자에게 확인해 주세요.',409);
   tx.set(ref,account);
   tx.create(receipt,{hash,at:Date.now(),version:account.version,result:out.result||{}});
   const save=out.save||{...(legacy.data()?.save||{}),property:account.property};
   // Keep the old document as a read-compatible projection. Clients cannot write this field.
   tx.set(legacyRef,{save,work:account.work||{},economyVersion:account.version,lastSeen:Date.now()},{mergeFields:['save','work','economyVersion','lastSeen']});
   return {account,result:out.result||{},replayed:false};
  });
  if(request.command?.type==='job.start'&&output.account.work?.active)this.missions.start(uid,output.account.work.active);
  if(request.command?.type==='job.settle')this.missions.clear(uid,request.command.run);
  if(request.command?.type==='heist.start'&&output.account.heist?.active?.id===request.command.run)this.heists.start(uid,output.account.heist.active,this.observe(uid),output.account.property?.armor||0);
  if(request.command?.type==='heist.settle')this.heists.clear(uid,request.command.run);
  if(request.command?.type==='fishing.start'&&output.account.fishing?.active?.id===request.command.run&&!output.replayed)this.fishing.start(uid,output.account.fishing.active);
  if(request.command?.type==='fishing.settle')this.fishing.clear(uid,request.command.run);
  return output;
 }
 async balance(uid){const s=await this.db.doc('economyAccounts/'+uid).get();return s.exists?s.data().property?.cash:null;}
}
