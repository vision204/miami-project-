// Toss sandbox only. This module never writes game accounts or accepts live keys.
import {createHash} from 'node:crypto';
import {EconomyError} from './economy-engine.js';
import {PaymentRefunds} from './payment-refunds.js';
import fs from 'node:fs';
import {paymentExpiresAt,availableGrant} from './payment-validity.js';
const digest=s=>createHash('sha256').update(s).digest('hex');
const fail=(code,status=400)=>{throw new EconomyError(code,'테스트 결제 요청을 확인해 주세요. ('+code+')',status);};
export const TEST_PRODUCTS=Object.freeze(JSON.parse(fs.readFileSync(new URL('./payment-catalog.json',import.meta.url))).products.map(p=>Object.freeze(p)));
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
 constructor(db,{config=testConfiguration(),fetcher=fetch}={}){this.db=db;this.config=config;this.fetcher=fetcher;this.refunds=new PaymentRefunds(db,(...args)=>this.provider(...args));}
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
  if(data.action==='history'){
   const prefix=uid+':';const rows=await this.db.collection('paymentTestOrders').where('ownerPaidKey','>=',prefix).where('ownerPaidKey','<',prefix+'\uffff').orderBy('ownerPaidKey','desc').limit(20).get();
   return {orders:rows.docs.map(d=>d.data()).filter(o=>o.uid===uid).map(o=>({id:o.id,name:o.name,amount:o.amount,units:o.units,items:o.items||[],validityMonths:o.validityMonths||null,validUntil:o.validUntil||null,available:availableGrant(o),state:o.state,paidAt:o.fulfilledAt,refundedAt:o.refundedAt||null,refundState:o.refundState||null}))};
  }
  if(data.action==='refund')return {refund:await this.refunds.request(uid,data)};
  if(data.action==='refund-status')return {refund:await this.refunds.status(uid,data.orderId)};
  if(data.action==='create'){
   if(!/^[\w-]{16,80}$/.test(data.requestId||''))fail('invalid-request-id');
   const product=TEST_PRODUCTS.find(p=>p.id===data.productId);if(!product)fail('invalid-product');
   const id='test_'+digest(uid+':'+data.requestId).slice(0,48),ref=this.db.doc('paymentTestOrders/'+id);
   return this.db.runTransaction(async tx=>{const old=await tx.get(ref);if(old.exists){const o=old.data();if(o.productId!==product.id)fail('idempotency-conflict',409);const {paymentKey,...safe}=o;return safe;}
    const order={id,uid,productId:product.id,amount:product.amount,units:product.units,name:product.name,items:product.items,once:product.once,validityMonths:product.validityMonths,mode:'test',state:'CREATED',createdAt:Date.now(),expiresAt:Date.now()+1800000};tx.create(ref,order);return order;});
  }
  if(!/^test_[a-f0-9]{48}$/.test(data.orderId||''))fail('invalid-order');
  const ref=this.db.doc('paymentTestOrders/'+data.orderId),snap=await ref.get();
  if(!snap.exists||snap.data().uid!==uid)fail('order-not-found',404);const order=snap.data();
  if(data.action==='status'){const {paymentKey,...safe}=order;return safe;}
  if(data.action!=='confirm')fail('invalid-action');
  if(['REFUND_PENDING','REFUND_REVIEW','REFUNDED'].includes(order.state))return {state:order.state,mode:'test',orderId:order.id,replayed:true};
  const key=data.paymentKey;if(typeof key!=='string'||key.length<10||key.length>250||!/^[-\w]+$/.test(key)||data.amount!==order.amount)fail('invalid-confirmation');
  const claim=this.db.doc('paymentTestClaims/'+digest(key)),onceRef=this.db.doc('paymentTestPackageClaims/'+digest(uid+':'+order.productId));
  await this.db.runTransaction(async tx=>{const [s,c,once]=await Promise.all([tx.get(ref),tx.get(claim),order.once?tx.get(onceRef):Promise.resolve(null)]);const o=s.data();
   if(['REFUND_PENDING','REFUND_REVIEW','REFUNDED'].includes(o.state))return;
   if(o.paymentKey&&o.paymentKey!==key||c.exists&&c.data().orderId!==order.id)fail('payment-reused',409);
   if(!o.paymentKey&&Date.now()>o.expiresAt)fail('order-expired',409);
   // Reserve before calling the provider: simultaneous package orders cannot both be approved.
   if(order.once){if(once.exists&&once.data().orderId!==order.id)fail('package-already-claimed',409);if(!once.exists)tx.create(onceRef,{uid,productId:order.productId,orderId:order.id,at:Date.now()});}
   tx.set(ref,{paymentKey:key,state:o.state==='FULFILLED'?'FULFILLED':'CONFIRMING'},{merge:true});if(!c.exists)tx.create(claim,{orderId:order.id,uid});});
  // Query first so a response lost after approval can be recovered on retry.
  let payment=await this.provider(encodeURIComponent(key));
  if(payment.orderId!==order.id||payment.totalAmount!==order.amount||payment.currency!=='KRW')fail('payment-mismatch',409);
  if(payment.status==='IN_PROGRESS')payment=await this.provider('confirm',{paymentKey:key,orderId:order.id,amount:order.amount},digest('confirm:'+order.id));
  verifyPayment(payment,order,key);
  const wallet=this.db.doc('paymentTestWallets/'+uid),receipt=this.db.doc('paymentTestReceipts/'+order.id);
  return this.db.runTransaction(async tx=>{const [o,w,r]=await Promise.all([tx.get(ref),tx.get(wallet),tx.get(receipt)]);
   if(o.data().paymentKey!==key)fail('payment-mismatch',409);
   if(r.exists)return {state:o.data().state,mode:'test',orderId:order.id,replayed:true};
   if(['REFUND_PENDING','REFUND_REVIEW','REFUNDED'].includes(o.data().state))fail('refund-in-progress',409);
   const fulfilledAt=Date.now(),validUntil=paymentExpiresAt(fulfilledAt,order.validityMonths||12);
   tx.set(wallet,{...w.data(),units:(w.data()?.units||0)+order.units,updatedAt:fulfilledAt});
   tx.create(receipt,{uid,orderId:order.id,amount:order.amount,units:order.units,items:order.items||[],validUntil,mode:'test',at:fulfilledAt});
   tx.set(ref,{state:'FULFILLED',fulfilledAt,validUntil,ownerPaidKey:uid+':'+String(fulfilledAt).padStart(16,'0')+':'+order.id,grant:{total:order.units,remaining:order.units,used:0,held:0}},{merge:true});
   return {state:'FULFILLED',mode:'test',orderId:order.id,replayed:false};});
 }
}
