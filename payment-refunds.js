import {createHash,randomUUID} from 'node:crypto';
import {EconomyError} from './economy-engine.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const SEVEN_DAYS=7*86400000,NEVER=8000000000000000;
const error=(code,message,status=409)=>{throw new EconomyError(code,message,status);};
const reasons=new Set(['unused','wrong-content','minor','other']);
export function refundEligibility(order,receipt,wallet,now){
 if(order.mode!=='test'||!order.productId?.startsWith('cash-'))return 'unsupported-product';
 if(!receipt||receipt.uid!==order.uid||receipt.amount!==order.amount||receipt.units!==order.units)return 'receipt-review';
 const paidAt=order.fulfilledAt;
 if(!Number.isFinite(paidAt)||paidAt>now||now-paidAt>SEVEN_DAYS)return 'period-review';
 const grant=order.grant;
 if(!grant||grant.total!==order.units||grant.remaining!==order.units||grant.used!==0)return 'usage-review';
 if(!Number.isSafeInteger(wallet?.units)||wallet.units<grant.remaining)return 'ledger-review';
 return null;
}
export function validateRefundPayment(payment,order){
 if(payment?.orderId!==order.id||payment.paymentKey!==order.paymentKey||payment.totalAmount!==order.amount||payment.currency!=='KRW')error('refund-payment-mismatch','결제 정보 확인이 필요해요.');
}
export function fullCancellation(payment,amount){
 return payment.status==='CANCELED'&&payment.balanceAmount===0&&Array.isArray(payment.cancels)&&payment.cancels.length>0&&payment.cancels.every(c=>c.cancelStatus==='DONE')&&payment.cancels.reduce((sum,c)=>sum+c.cancelAmount,0)===amount;
}
export function publicRefund(refund){
 if(!refund)return null;
 return {id:refund.id,orderId:refund.orderId,state:refund.state,amount:refund.amount,currency:'KRW',requestedAt:refund.requestedAt,completedAt:refund.completedAt||null,reviewReason:refund.reviewReason||null};
}

