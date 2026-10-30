// Production paid grants live inside the authoritative economy account transaction.
// Browser snapshots cannot create, mutate or erase this ledger.
import {randomUUID,randomInt} from 'node:crypto';
import {EconomyError,assetSlots,skinsV2} from './economy-engine.js';
const fail=(code,message,status=409)=>{throw new EconomyError(code,message,status);};
const list=x=>Array.isArray(x)?x:[];
const owns=(a,id)=>list(a).includes(id);
const add=(o,k,id)=>{o[k]=[...new Set([...list(o[k]),id])];};
const lots=a=>Object.values(a.commerce?.lots||{});
const active=l=>!l.expired&&!l.refunded&&!l.refundHeld;
function invariant(a){const n=lots(a).reduce((s,l)=>s+l.remaining,0);if(!Number.isSafeInteger(n)||n<0||!Number.isSafeInteger(a.property.cash)||n>a.property.cash)fail('paid-ledger-review','유상 잔액 확인이 필요합니다.',503);}
export function grantCommerce(account,order,validUntil,now=Date.now()){
 const a=account;a.commerce??={v:1,lots:{}};a.commerce.lots??={};
 if(a.commerce.lots[order.id])return false;
 if(lots(a).filter(l=>!l.expired&&!l.refunded).length>=500)fail('paid-ledger-capacity','새 구매 전 기존 구매 내역을 확인해 주세요.');
 if(!Number.isSafeInteger(order.units)||order.units<=0||!Number.isSafeInteger(a.property.cash+order.units))fail('paid-ledger-review','잔액을 확인해 주세요.',503);
 a.property.cash+=order.units;
 a.commerce.lots[order.id]={id:order.id,productId:order.productId,paidAt:now,validUntil,total:order.units,remaining:order.units,used:0,usage:0,held:0,items:(order.items||[]).map(i=>({...i,remaining:i.quantity||1,claimed:0,grants:[]}))};
 a.version++;a.updatedAt=now;invariant(a);return true;
}
export function spendCommerce(a,spent){
 if(!spent)return [];
 if(!Number.isSafeInteger(spent)||spent<0)fail('paid-ledger-review','사용 금액 확인이 필요합니다.',503);
 let left=spent;const allocations=[];
 for(const l of lots(a).filter(active).sort((x,y)=>x.validUntil-y.validUntil||x.paidAt-y.paidAt)){
  const n=Math.min(left,l.remaining);l.remaining-=n;l.used+=n;left-=n;if(n)allocations.push({orderId:l.id,units:n});if(!left)break;
 }
 invariant(a);return allocations;
}
// Canceled race entry fees return to their original paid lots, never turn into free cash.
export function restoreCommerceSpend(a,credit,allocations=[],now=Date.now()){
 if(!Number.isSafeInteger(credit)||credit<0||!Number.isSafeInteger(a.property.cash+credit))fail('paid-ledger-review','반환 금액 확인이 필요합니다.',503);
 a.property.cash+=credit;let left=credit;
 for(const allocation of allocations){const n=Math.min(left,allocation.units);if(!n)continue;left-=n;const l=a.commerce?.lots?.[allocation.orderId];
  if(l&&active(l)&&now<l.validUntil&&l.used>=n){l.remaining+=n;l.used-=n;}else a.property.cash-=n;
 }invariant(a);
}
function releaseItems(a,l){
 const p=a.property;
 for(const i of l.items)for(const g of i.grants){
  if(g.asset){const slot=assetSlots(p).find(s=>s.r.a===g.asset);slot?.remove();}
  if(g.home&&!g.existing){p.homes=list(p.homes).filter(id=>id!==g.home);a.commerce.expiredHomes??=[];add(a.commerce,'expiredHomes',g.home);if(p.spawn===g.home)delete p.spawn;}
  if(g.hangar&&!g.existing){if(!lots(a).some(other=>other.id!==l.id&&active(other)&&other.items.some(it=>it.grants.some(x=>x.hangar===g.hangar&&!x.existing)))){p.hangars.owned=list(p.hangars?.owned).filter(id=>id!==g.hangar);a.commerce.expiredHangars??=[];add(a.commerce,'expiredHangars',g.hangar);}}
  if(g.armor&&g.expireArmor!==false)p.armor=Math.min(p.armor||0,g.previousArmor||0);
  if(g.skin){const sk=skinsV2(p);sk.stock[g.skin]=Math.max(0,(sk.stock[g.skin]||0)-(g.stock||0));if(!sk.stock[g.skin])delete sk.stock[g.skin];for(const w of g.equipped||[])if(sk.eq[w]===g.skin)delete sk.eq[w];if(!sk.stock[g.skin]&&!Object.values(sk.eq).includes(g.skin))sk.inv=list(sk.inv).filter(id=>id!==g.skin);}
 }
 for(const slot of assetSlots(p))if(slot.r.paidOrder===l.id)slot.remove();
}
export function sweepCommerce(a,now=Date.now()){
 if(!a.commerce)return false;let changed=false;
 for(const l of lots(a)){
  if(l.expired||l.refunded||l.refundHeld||now<l.validUntil)continue;
  invariant(a);a.property.cash-=l.remaining;l.expiredUnits=l.remaining;l.remaining=0;releaseItems(a,l);l.expired=true;l.expiredAt=now;changed=true;
 }
 if(changed){a.version++;a.updatedAt=now;}invariant(a);return changed;
}
export function validateCommerceAction(a,cmd){
 if(!a.commerce||!cmd)return;
 if(cmd.asset){const slot=assetSlots(a.property).find(s=>s.r.a===cmd.asset);if(slot){
  const id=slot.where.split(':').slice(1).join(':');
  if(slot.where.startsWith('plane:')&&a.commerce.expiredHangars?.includes(id)&&!owns(a.property.hangars?.owned,id)||slot.where.startsWith('car:')&&a.commerce.expiredHomes?.includes(id)&&!owns(a.property.homes,id))fail('paid-storage-expired','보관소 이용기간이 끝났어요. 보관소를 다시 구매하거나 소유한 보관소로 옮겨 주세요.');
 }}
}
export function observeCommerceAction(before,a,cmd){
 if(!a.commerce||!cmd)return;
 for(const l of lots(a).filter(active))for(const i of l.items)for(const g of i.grants){
  if(g.asset&&cmd.asset===g.asset)l.usage++;
  if(g.armor&&cmd.type==='buy.armor')g.expireArmor=false;
 }
 if(['skin.apply','skin.sell'].includes(cmd.type)){
  const id=cmd.skin||cmd.id;let left=1;
  for(const l of lots(a).filter(active).sort((x,y)=>x.validUntil-y.validUntil))for(const i of l.items)for(const g of i.grants){
   if(left&&g.skin===id&&g.stock>0){g.stock--;left--;l.usage++;if(cmd.type==='skin.apply'){g.equipped??=[];g.equipped.push(cmd.weapon);}}
  }
 }
 // Rebuying an expired facility restores stored unrelated assets; never erase them.
 if(cmd.type==='buy.home'&&before.commerce.expiredHomes?.includes(cmd.id)){
  a.property.cars[cmd.id]=before.property.cars?.[cmd.id]||[];a.commerce.expiredHomes=a.commerce.expiredHomes.filter(id=>id!==cmd.id);
 }
 if(cmd.type==='buy.hangar'&&before.commerce.expiredHangars?.includes(cmd.id)){
  a.property.hangars.planes[cmd.id]=before.property.hangars?.planes?.[cmd.id]||[];a.commerce.expiredHangars=a.commerce.expiredHangars.filter(id=>id!==cmd.id);
 }
}
export function commerceEligibility(a,order,now=Date.now()){
 const l=a.commerce?.lots?.[order.id];
 if(!l||l.productId!==order.productId||l.total!==order.units)return 'ledger-review';
 if(now<l.paidAt||now-l.paidAt>7*86400000||now>=l.validUntil)return 'period-review';
 if(!active(l)||l.remaining!==l.total||l.used!==0||l.usage!==0||l.items.some(i=>i.claimed))return 'usage-review';
 invariant(a);return null;
}
export function holdCommerce(a,order){
 const l=a.commerce.lots[order.id];invariant(a);a.property.cash-=l.remaining;l.held=l.remaining;l.remaining=0;l.refundHeld=true;a.version++;a.updatedAt=Date.now();invariant(a);
}
export function finishCommerceRefund(a,order){
 const l=a.commerce?.lots?.[order.id];if(!l?.refundHeld||l.held!==order.units)fail('refund-hold-review','환불 보류 잔액을 확인해야 합니다.',503);
 releaseItems(a,l);l.refunded=true;l.refundHeld=false;l.held=0;l.refundedAt=Date.now();a.version++;a.updatedAt=Date.now();invariant(a);
}
export function claimCommerce(a,catalog,cmd,{now=Date.now(),uuid=randomUUID,roll=randomInt}={}){
 const l=a.commerce?.lots?.[cmd.orderId],i=l?.items?.[cmd.item];
 if(!l||!active(l)||now>=l.validUntil||!Number.isInteger(cmd.item)||!i||i.remaining<1)fail('paid-item-unavailable','받을 수 있는 구성품이 없거나 이용기간이 끝났어요.');
 const p=a.property;let g={};
 if(['car','plane','boat'].includes(i.k)){
  const K=catalog.vehicles.find(k=>k.id===i.id&&k.type===i.k);if(!K)fail('paid-item-review','구성품을 확인해야 합니다.',503);
  const r={a:uuid(),k:K.id,p:0,c:K.paint??0xffffff,paidOrder:l.id,validUntil:l.validUntil};if(K.fuel)r.f=K.fuel.capacity;
  if(i.k==='car'){p.over??=[];if(p.over.length>=200)fail('capacity','차량 보관함을 정리해 주세요.');p.over.push(r);}
  if(i.k==='plane'){
   const h=catalog.hangars.find(h=>owns(p.hangars?.owned,h.id)&&(list(p.hangars?.planes?.[h.id]).length<h.slots));
   if(!h)fail('capacity','격납고 구성품을 먼저 받거나 격납고의 빈자리를 확보해 주세요.');p.hangars.planes??={};p.hangars.planes[h.id]??=[];r.id='air-'+(++p.hangars.seq|| (p.hangars.seq=1));p.hangars.planes[h.id].push(r);
  }
  if(i.k==='boat'){p.boats??={seq:0,boats:[]};if(list(p.boats.boats).length>=200)fail('capacity','선박 보관함을 정리해 주세요.');r.id='boat-'+(++p.boats.seq|| (p.boats.seq=1));r.col=r.c;p.boats.boats.push(r);}
  g={asset:r.a};
 }else if(i.k==='hangar'){
  const h=catalog.hangars.find(h=>h.id===i.id);if(!h)fail('paid-item-review','격납고 정보를 확인해야 합니다.',503);
  p.hangars??={owned:[],planes:{},seq:0};g={hangar:h.id,existing:owns(p.hangars.owned,h.id)};add(p.hangars,'owned',h.id);p.hangars.planes??={};p.hangars.planes[h.id]??=[];
 }else if(i.k==='home-choice'){
  const h=catalog.homes.find(h=>h.id===cmd.homeId&&/-penthouse-/.test(h.id)&&h.price>=i.minPrice&&h.price<=i.maxPrice);if(!h||owns(p.homes,h.id))fail('paid-home-choice','가격 범위 안의 미소유 펜트하우스를 골라 주세요.');
  g={home:h.id,existing:false};add(p,'homes',h.id);p.cars??={};p.cars[h.id]??=[];p.designs??={};p.designs[h.id]??='coastal';p.spawn??=h.id;
 }else if(i.k==='armor'){
  const armor=catalog.armor[i.id];if(!armor||(p.armor||0)>=armor.v)fail('paid-armor-unavailable','현재 방탄복을 사용한 뒤 구성품을 받을 수 있어요.');g={armor:armor.v,previousArmor:p.armor||0,expireArmor:true};p.armor=armor.v;
 }else if(i.k==='box'){
  const tier={epic:3,legendary:4}[i.guaranteedTier],pool=catalog.skins.filter(s=>s.t===tier);if(!pool.length)fail('paid-item-review','스킨 구성을 확인해야 합니다.',503);
  const skin=pool[roll(pool.length)],sk=skinsV2(p);sk.stock[skin.id]=(sk.stock[skin.id]||0)+1;add(sk,'inv',skin.id);g={skin:skin.id,stock:1,equipped:[]};
 }else fail('paid-item-review','지원하지 않는 구성품입니다.',503);
 i.remaining--;i.claimed++;i.grants.push(g);l.usage++;a.version++;a.updatedAt=now;return {account:a,result:{claimed:true,item:i.label,remaining:i.remaining,...g}};
}
export function publicCommerceLot(l){return l?{remaining:l.remaining,used:l.used,held:l.held,expired:!!l.expired,refunded:!!l.refunded,validUntil:l.validUntil,items:l.items.map((i,index)=>({index,k:i.k,id:i.id,label:i.label,remaining:i.remaining,claimed:i.claimed,grants:i.grants.map(g=>g.skin?{skin:g.skin}:g)}))}:null;}
