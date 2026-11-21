import {createHash} from 'node:crypto';
import {EconomyError} from './economy-engine.js';

export const SVR_EDITION=Object.freeze({id:'pack-svr-67',vehicle:'tz_lanza',limit:67,krw:15000,currency:'KRW',cash:10000000});
const fail=(code,message)=>{throw new EconomyError(code,message,409);};
const identity=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s);
const orderKey=id=>createHash('sha256').update(id).digest('hex');

/** Server-only checkout integration. No request payload can mark a payment verified.
 * A payment adapter must verify the provider's settled payment and write
 * verifiedPayments/{sha256(orderId)} with uid/product/amount/currency/status.
 * Stock must first be initialized by an audited migration of existing vehicles.
 * Reservations never auto-expire: late payment callbacks cannot oversell stock.
 * Release only after the provider confirms an order can no longer be charged.
 * 2026-11-20 : serial = payment-completion order. reserve() only holds one of the 67 places
 * (stock.holds[sha(orderId)]); fulfill() gives the lowest free serial 1..67 at that moment.
 * Older reservations that already carry a serial (stock.slots[n].state==='reserved') keep it.
 */
export class LimitedEditions {
 constructor(db,{now=Date.now}={}){this.db=db;this.now=now;}
 refs(uid,orderId){
  if(!identity(uid)||!identity(orderId))fail('invalid-order','주문 정보를 확인해 주세요.');
  const key=orderKey(orderId),db=this.db;
  return {key,stock:db.doc('limitedEditions/'+SVR_EDITION.id),order:db.doc('limitedOrders/'+key),payment:db.doc('verifiedPayments/'+key),account:db.doc('economyAccounts/'+uid),legacy:db.doc('players/'+uid),owner:db.doc('limitedOwners/'+SVR_EDITION.id+'_'+uid)};
 }
 async reserve(uid,orderId){
  const r=this.refs(uid,orderId);
  return this.db.runTransaction(async tx=>{
   const [stock,order,owner,account]=await Promise.all([tx.get(r.stock),tx.get(r.order),tx.get(r.owner),tx.get(r.account)]);
   if(order.exists){if(order.data().uid!==uid)fail('order-owner','다른 계정의 주문입니다.');return order.data();}
   if(!account.exists)fail('load-required','게임 계정을 먼저 불러와 주세요.');
   const s=stock.data();if(s?.ready!==true||s.limit!==67||s.auditComplete!==true)fail('limited-not-ready','한정판 판매를 준비 중입니다.');
   if(owner.exists)fail('already-owned','한정판 패키지는 계정당 1회입니다.');
   const holds={...(s.holds||{})};
   if(Object.keys(s.slots||{}).length+Object.keys(holds).length>=67)fail('sold-out','전 서버 67대가 모두 예약 또는 판매되었습니다.');
   const out={uid,orderId,product:SVR_EDITION.id,amount:SVR_EDITION.krw,currency:'KRW',serial:null,status:'reserved',createdAt:this.now()};
   holds[r.key]={uid,orderId,at:this.now()};
   tx.update(r.stock,{holds});tx.create(r.order,out);tx.create(r.owner,{orderId,serial:null,status:'reserved'});return out;
  });
 }
 async fulfill(uid,orderId){
  const r=this.refs(uid,orderId);
  return this.db.runTransaction(async tx=>{
   const [stock,order,payment,account,legacy,owner]=await Promise.all([tx.get(r.stock),tx.get(r.order),tx.get(r.payment),tx.get(r.account),tx.get(r.legacy),tx.get(r.owner)]);
   const o=order.data(),p=payment.data(),s=stock.data();
   if(!o||o.uid!==uid)fail('order-owner','주문 계정이 일치하지 않습니다.');
   if(o.status==='fulfilled')return {serial:o.serial,replayed:true};
   if(o.status!=='reserved'||!owner.exists||owner.data().orderId!==orderId)fail('order-state','유효한 예약이 아닙니다.');
   if(!p||p.status!=='verified'||p.uid!==uid||p.product!==SVR_EDITION.id||p.amount!==SVR_EDITION.krw||p.currency!=='KRW'||p.orderId!==orderId||!p.providerPaymentId)fail('payment-unverified','결제 확인이 필요합니다.');
   const paymentClaim=this.db.doc('limitedPaymentClaims/'+orderKey(p.providerPaymentId));
   if((await tx.get(paymentClaim)).exists)fail('payment-reused','이미 지급된 결제입니다.');
   if(s?.ready!==true||s.auditComplete!==true||s.limit!==67)fail('stock-conflict','한정판 예약 수량을 확인해 주세요.');
   const holds={...(s.holds||{})};let serial=0;
   if(Number.isInteger(o.serial)&&o.serial>=1&&o.serial<=67&&s.slots?.[o.serial]?.orderId===orderId&&s.slots[o.serial].state==='reserved')serial=o.serial;   // 예전 방식 예약
   else if(holds[r.key]?.orderId===orderId&&holds[r.key].uid===uid){for(let n=1;n<=67;n++)if(!s.slots?.[n]){serial=n;break;}}   // 결제 완료 순서
   if(!serial)fail('stock-conflict','한정판 예약 수량을 확인해 주세요.');
   delete holds[r.key];o.serial=serial;
   if(!account.exists)fail('load-required','게임 계정을 확인해 주세요.');
   const a=structuredClone(account.data());a.property??={};const cash=a.property.cash+10000000;
   if(!Number.isSafeInteger(cash)||cash<10000000)fail('balance-overflow','잔액을 확인해 주세요.');
   a.property.over??=[];if(a.property.over.length>=200)fail('capacity','예비 차고 공간을 먼저 확보해 주세요.');
   const vehicle={a:'svr67-'+o.serial,k:'tz_lanza',p:0,c:0x58b82d,edition:'pack-svr-67',serial:o.serial};
   a.property.over.push(vehicle);a.property.cash=cash;a.version++;a.updatedAt=this.now();a.packs??={};a.packs[SVR_EDITION.id]={orderId,serial:o.serial,at:this.now()};
   if(Buffer.byteLength(JSON.stringify(a))>750000)fail('account-too-large','계정 저장 공간을 확인해 주세요.');
   const slots={...s.slots,[o.serial]:{uid,orderId,state:'issued'}};
   tx.update(r.stock,{slots,holds});tx.set(r.account,a);tx.update(r.order,{status:'fulfilled',serial:o.serial,fulfilledAt:this.now()});tx.update(r.owner,{status:'fulfilled',serial:o.serial});
   tx.update(r.payment,{granted:true,serial:o.serial});
   tx.create(paymentClaim,{orderId,uid,serial:o.serial});
   tx.set(r.legacy,{save:{...(legacy.data()?.save||{}),property:a.property},economyVersion:a.version,lastSeen:this.now()},{mergeFields:['save','economyVersion','lastSeen']});
   return {serial:o.serial,vehicle,cash:10000000,replayed:false};
  });
 }
}
