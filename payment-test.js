// Toss sandbox only. This module never writes game accounts or accepts live keys.
import {createHash} from 'node:crypto';
import {EconomyError} from './economy-engine.js';
const digest=s=>createHash('sha256').update(s).digest('hex');
const fail=(code,status=400)=>{throw new EconomyError(code,'테스트 결제 요청을 확인해 주세요. ('+code+')',status);};
export const TEST_PRODUCTS=Object.freeze([
 {id:'cash-starter',name:'스타터',amount:6500,units:4000000},
 {id:'cash-city',name:'시티',amount:12900,units:9000000},
 {id:'cash-explorer',name:'익스플로러',amount:39900,units:30000000},
 {id:'cash-skyline',name:'스카이라인',amount:74900,units:60000000},
 {id:'cash-prestige',name:'프레스티지',amount:149000,units:125000000}
]);
export function testConfiguration(env=process.env){
 const secret=env.TOSS_TEST_SECRET_KEY||'',client=env.TOSS_TEST_CLIENT_KEY||'';
 const users=(env.TOSS_TEST_UIDS||'').split(',').map(s=>s.trim()).filter(Boolean);
 const enabled=env.TOSS_TEST_ENABLED==='1'&&/^test_gsk_/.test(secret)&&/^test_gck_/.test(client)&&users.length>0;
 return {enabled,secret,client,users};
}
export function verifyPayment(payment,order,key){
 if(payment?.orderId!==order.id||payment.paymentKey!==key||payment.totalAmount!==order.amount||payment.currency!=='KRW'||payment.status!=='DONE'||payment.balanceAmount!==order.amount||payment.cancels?.length)fail('payment-mismatch',409);
}
export class TestPayments{
 constructor(db,{config=testConfiguration(),fetcher=fetch}={}){this.db=db;this.config=config;this.fetcher=fetcher;}
 authorize(uid){if(!this.config.enabled)fail('test-payment-disabled',503);if(!this.config.users.includes(uid))fail('test-account-required',403);}
 async provider(route,body,id){
  let response;
  try{response=await this.fetcher('https://api.tosspayments.com/v1/payments/'+route,{method:body?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(this.config.secret+':').toString('base64'),'Content-Type':'application/json',...(id?{'Idempotency-Key':id}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});}catch{fail('provider-unavailable',503);}
  if(!response.ok)fail('provider-rejected',502);
  try{return await response.json();}catch{fail('provider-unavailable',503);}
 }
 async execute(uid,data){
  this.authorize(uid);
  if(data.action==='config')return {mode:'test',clientKey:this.config.client,customerKey:digest('miami-test:'+uid).slice(0,40),products:TEST_PRODUCTS};
  if(data.action==='create'){
   if(!/^[\w-]{16,80}$/.test(data.requestId||''))fail('invalid-request-id');
   const product=TEST_PRODUCTS.find(p=>p.id===data.productId);if(!product)fail('invalid-product');
   const id='test_'+digest(uid+':'+data.requestId).slice(0,48),ref=this.db.doc('paymentTestOrders/'+id);
   return this.db.runTransaction(async tx=>{const old=await tx.get(ref);if(old.exists){const o=old.data();if(o.productId!==product.id)fail('idempotency-conflict',409);const {paymentKey,...safe}=o;return safe;}
    const order={id,uid,productId:product.id,amount:product.amount,units:product.units,name:product.name,mode:'test',state:'CREATED',createdAt:Date.now(),expiresAt:Date.now()+1800000};tx.create(ref,order);return order;});
  }
  if(!/^test_[a-f0-9]{48}$/.test(data.orderId||''))fail('invalid-order');
  const ref=this.db.doc('paymentTestOrders/'+data.orderId),snap=await ref.get();
  if(!snap.exists||snap.data().uid!==uid)fail('order-not-found',404);const order=snap.data();
  if(data.action==='status'){const {paymentKey,...safe}=order;return safe;}
  if(data.action!=='confirm')fail('invalid-action');
  const key=data.paymentKey;if(typeof key!=='string'||key.length<10||key.length>250||!/^[-\w]+$/.test(key)||data.amount!==order.amount)fail('invalid-confirmation');
  const claim=this.db.doc('paymentTestClaims/'+digest(key));
  await this.db.runTransaction(async tx=>{const [s,c]=await Promise.all([tx.get(ref),tx.get(claim)]);const o=s.data();
   if(o.paymentKey&&o.paymentKey!==key||c.exists&&c.data().orderId!==order.id)fail('payment-reused',409);
   if(!o.paymentKey&&Date.now()>o.expiresAt)fail('order-expired',409);
   tx.set(ref,{paymentKey:key,state:o.state==='FULFILLED'?'FULFILLED':'CONFIRMING'},{merge:true});if(!c.exists)tx.create(claim,{orderId:order.id,uid});});
  // Query first so a response lost after approval can be recovered on retry.
  let payment=await this.provider(encodeURIComponent(key));
  if(payment.orderId!==order.id||payment.totalAmount!==order.amount||payment.currency!=='KRW')fail('payment-mismatch',409);
  if(payment.status==='IN_PROGRESS')payment=await this.provider('confirm',{paymentKey:key,orderId:order.id,amount:order.amount},digest('confirm:'+order.id));
  verifyPayment(payment,order,key);
  const wallet=this.db.doc('paymentTestWallets/'+uid),receipt=this.db.doc('paymentTestReceipts/'+order.id);
  return this.db.runTransaction(async tx=>{const [o,w,r]=await Promise.all([tx.get(ref),tx.get(wallet),tx.get(receipt)]);
   if(o.data().paymentKey!==key)fail('payment-mismatch',409);
   if(r.exists)return {state:'FULFILLED',mode:'test',orderId:order.id,replayed:true};
   tx.set(wallet,{units:(w.data()?.units||0)+order.units,updatedAt:Date.now()});
   tx.create(receipt,{uid,orderId:order.id,amount:order.amount,units:order.units,mode:'test',at:Date.now()});
   tx.set(ref,{state:'FULFILLED',fulfilledAt:Date.now()},{merge:true});
   return {state:'FULFILLED',mode:'test',orderId:order.id,replayed:false};});
 }
}
