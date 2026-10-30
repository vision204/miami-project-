// Operational payments are separate from every sandbox collection and credential.
import fs from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {EconomyError} from './economy-engine.js';
import {paymentExpiresAt} from './payment-validity.js';
import {grantCommerce,sweepCommerce,commerceEligibility,holdCommerce,finishCommerceRefund,publicCommerceLot} from './payment-commerce.js';
const digest=s=>createHash('sha256').update(s).digest('hex'),NEVER=8000000000000000;
const fail=(code,message,status=409)=>{throw new EconomyError(code,message,status);};
export const LIVE_POLICY_VERSION='2026-10-30-paid-v1';
export const LIVE_PRODUCTS=Object.freeze(JSON.parse(fs.readFileSync(new URL('./payment-catalog.json',import.meta.url))).products.map(p=>Object.freeze(p)));
const methods=new Set(['카드','간편결제','문화상품권','도서문화상품권','게임문화상품권']);
const gifts=new Set(['문화상품권','도서문화상품권','게임문화상품권']);
export function liveConfiguration(env=process.env){
 const secret=env.TOSS_LIVE_SECRET_KEY||'',client=env.TOSS_LIVE_CLIENT_KEY||'',mid=env.TOSS_LIVE_MID||'';
 const configured=/^live_gsk_[\w-]+$/.test(secret)&&/^live_gck_[\w-]+$/.test(client)&&/^[\w-]{1,40}$/.test(mid);
 return {configured,secret,client,mid,checkoutEnabled:configured&&env.TOSS_LIVE_CHECKOUT_ENABLED==='1',approvalEnabled:configured&&env.TOSS_LIVE_APPROVAL_ENABLED==='1',publicEnabled:env.TOSS_LIVE_PUBLIC_ENABLED==='1'&&env.TOSS_LIVE_SALES_READY==='1',users:(env.TOSS_LIVE_UIDS||'').split(',').map(x=>x.trim()).filter(Boolean),giftEnabled:env.TOSS_LIVE_GIFT_ENABLED==='1'};
}
export function verifyLivePayment(p,o,key,{complete=true}={}){
 if(!p||p.mId!==o.mid||p.orderId!==o.id||p.paymentKey!==key||p.totalAmount!==o.amount||p.currency!=='KRW'||!['ABORTED','EXPIRED'].includes(p.status)&&!methods.has(p.method))fail('live-payment-mismatch','결제 정보 확인이 필요합니다.');
 if(complete&&(p.status!=='DONE'||p.balanceAmount!==o.amount||p.cancels?.length))fail('live-payment-state','결제 승인 상태를 확인해야 합니다.');
}
function fullCancel(p,amount){return p.status==='CANCELED'&&p.balanceAmount===0&&Array.isArray(p.cancels)&&p.cancels.length&&p.cancels.every(c=>c.cancelStatus==='DONE')&&p.cancels.reduce((n,c)=>n+c.cancelAmount,0)===amount;}
const safeRefund=r=>r?{id:r.id,orderId:r.orderId,state:r.state,amount:r.amount,requestedAt:r.requestedAt,completedAt:r.completedAt||null,reviewReason:r.reviewReason||null}:null;
export class LivePayments{
 constructor(db,{catalog,config=liveConfiguration(),fetcher=fetch,now=Date.now,onAccount=()=>{}}={}){this.db=db;this.catalog=catalog;this.config=config;this.fetcher=fetcher;this.now=now;this.onAccount=onAccount;this.busy=false;}
 authorizeNew(uid){if(!this.config.checkoutEnabled)fail('live-checkout-disabled','운영 결제창을 준비 중입니다.',503);if(!this.config.publicEnabled&&!this.config.users.includes(uid))fail('live-review-only','현재는 심사 계정으로만 결제창을 확인할 수 있어요.',403);}
 refs(id,uid){return {order:this.db.doc('paymentOrders/'+id),receipt:this.db.doc('paymentReceipts/'+id),refund:this.db.doc('paymentRefunds/'+id),done:this.db.doc('paymentRefundReceipts/'+id),account:this.db.doc('economyAccounts/'+uid),legacy:this.db.doc('players/'+uid),control:this.db.doc('economyControl/config')};}
 writeAccount(tx,refs,a,legacy){
  if(Buffer.byteLength(JSON.stringify(a))>750000)fail('paid-ledger-capacity','계정 저장 한도를 확인해 주세요.',503);
  tx.set(refs.account,a);tx.set(refs.legacy,{save:{...(legacy?.save||{}),property:a.property},economyVersion:a.version,lastSeen:this.now()},{mergeFields:['save','economyVersion','lastSeen']});
 }
 async provider(route,body,id){
  if(!this.config.configured||!/^live_gsk_/.test(this.config.secret))fail('live-key-required','운영 결제 연결을 확인해 주세요.',503);
  let r;try{r=await this.fetcher('https://api.tosspayments.com/v1/payments/'+route,{method:body?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(this.config.secret+':').toString('base64'),'Content-Type':'application/json',...(id?{'Idempotency-Key':id}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});}catch{fail('live-provider-unavailable','결제 상태를 확인 중입니다. 구매 내역에서 다시 확인해 주세요.',503);}
  if(!r.ok)fail('live-provider-rejected','결제대행사에서 요청을 완료하지 못했어요. 승인 상태를 다시 확인해 주세요.',502);
  try{return await r.json();}catch{fail('live-provider-unavailable','결제 응답을 확인하지 못했어요.',503);}
 }
 async execute(uid,data){
  if(!/^[\w-]{1,128}$/.test(uid))fail('unauthorized','로그인이 필요합니다.',401);
  if(data?.action==='config'){
   this.authorizeNew(uid);
   return {mode:'live',clientKey:this.config.client,customerKey:digest('smm2-live:'+uid).slice(0,40),mid:this.config.mid,policyVersion:LIVE_POLICY_VERSION,approvalEnabled:this.config.approvalEnabled,publicSales:this.config.publicEnabled,products:LIVE_PRODUCTS,homeChoices:this.catalog.homes.filter(h=>/-penthouse-/.test(h.id)&&h.price>=7000000&&h.price<=10000000).map(h=>({id:h.id,price:h.price})),giftEnabled:this.config.giftEnabled};
  }
  if(data?.action==='history'){
   const prefix=uid+':';if(data.before!==undefined&&(typeof data.before!=='string'||!data.before.startsWith(prefix)||data.before.length>210))fail('invalid-history-cursor','내역 요청을 확인해 주세요.',400);
   const rows=await this.db.collection('paymentOrders').where('ownerPaidKey','>=',prefix).where('ownerPaidKey','<',data.before||prefix+'\uffff').orderBy('ownerPaidKey','desc').limit(50).get(),a=(await this.db.doc('economyAccounts/'+uid).get()).data();if(a)sweepCommerce(a,this.now());const orders=rows.docs.map(d=>d.data()).filter(o=>o.uid===uid);
   return {mode:'live',homeChoices:this.catalog.homes.filter(h=>/-penthouse-/.test(h.id)&&h.price>=7000000&&h.price<=10000000).map(h=>({id:h.id,price:h.price})),nextCursor:orders.length===50?orders.at(-1).ownerPaidKey:null,orders:orders.map(o=>({id:o.id,name:o.name,amount:o.amount,units:o.units,createdAt:o.createdAt,paidAt:o.fulfilledAt||null,validUntil:o.validUntil||null,state:o.state,refundState:o.refundState||null,method:o.method||null,grant:publicCommerceLot(a?.commerce?.lots?.[o.id])}))};
  }
  if(data?.action==='create'){
   this.authorizeNew(uid);if(!/^[\w-]{16,80}$/.test(data.requestId||''))fail('invalid-request-id','주문 식별자를 확인해 주세요.',400);
   const p=LIVE_PRODUCTS.find(p=>p.id===data.productId);if(!p||p.amount<1||p.amount>100000||!Number.isSafeInteger(p.amount))fail('invalid-product','구매할 수 없는 상품입니다.',400);
   const id='live_'+digest(uid+':'+data.requestId).slice(0,48),refs=this.refs(id,uid),now=this.now();
   return this.db.runTransaction(async tx=>{const [s,a,control]=await Promise.all([tx.get(refs.order),tx.get(refs.account),tx.get(refs.control)]);if(control.data()?.lockedVersion!==1||!a.exists)fail('live-account-required','게임 계정 연결을 먼저 확인해 주세요.');
    if(s.exists){const o=s.data();if(o.uid!==uid||o.productId!==p.id)fail('idempotency-conflict','다른 주문으로 사용한 요청입니다.');return {id:o.id,name:o.name,amount:o.amount,state:o.state,mode:'live'};}
    if(Object.values(a.data().commerce?.lots||{}).filter(l=>!l.expired&&!l.refunded).length>=500)fail('paid-ledger-capacity','기존 구매 내역을 확인해 주세요.');
    const o={id,uid,mid:this.config.mid,productId:p.id,name:p.name,amount:p.amount,units:p.units,items:p.items,once:p.once,validityMonths:p.validityMonths,mode:'live',state:'CREATED',createdAt:now,expiresAt:now+1800000,nextPaymentCheckAt:NEVER,ownerPaidKey:uid+':'+String(now).padStart(16,'0')+':'+id};tx.create(refs.order,o);return {id,name:o.name,amount:o.amount,state:o.state,mode:'live'};});
  }
  if(!/^live_[a-f0-9]{48}$/.test(data?.orderId||''))fail('invalid-order','주문을 확인해 주세요.',400);
  const refs=this.refs(data.orderId,uid),s=await refs.order.get(),o=s.data();if(!s.exists||o.uid!==uid||o.mode!=='live'||o.mid!==this.config.mid)fail('order-not-found','주문을 찾을 수 없어요.',404);
  if(data.action==='accept'){
   this.authorizeNew(uid);if(data.terms!==true||data.privacy!==true||data.policyVersion!==LIVE_POLICY_VERSION)fail('purchase-consent-required','필수 동의 내용을 확인해 주세요.',400);
   await this.db.runTransaction(async tx=>{const r=await tx.get(refs.order),q=r.data();if(q.state!=='CREATED'||this.now()>q.expiresAt)fail('order-expired','새 주문으로 다시 진행해 주세요.');tx.set(refs.order,{consent:{uid,version:LIVE_POLICY_VERSION,terms:true,privacy:true,at:this.now(),offerHash:digest(JSON.stringify([q.productId,q.amount,q.units,q.items,q.validityMonths]))}},{merge:true});});return {accepted:true};
  }
  if(data.action==='confirm'){this.authorizeNew(uid);return this.confirm(o,data);}
  if(data.action==='refund')return {refund:await this.refund(o,data)};
  if(data.action==='refund-status')return {refund:safeRefund((await refs.refund.get()).data())};
  if(data.action==='status')return {id:o.id,state:o.state,amount:o.amount,mode:'live'};
  fail('invalid-action','요청을 확인해 주세요.',400);
 }
 async confirm(order,data,{recover=false}={}){
  const key=data.paymentKey,refs=this.refs(order.id,order.uid),now=this.now();
  if(typeof key!=='string'||!/^[-\w]{10,200}$/.test(key)||data.amount!==order.amount)fail('invalid-confirmation','결제 정보를 확인해 주세요.',400);
  const keyRef=this.db.doc('paymentClaims/'+digest(key)),onceRef=this.db.doc('paymentPackageClaims/'+digest(order.uid+':'+order.productId));
  await this.db.runTransaction(async tx=>{
   const [s,c,once]=await Promise.all([tx.get(refs.order),tx.get(keyRef),order.once?tx.get(onceRef):Promise.resolve(null)]),o=s.data();
   if(['FULFILLED','REFUND_PENDING','REFUND_REVIEW','REFUNDED'].includes(o.state))return;
   if(o.consent?.version!==LIVE_POLICY_VERSION||o.consent?.uid!==o.uid||!o.consent.terms||!o.consent.privacy)fail('purchase-consent-required','결제 전 필수 동의를 확인해 주세요.',400);
   if(o.paymentKey&&o.paymentKey!==key||c.exists&&c.data().orderId!==o.id)fail('payment-reused','이미 사용된 결제 정보입니다.');
   if(!o.paymentKey&&now>o.expiresAt)fail('order-expired','주문 유효기간이 끝났어요.');
   if(order.once){if(once?.exists&&once.data().active!==false&&once.data().orderId!==o.id)fail('package-already-claimed','이 패키지의 기존 주문을 확인해 주세요.');tx.set(onceRef,{uid:o.uid,orderId:o.id,active:true,at:now});}
   tx.set(refs.order,{paymentKey:key,state:'CONFIRMING',nextPaymentCheckAt:now+60000},{merge:true});if(!c.exists)tx.create(keyRef,{uid:o.uid,orderId:o.id});
  });
  const current=(await refs.order.get()).data();if(['FULFILLED','REFUND_PENDING','REFUND_REVIEW','REFUNDED'].includes(current.state))return {state:current.state,orderId:current.id,mode:'live',replayed:true};
  let p=await this.provider(encodeURIComponent(key));verifyLivePayment(p,order,key,{complete:false});
  if(['ABORTED','EXPIRED','CANCELED'].includes(p.status)){
   await this.db.runTransaction(async tx=>{const [s,r,once]=await Promise.all([tx.get(refs.order),tx.get(refs.receipt),order.once?tx.get(onceRef):Promise.resolve(null)]);if(r.exists||s.data()?.state!=='CONFIRMING')return;tx.set(refs.order,{state:'FAILED',nextPaymentCheckAt:NEVER},{merge:true});if(order.once&&once?.data()?.orderId===order.id)tx.set(onceRef,{active:false},{merge:true});});
   fail('live-payment-not-approved','결제 승인이 완료되지 않았어요. 새 주문으로 다시 시도해 주세요.');
  }
  if(p.status==='IN_PROGRESS'){
   if(recover||!this.config.approvalEnabled)fail('live-approval-paused','현재는 운영 결제창 확인 단계예요. 실제 결제 승인은 아직 열리지 않았어요.',409);
   if(gifts.has(p.method)&&!this.config.giftEnabled)fail('gift-review-pending','상품권 결제는 별도 심사 완료 후 이용할 수 있어요.');
   p=await this.provider('confirm',{paymentKey:key,orderId:order.id,amount:order.amount},digest('smm2-live-confirm:'+order.id));
  }
  verifyLivePayment(p,order,key);const paidAt=Date.parse(p.approvedAt);if(!Number.isFinite(paidAt)||paidAt>this.now()+300000||paidAt<order.createdAt-300000)fail('live-payment-date','승인 일시를 확인해야 합니다.');
  // The Korean storefront states calendar months in KST, including leap-day clamping.
  const validUntil=paymentExpiresAt(paidAt+9*3600000,order.validityMonths)-9*3600000;
  const out=await this.db.runTransaction(async tx=>{
   const [s,r,a,legacy,control]=await Promise.all([tx.get(refs.order),tx.get(refs.receipt),tx.get(refs.account),tx.get(refs.legacy),tx.get(refs.control)]),o=s.data();
   if(r.exists)return {state:o.state,orderId:o.id,mode:'live',replayed:true};
   if(!a.exists||control.data()?.lockedVersion!==1||o.paymentKey!==key||o.state!=='CONFIRMING')fail('live-ledger-review','승인 기록을 확인 중입니다.',503);
   const account=a.data();sweepCommerce(account,this.now());grantCommerce(account,order,validUntil,paidAt);sweepCommerce(account,this.now());this.writeAccount(tx,refs,account,legacy.data());
   tx.create(refs.receipt,{uid:order.uid,orderId:order.id,mode:'live',mid:order.mid,amount:order.amount,units:order.units,items:order.items,paidAt,validUntil,consent:o.consent,method:p.method,at:this.now()});
   tx.set(refs.order,{state:'FULFILLED',fulfilledAt:paidAt,validUntil,method:p.method,nextPaymentCheckAt:NEVER,ownerPaidKey:order.uid+':'+String(paidAt).padStart(16,'0')+':'+order.id},{merge:true});return {state:'FULFILLED',orderId:order.id,mode:'live',replayed:false,account};
  });if(out.account)this.onAccount(order.uid,out.account);return {state:out.state,orderId:out.orderId,mode:'live',replayed:out.replayed};
 }
 async refund(order,data){
  if(!/^[\w-]{16,100}$/.test(data.requestId||'')||!['unused','wrong-content','minor','other'].includes(data.reason))fail('invalid-refund-request','환불 요청을 확인해 주세요.',400);
  const refs=this.refs(order.id,order.uid),at=this.now();
  const account=await this.db.runTransaction(async tx=>{
   const [o,r,a,receipt,legacy,control]=await Promise.all([tx.get(refs.order),tx.get(refs.refund),tx.get(refs.account),tx.get(refs.receipt),tx.get(refs.legacy),tx.get(refs.control)]);if(r.exists)return null;const saved=o.data(),state=a.data();
   if(saved?.uid!==order.uid||saved.state!=='FULFILLED'||!a.exists||control.data()?.lockedVersion!==1)fail('refund-order-not-paid','승인된 주문을 확인해 주세요.');
   const p=receipt.data(),review=data.reason!=='unused'?'special-reason-review':!p||p.uid!==saved.uid||p.amount!==saved.amount||p.units!==saved.units||p.mid!==saved.mid?'receipt-review':commerceEligibility(state,saved,at);
   const refund={id:'refund_'+digest(saved.id).slice(0,40),orderId:saved.id,uid:saved.uid,amount:saved.amount,units:saved.units,reason:data.reason,requestId:data.requestId,mode:'live',state:review?'REVIEW_REQUIRED':'PENDING',reviewReason:review||null,requestedAt:at,attempts:0,nextAttemptAt:review?NEVER:at,idempotencyKey:digest('smm2-live-refund:'+saved.id)};
   if(!review){holdCommerce(state,saved);this.writeAccount(tx,refs,state,legacy.data());}tx.create(refs.refund,refund);tx.set(refs.order,{state:review?'REFUND_REVIEW':'REFUND_PENDING',refundState:refund.state},{merge:true});return !review?state:null;
  });if(account)this.onAccount(order.uid,account);await this.processRefund(order.id);return safeRefund((await refs.refund.get()).data());
 }
 async processRefund(id){
  const ref=this.db.doc('paymentRefunds/'+id),lease=randomUUID(),now=this.now();
  const task=await this.db.runTransaction(async tx=>{const r=await tx.get(ref),refund=r.data();if(!r.exists||!['PENDING','RETRY','PROCESSING'].includes(refund.state)||refund.nextAttemptAt>now)return null;const o=await tx.get(this.db.doc('paymentOrders/'+id));if(o.data()?.mode!=='live'||o.data()?.uid!==refund.uid||o.data()?.mid!==this.config.mid)fail('refund-ledger-review','환불 주문 확인이 필요합니다.',503);tx.set(ref,{state:'PROCESSING',lease,attempts:refund.attempts+1,nextAttemptAt:now+60000},{merge:true});return {order:o.data(),refund};});
  if(!task)return;
  try{
   const {order:o,refund:r}=task;let p=await this.provider(encodeURIComponent(o.paymentKey));verifyLivePayment(p,o,o.paymentKey,{complete:false});
   if(p.status==='DONE'&&p.balanceAmount===o.amount&&!p.cancels?.length){p=await this.provider(encodeURIComponent(o.paymentKey)+'/cancel',{cancelReason:'SMM2 미사용 상품 청약철회',cancelAmount:o.amount},r.idempotencyKey);verifyLivePayment(p,o,o.paymentKey,{complete:false});}
   if(!fullCancel(p,o.amount))fail('refund-state-review','결제 취소 상태 확인이 필요합니다.');
   const refs=this.refs(o.id,o.uid),onceRef=this.db.doc('paymentPackageClaims/'+digest(o.uid+':'+o.productId));
   const result=await this.db.runTransaction(async tx=>{const [s,a,d,legacy,once]=await Promise.all([tx.get(ref),tx.get(refs.account),tx.get(refs.done),tx.get(refs.legacy),o.once?tx.get(onceRef):Promise.resolve(null)]);if(d.exists||s.data()?.lease!==lease||s.data()?.state!=='PROCESSING')return null;const account=a.data();finishCommerceRefund(account,o);this.writeAccount(tx,refs,account,legacy.data());tx.create(refs.done,{orderId:o.id,uid:o.uid,amount:o.amount,units:o.units,mode:'live',at:this.now()});tx.set(ref,{state:'REFUNDED',completedAt:this.now(),nextAttemptAt:NEVER},{merge:true});tx.set(refs.order,{state:'REFUNDED',refundState:'REFUNDED',refundedAt:this.now()},{merge:true});if(o.once&&once?.data()?.orderId===o.id)tx.set(onceRef,{active:false},{merge:true});return account;});if(result)this.onAccount(o.uid,result);
  }catch(e){
   await this.db.runTransaction(async tx=>{const s=await tx.get(ref),r=s.data();if(r?.lease!==lease||r.state!=='PROCESSING')return;const review=['live-payment-mismatch','refund-state-review','refund-hold-review'].includes(e?.code)||r.attempts>=8;tx.set(ref,{state:review?'REVIEW_REQUIRED':'RETRY',reviewReason:review?'provider-or-ledger-review':null,nextAttemptAt:review?NEVER:this.now()+Math.min(300000,5000*2**r.attempts)},{merge:true});if(review)tx.set(this.db.doc('paymentOrders/'+id),{state:'REFUND_REVIEW',refundState:'REVIEW_REQUIRED'},{merge:true});});
  }
 }
 async tick(){
  if(this.busy||!this.config.configured)return;this.busy=true;try{
   const refunds=await this.db.collection('paymentRefunds').where('nextAttemptAt','<=',this.now()).limit(10).get();await Promise.allSettled(refunds.docs.map(d=>this.processRefund(d.id||d.ref.path.split('/').at(-1))));
   const orders=await this.db.collection('paymentOrders').where('nextPaymentCheckAt','<=',this.now()).limit(10).get();
   for(const d of orders.docs){const o=d.data();if(o.state!=='CONFIRMING'||!o.paymentKey)continue;try{await this.confirm(o,{paymentKey:o.paymentKey,amount:o.amount},{recover:true});}catch(e){
    const ref=this.db.doc('paymentOrders/'+o.id);await this.db.runTransaction(async tx=>{const s=await tx.get(ref),current=s.data();if(current?.state!=='CONFIRMING')return;const attempts=(current.paymentChecks||0)+1,review=attempts>=8&&e?.code!=='live-approval-paused';tx.set(ref,{paymentChecks:attempts,nextPaymentCheckAt:review?NEVER:this.now()+60000,...(review?{state:'PAYMENT_REVIEW'}:{})},{merge:true});});
   }}
  }finally{this.busy=false;}
 }
}
