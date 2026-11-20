// 2026-11-20 : 한정판 시리얼 = 결제 완료 순서 테스트 (가짜 DB) · node server/test-limited-serial.mjs
import {LimitedEditions} from './limited-editions.js';
import {createHash} from 'node:crypto';
const store=new Map();const clone=v=>v===undefined?undefined:structuredClone(v);
const db={doc:p=>({path:p}),async runTransaction(fn){const w=[];const tx={get:async r=>({exists:store.has(r.path),data:()=>clone(store.get(r.path))}),
 update:(r,v)=>w.push(()=>{if(!store.has(r.path))throw Error('no doc '+r.path);store.set(r.path,{...store.get(r.path),...clone(v)});}),
 create:(r,v)=>w.push(()=>{if(store.has(r.path))throw Error('exists '+r.path);store.set(r.path,clone(v));}),
 set:(r,v)=>w.push(()=>store.set(r.path,{...(store.get(r.path)||{}),...clone(v)}))};
 const out=await fn(tx);for(const f of w)f();return out;}};
const key=id=>createHash('sha256').update(id).digest('hex');
const L=new LimitedEditions(db,{now:()=>1});
store.set('limitedEditions/pack-svr-67',{ready:true,limit:67,auditComplete:true,slots:{}});
const acct=uid=>store.set('economyAccounts/'+uid,{version:1,property:{cash:0,over:[]}});
const pay=(uid,o)=>store.set('verifiedPayments/'+key(o),{status:'verified',uid,product:'pack-svr-67',amount:18000,currency:'KRW',orderId:o,providerPaymentId:'p-'+o});
const ok=(c,m)=>{if(!c){console.log('FAIL',m);process.exitCode=1;}else console.log('ok',m);};
for(const u of ['A','B','C'])acct(u);
const ra=await L.reserve('A','oA'),rb=await L.reserve('B','oB'),rc=await L.reserve('C','oC');
ok(ra.serial===null&&rb.serial===null,'reserve gives no serial yet');
pay('C','oC');pay('A','oA');pay('B','oB');
const fc=await L.fulfill('C','oC'),fa=await L.fulfill('A','oA'),fb=await L.fulfill('B','oB');
ok(fc.serial===1&&fa.serial===2&&fb.serial===3,'serial = payment completion order (C1 A2 B3): '+[fc.serial,fa.serial,fb.serial]);
ok(fc.vehicle.a==='svr67-1','asset id svr67-1');
const rep=await L.fulfill('C','oC');ok(rep.replayed&&rep.serial===1,'replay keeps serial');
const st=store.get('limitedEditions/pack-svr-67');ok(Object.keys(st.holds).length===0&&Object.keys(st.slots).length===3,'holds cleared, 3 slots issued');
ok(store.get('limitedOrders/'+key('oA')).serial===2,'order doc has serial');
// legacy reservation with serial keeps its number
store.set('limitedEditions/pack-svr-67',{...st,slots:{...st.slots,10:{uid:'D',orderId:'oD',state:'reserved'}}});acct('D');
store.set('limitedOrders/'+key('oD'),{uid:'D',orderId:'oD',serial:10,status:'reserved'});store.set('limitedOwners/pack-svr-67_D',{orderId:'oD',serial:10,status:'reserved'});pay('D','oD');
ok((await L.fulfill('D','oD')).serial===10,'legacy reserved serial kept');
acct('E');await L.reserve('E','oE');pay('E','oE');ok((await L.fulfill('E','oE')).serial===4,'next completion gets 4 (skips legacy 10)');
// cap
const s2=store.get('limitedEditions/pack-svr-67');const slots={};for(let n=1;n<=67;n++)slots[n]={state:'issued'};store.set('limitedEditions/pack-svr-67',{...s2,slots,holds:{}});
acct('F');try{await L.reserve('F','oF');ok(false,'sold out');}catch(e){ok(e.code==='sold-out'&&/전 서버 67대/.test(e.message),'sold out at 67: '+e.message);}
// holds count toward cap
const s3=store.get('limitedEditions/pack-svr-67');const sl={};for(let n=1;n<=66;n++)sl[n]={state:'issued'};store.set('limitedEditions/pack-svr-67',{...s3,slots:sl,holds:{x:{uid:'x',orderId:'x'}}});
acct('G');try{await L.reserve('G','oG');ok(false,'hold counts');}catch(e){ok(e.code==='sold-out','pending hold counts toward 67');}
// unpaid cannot fulfill
store.set('limitedEditions/pack-svr-67',{ready:true,limit:67,auditComplete:true,slots:{}});acct('H');await L.reserve('H','oH');
try{await L.fulfill('H','oH');ok(false,'unpaid');}catch(e){ok(e.code==='payment-unverified','unpaid rejected');}
