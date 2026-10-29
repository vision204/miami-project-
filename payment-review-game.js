// QA-only game world. Never reads/writes players, economyAccounts or multiplayer.
import {createHash} from 'node:crypto';
import {applyCommand,applyProgress,migrateAccount,EconomyError} from './economy-engine.js';
import {availableGrant} from './payment-validity.js';
const digest=s=>createHash('sha256').update(s).digest('hex');
const fail=(code,message,status=409)=>{throw new EconomyError(code,message,status);};
const allowed=new Set(['buy.home','buy.vehicle','vehicle.use','buy.penthouse','buy.hangar','buy.gun','buy.armor','buy.clothes','buy.luxury','buy.drone','buy.parts','buy.interior','buy.tuning','buy.skinbox','buy.food','buy.heal','buy.rental','buy.fuel']);
export class PaymentReviewGame{
 constructor(db,catalog,{now=Date.now}={}){this.db=db;this.catalog=catalog;this.now=now;}
 async execute(uid,request){
  if(!request||!['load','command','save'].includes(request.type)||!/^[\w-]{16,100}$/.test(request.id||''))fail('invalid-request-id','테스트 거래 식별자를 확인해 주세요.',400);
  if(request.type==='command'&&!allowed.has(request.command?.type))fail('review-command-disabled','결제 사용 검토에서는 상점 구매와 소유 차량 이용만 지원해요.',403);
  const hash=digest(JSON.stringify(request)),ref=this.db.doc('paymentTestGameAccounts/'+uid),receipt=this.db.doc('paymentTestGameTransactions/'+digest(uid+':'+request.id)),walletRef=this.db.doc('paymentTestWallets/'+uid);
  return this.db.runTransaction(async tx=>{
   const [saved,done,wallet,rows]=await Promise.all([tx.get(ref),tx.get(receipt),tx.get(walletRef),tx.get(this.db.collection('paymentTestOrders').where('uid','==',uid).limit(101))]);
   if(rows.docs.length>100)fail('review-order-limit','테스트 주문을 정리한 뒤 다시 연결해 주세요.');
   const now=this.now(),orders=rows.docs.map(d=>({ref:d.ref,order:d.data()})).filter(({order:o})=>o.uid===uid&&o.mode==='test'&&o.productId?.startsWith('cash-')&&availableGrant(o,now).units>0).sort((a,b)=>a.order.fulfilledAt-b.order.fulfilledAt||a.order.id.localeCompare(b.order.id));
   const proofs=await Promise.all(orders.map(({order:o})=>tx.get(this.db.doc('paymentTestReceipts/'+o.id))));
   for(let i=0;i<orders.length;i++){const o=orders[i].order,p=proofs[i].data();if(!p||p.uid!==uid||p.mode!=='test'||p.orderId!==o.id||p.units!==o.units||p.amount!==o.amount||p.validUntil!==o.validUntil||!Number.isSafeInteger(o.grant.remaining)||o.grant.remaining<0||o.grant.remaining>o.units)fail('review-credit-mismatch','승인된 테스트 지급 기록을 확인해야 해요.');}
   const units=orders.reduce((n,{order:o})=>n+o.grant.remaining,0),w=wallet.data();
   if(!Number.isSafeInteger(units)||units<0||(units>0&&(!Number.isSafeInteger(w?.units)||w.units<units)))fail('review-ledger-mismatch','테스트 잔액을 확인해야 해요.');
   if(saved.exists&&saved.data().mode!=='test')fail('review-account-mismatch','격리된 테스트 계정이 필요해요.',403);
   const account=saved.exists?saved.data():migrateAccount(null,this.catalog,now);account.property.cash=units;
   const view=(a,result={},replayed=false)=>({mode:'test',reviewGame:true,account:a,result,replayed,balance:{units:a.property.cash,scope:'sandbox-money-only',lots:orders.map(({order:o})=>({orderId:o.id,remaining:o.grant.remaining,used:o.grant.used,validUntil:o.validUntil}))}});
   if(done.exists){if(done.data().hash!==hash)fail('idempotency-conflict','이미 사용한 거래 식별자예요.');return view(account,done.data().result,true);}
   if(request.type==='load'){if(!saved.exists)tx.create(ref,{...account,mode:'test'});return view(account);}
   if(!saved.exists)fail('load-required','테스트 게임을 먼저 연결해 주세요.');
   if(request.version!==account.version)fail('version-conflict','다른 창에서 잔액이 바뀌었어요. 다시 확인해 주세요.');
   const out=request.type==='save'?applyProgress(account,request.save,this.catalog,now):applyCommand(account,request.command,this.catalog,{now});
   const spent=units-out.account.property.cash;
   if(!Number.isSafeInteger(spent)||spent<0||spent>units)fail('review-credit-forbidden','테스트 사용처에서는 재화를 새로 만들 수 없어요.',403);
   if(Buffer.byteLength(JSON.stringify(out.account))>750000)fail('account-too-large','테스트 저장 한도를 초과했어요.');
   let remaining=spent;const allocation=[];
   for(const {ref:orderRef,order:o}of orders){if(!remaining)break;const take=Math.min(remaining,o.grant.remaining);if(take){allocation.push({orderId:o.id,units:take,validUntil:o.validUntil});o.grant={...o.grant,remaining:o.grant.remaining-take,used:(o.grant.used||0)+take};tx.set(orderRef,{grant:o.grant},{merge:true});remaining-=take;}}
   if(remaining)fail('review-insufficient-credit','테스트 충전 잔액이 부족해요.');
   if(spent)tx.set(walletRef,{...w,units:w.units-spent,updatedAt:now});
   if(spent)out.account.reviewUse={type:request.command.type,spent,remaining:out.account.property.cash,at:now};
   tx.set(ref,{...out.account,mode:'test'});
   tx.create(receipt,{uid,mode:'test',hash,at:now,command:request.command||null,result:out.result||{},spent,allocation,version:out.account.version});
   return view(out.account,out.result||{});
  });
 }
}