// Test payment records are isolated from game balances. Never accepts live orders/keys.
// The same durable hold/cancel/finalize protocol is required by the future paid-game ledger.
export class PaymentRefunds{
 constructor(db,provider,{now=Date.now}={}){this.db=db;this.provider=provider;this.now=now;this.busy=false;}
 refs(orderId,uid){return {order:this.db.doc('paymentTestOrders/'+orderId),refund:this.db.doc('paymentTestRefunds/'+orderId),receipt:this.db.doc('paymentTestReceipts/'+orderId),wallet:this.db.doc('paymentTestWallets/'+uid),done:this.db.doc('paymentTestRefundReceipts/'+orderId)};}
 async request(uid,data){
  if(!/^test_[a-f0-9]{48}$/.test(data.orderId||''))error('invalid-order','주문을 확인해 주세요.',400);
  if(!/^[\w-]{16,100}$/.test(data.requestId||''))error('invalid-request-id','요청 식별자가 필요해요.',400);
  if(!reasons.has(data.reason))error('invalid-refund-reason','환불 사유를 선택해 주세요.',400);
  const refs=this.refs(data.orderId,uid),now=this.now();
  await this.db.runTransaction(async tx=>{
   const [o,r,w,p]=await Promise.all([tx.get(refs.order),tx.get(refs.refund),tx.get(refs.wallet),tx.get(refs.receipt)]);
   const order=o.data();if(!o.exists||order.uid!==uid)error('order-not-found','주문을 찾을 수 없어요.',404);
   if(r.exists)return;
   if(order.state!=='FULFILLED')error('refund-order-not-paid','승인 완료된 주문만 환불을 신청할 수 있어요.');
   if(!Number.isSafeInteger(order.amount)||order.amount<=0||!Number.isSafeInteger(order.units)||order.units<=0||!order.paymentKey)error('refund-ledger-review','결제 기록 확인이 필요해요.');
   const reviewReason=data.reason==='unused'?refundEligibility(order,p.data(),w.data(),now):'special-reason-review';
   const refund={id:'refund_'+hash(order.id).slice(0,40),orderId:order.id,uid,amount:order.amount,units:order.units,reason:data.reason,requestId:data.requestId,requestedAt:now,mode:'test',state:reviewReason?'REVIEW_REQUIRED':'PENDING',reviewReason:reviewReason||null,heldUnits:reviewReason?0:order.units,attempts:0,nextAttemptAt:reviewReason?NEVER:now,idempotencyKey:hash('smm2-test-refund:'+order.id)};
   if(!reviewReason){const wallet=w.data();tx.set(refs.wallet,{...wallet,units:wallet.units-order.units,heldUnits:(wallet.heldUnits||0)+order.units,updatedAt:now});order.grant={...order.grant,remaining:0,held:order.units};}
   tx.create(refs.refund,refund);tx.set(refs.order,{...order,state:reviewReason?'REFUND_REVIEW':'REFUND_PENDING',refundState:refund.state});
  });
  await this.process(data.orderId);
  return publicRefund((await refs.refund.get()).data());
 }
 async status(uid,orderId){
  if(!/^test_[a-f0-9]{48}$/.test(orderId||''))error('invalid-order','주문을 확인해 주세요.',400);
  const refs=this.refs(orderId,uid),o=await refs.order.get();if(!o.exists||o.data().uid!==uid)error('order-not-found','주문을 찾을 수 없어요.',404);
  return publicRefund((await refs.refund.get()).data());
 }
 async process(orderId){
  const refundRef=this.db.doc('paymentTestRefunds/'+orderId),now=this.now(),lease=randomUUID();
  const task=await this.db.runTransaction(async tx=>{
   const r=await tx.get(refundRef);if(!r.exists)return null;const refund=r.data();
   if(!['PENDING','RETRY','PROCESSING'].includes(refund.state)||refund.nextAttemptAt>now)return null;
   const o=await tx.get(this.db.doc('paymentTestOrders/'+orderId));if(!o.exists||o.data().uid!==refund.uid||o.data().mode!=='test'){tx.set(refundRef,{state:'REVIEW_REQUIRED',reviewReason:'order-review',nextAttemptAt:NEVER},{merge:true});return null;}
   tx.set(refundRef,{state:'PROCESSING',lease,attempts:refund.attempts+1,nextAttemptAt:now+60000},{merge:true});return {order:o.data(),refund:{...refund,attempts:refund.attempts+1}};
  });
  if(!task)return;
  try{
   const {order,refund}=task;let payment=await this.provider(encodeURIComponent(order.paymentKey));validateRefundPayment(payment,order);
   if(payment.status==='DONE'&&payment.balanceAmount===order.amount&&(!payment.cancels||payment.cancels.length===0)){
    payment=await this.provider(encodeURIComponent(order.paymentKey)+'/cancel',{cancelReason:'SMM2 테스트 미사용 게임머니 환불',cancelAmount:order.amount},refund.idempotencyKey);validateRefundPayment(payment,order);
   }
   if(!fullCancellation(payment,order.amount)){await this.review(orderId,lease,'provider-state-review');return;}
   const refs=this.refs(order.id,refund.uid);
   await this.db.runTransaction(async tx=>{
    const [r,o,w,d]=await Promise.all([tx.get(refs.refund),tx.get(refs.order),tx.get(refs.wallet),tx.get(refs.done)]);const current=r.data(),account=w.data(),saved=o.data();
    if(d.exists||current?.lease!==lease||current.state!=='PROCESSING')return;
    if(current.heldUnits!==order.units||saved?.grant?.held!==order.units||!Number.isSafeInteger(account?.heldUnits)||account.heldUnits<order.units){tx.set(refs.refund,{state:'REVIEW_REQUIRED',reviewReason:'hold-review',nextAttemptAt:NEVER},{merge:true});tx.set(refs.order,{state:'REFUND_REVIEW',refundState:'REVIEW_REQUIRED'},{merge:true});return;}
    const at=this.now();tx.set(refs.wallet,{...account,heldUnits:account.heldUnits-order.units,updatedAt:at});
    tx.set(refs.order,{state:'REFUNDED',refundState:'REFUNDED',refundedAt:at,grant:{...saved.grant,held:0,refunded:order.units}},{merge:true});
    tx.set(refs.refund,{state:'REFUNDED',completedAt:at,heldUnits:0,nextAttemptAt:NEVER,reviewReason:null},{merge:true});
    tx.create(refs.done,{uid:refund.uid,orderId:order.id,amount:order.amount,units:order.units,at,mode:'test'});
   });
  }catch(e){
   if(e?.code==='refund-payment-mismatch'){await this.review(orderId,lease,'provider-identity-review');return;}
   await this.db.runTransaction(async tx=>{const r=await tx.get(refundRef);const current=r.data();if(!r.exists||current.lease!==lease||current.state!=='PROCESSING')return;
    const exhausted=current.attempts>=8;tx.set(refundRef,{state:exhausted?'REVIEW_REQUIRED':'RETRY',reviewReason:exhausted?'retry-review':null,lastError:'provider-or-storage-unavailable',nextAttemptAt:exhausted?NEVER:this.now()+Math.min(300000,5000*2**Math.min(current.attempts,6))},{merge:true});
    if(exhausted)tx.set(this.db.doc('paymentTestOrders/'+orderId),{state:'REFUND_REVIEW',refundState:'REVIEW_REQUIRED'},{merge:true});
   });
  }
 }
 async review(orderId,lease,reason){
  const ref=this.db.doc('paymentTestRefunds/'+orderId);await this.db.runTransaction(async tx=>{const r=await tx.get(ref);if(r.data()?.lease!==lease||r.data()?.state!=='PROCESSING')return;tx.set(ref,{state:'REVIEW_REQUIRED',reviewReason:reason,nextAttemptAt:NEVER},{merge:true});tx.set(this.db.doc('paymentTestOrders/'+orderId),{state:'REFUND_REVIEW',refundState:'REVIEW_REQUIRED'},{merge:true});});
 }
 async tick(){
  if(this.busy)return;this.busy=true;try{const due=await this.db.collection('paymentTestRefunds').where('nextAttemptAt','<=',this.now()).limit(10).get();await Promise.allSettled(due.docs.map(d=>this.process(d.id)));}finally{this.busy=false;}
 }
}
