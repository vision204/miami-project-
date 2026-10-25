import assert from 'node:assert/strict';
import {PaymentRefunds,refundEligibility} from './payment-refunds.js';
import {TestPayments} from './payment-test.js';
class DB{
 constructor(){this.map=new Map();this.tail=Promise.resolve();}
 snap(path){const data=this.map.get(path);return {exists:data!==undefined,id:path.split('/').at(-1),data:()=>structuredClone(data)};}
 doc(path){return {path,id:path.split('/').at(-1),get:async()=>this.snap(path)};}
 collection(name){const filters=[];let max=Infinity,sort=null;const query={where:(key,op,value)=>{filters.push([key,op,value]);return query;},orderBy:(key,dir)=>{sort=[key,dir];return query;},limit:n=>{max=n;return query;},get:async()=>{let rows=[...this.map].filter(([p])=>p.startsWith(name+'/')&&p.split('/').length===2).map(([p,d])=>({p,d}));rows=rows.filter(({d})=>filters.every(([k,op,v])=>op==='=='?d[k]===v:op==='<='?d[k]<=v:op==='>='?d[k]>=v:d[k]<v));if(sort)rows.sort((a,b)=>(a.d[sort[0]]<b.d[sort[0]]?-1:1)*(sort[1]==='desc'?-1:1));return {docs:rows.slice(0,max).map(r=>this.snap(r.p))};}};return query;}
 runTransaction(fn){const task=this.tail.then(async()=>{const writes=[];const result=await fn({get:r=>Promise.resolve(this.snap(r.path)),create:(r,d)=>{assert(!this.map.has(r.path));writes.push([r.path,d]);},set:(r,d,opt)=>writes.push([r.path,opt?.merge?{...this.map.get(r.path),...d}:d])});for(const[p,d]of writes)this.map.set(p,structuredClone(d));return result;});this.tail=task.catch(()=>{});return task;}
}
let now=Date.now(),seq=0;
function fixture({uid='qa',age=0,used=0,remaining=100,reason='unused'}={}){
 const db=new DB(),id='test_'+String(++seq).padStart(48,'0'),order={id,uid,mode:'test',productId:'cash-starter',name:'스타터',state:'FULFILLED',amount:6500,units:100,paymentKey:'payment_key_'+seq,fulfilledAt:now-age,grant:{total:100,remaining,used,held:0},ownerPaidKey:uid+':'+now+':'+id};
 db.map.set('paymentTestOrders/'+id,order);db.map.set('paymentTestWallets/'+uid,{units:100,heldUnits:0});db.map.set('paymentTestReceipts/'+id,{uid,amount:6500,units:100,at:now-age});
 let calls=0,loseResponse=false,networkFail=false,wrong=false;let payment={orderId:id,paymentKey:order.paymentKey,totalAmount:6500,currency:'KRW',status:'DONE',balanceAmount:6500,cancels:null};const idempotency=[];
 const provider=async(route,body,key)=>{if(networkFail)throw Error('network');if(wrong)return {...payment,orderId:'foreign'};if(body){calls++;idempotency.push(key);payment={...payment,status:'CANCELED',balanceAmount:0,cancels:[{cancelAmount:6500,cancelStatus:'DONE'}]};if(loseResponse){loseResponse=false;throw Error('lost response');}}return structuredClone(payment);};
 const svc=new PaymentRefunds(db,provider,{now:()=>now}),data={orderId:id,reason,requestId:'request_1234567890123'};
 return {db,id,order,svc,data,provider,calls:()=>calls,keys:idempotency,lose:()=>{loseResponse=true;},network:v=>{networkFail=v;},wrong:()=>{wrong=true;},payment:p=>{payment={...payment,...p};}};
}
{
 const f=fixture();const out=await f.svc.request('qa',f.data);assert.equal(out.state,'REFUNDED');assert.equal(f.calls(),1);
 const [a,b]=await Promise.all([f.svc.request('qa',f.data),f.svc.request('qa',{...f.data,requestId:'request_other_1234567'})]);assert.equal(a.state,'REFUNDED');assert.equal(b.state,'REFUNDED');assert.equal(f.calls(),1);assert.deepEqual(f.db.map.get('paymentTestWallets/qa'),{units:0,heldUnits:0,updatedAt:now});
 assert.equal(f.db.map.get('paymentTestOrders/'+f.id).grant.refunded,100);assert.equal([...f.db.map.keys()].filter(k=>k.startsWith('paymentTestRefundReceipts/')).length,1);assert(!JSON.stringify(out).includes('payment_key'));
 await assert.rejects(()=>f.svc.request('foreign',f.data),e=>e.status===404);await assert.rejects(()=>f.svc.status('foreign',f.id),e=>e.status===404);
 const service=new TestPayments(f.db,{config:{enabled:true,users:['qa']},fetcher:()=>{throw Error('must not call provider');}});assert.equal((await service.execute('qa',{action:'confirm',orderId:f.id,amount:6500,paymentKey:f.order.paymentKey})).state,'REFUNDED');assert.equal((await service.execute('qa',{action:'history'})).orders[0].state,'REFUNDED');
}
for(const input of [{used:1,remaining:99},{age:7*86400000+1},{reason:'minor'},{reason:'wrong-content'}]){const f=fixture(input);assert.equal((await f.svc.request('qa',f.data)).state,'REVIEW_REQUIRED');assert.equal(f.calls(),0);assert.equal(f.db.map.get('paymentTestWallets/qa').units,100);}
{
 const f=fixture({age:7*86400000});assert.equal(refundEligibility(f.order,f.db.map.get('paymentTestReceipts/'+f.id),{units:100},now),null);
 f.lose();assert.equal((await f.svc.request('qa',f.data)).state,'RETRY');assert.equal(f.db.map.get('paymentTestWallets/qa').units,0);assert.equal(f.db.map.get('paymentTestWallets/qa').heldUnits,100);
 now+=20000;const restarted=new PaymentRefunds(f.db,f.provider,{now:()=>now});await restarted.tick();assert.equal((await restarted.status('qa',f.id)).state,'REFUNDED');assert.equal(f.calls(),1);assert.equal(f.db.map.get('paymentTestWallets/qa').heldUnits,0);
}
{
 const f=fixture();f.network(true);assert.equal((await f.svc.request('qa',f.data)).state,'RETRY');f.network(false);now+=20000;await f.svc.tick();assert.equal((await f.svc.status('qa',f.id)).state,'REFUNDED');assert.equal(f.calls(),1);
}
{
 const f=fixture();f.wrong();assert.equal((await f.svc.request('qa',f.data)).state,'REVIEW_REQUIRED');assert.equal(f.calls(),0);assert.equal(f.db.map.get('paymentTestWallets/qa').heldUnits,100);
}
{
 const f=fixture();f.payment({status:'PARTIAL_CANCELED',balanceAmount:5000,cancels:[{cancelAmount:1500,cancelStatus:'DONE'}]});assert.equal((await f.svc.request('qa',f.data)).state,'REVIEW_REQUIRED');assert.equal(f.calls(),0);
}
{
 const f=fixture();f.network(true);await f.svc.request('qa',f.data);for(let i=0;i<8;i++){now+=400000;await f.svc.tick();}assert.equal((await f.svc.status('qa',f.id)).state,'REVIEW_REQUIRED');assert.equal(f.db.map.get('paymentTestWallets/qa').heldUnits,100);
}
console.log('PASS refunds: owner checks, seven-day/usage policy, one cancellation/credit recovery, parallel duplicates, lost response, restart retry, pending holds, provider mismatch, partial cancellation review, retry exhaustion, history and no confirm regrant');
