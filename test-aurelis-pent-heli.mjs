import fs from 'node:fs';import assert from 'node:assert/strict';import{applyCommand,migrateAccount}from'./economy-engine.js';
// 2026-10-25 · AURELIS 펜트하우스(118~123층) 헬기 : 층마다 1대, 'aurelis-ph-<층>' 열쇠 · 옥상 공용 패드에서 호출 · 기사 $500
const catalog=JSON.parse(fs.readFileSync(new URL('./economy-catalog.json',import.meta.url)));const K=catalog.vehicles.find(k=>k.id==='hc_skylark');
const acct=(cash,floors=[118])=>migrateAccount({save:{property:{cash,homes:[],pent:{owned:floors,cars:{}}}}},catalog);
const buy=(home,color=0x2c5e7a)=>({type:'buy.vehicle',kind:K.id,color,home});
// 구매 : 가진 층에만, 층마다 한 대
let a=acct(K.price*3,[118,121]);let out=applyCommand(a,buy('aurelis-ph-118'),catalog);a=out.account;
assert.equal(a.property.helis['aurelis-ph-118'].k,K.id);assert.equal(out.result.spent,K.price);assert.equal(a.property.cash,K.price*2);
assert.throws(()=>applyCommand(a,buy('aurelis-ph-118'),catalog),e=>e.code==='capacity');
out=applyCommand(a,buy('aurelis-ph-121'),catalog);a=out.account;assert.ok(a.property.helis['aurelis-ph-121']);
for(const bad of ['aurelis-ph-119','aurelis-ph-0118','aurelis-ph-118x','aurelis-ph-','aurelis-ph-123'])assert.throws(()=>applyCommand(a,buy(bad),catalog),e=>e.code==='not-owner'||e.code==='unknown-item',bad);
// 사용 : 직접 조종 무료 · 기사 $500
const r=a.property.helis['aurelis-ph-118'],use={type:'vehicle.use',asset:r.a,kind:r.k};
assert.equal(applyCommand(a,use,catalog).result.spent,0);
out=applyCommand(a,{...use,service:'chauffeur'},catalog);assert.equal(out.result.spent,500);assert.equal(out.account.property.cash,a.property.cash-500);
// 층을 잃으면 기사 이용 불가 · 남의 자산 불가
const lost=JSON.parse(JSON.stringify(a));lost.property.pent.owned=[121];assert.throws(()=>applyCommand(lost,{...use,service:'chauffeur'},catalog),e=>e.code==='not-owner');
assert.throws(()=>applyCommand(a,{...use,asset:'foreign'},catalog),e=>e.code==='not-owner');
// 펜트하우스가 하나도 없으면 구매 불가
assert.throws(()=>applyCommand(acct(K.price,[]),buy('aurelis-ph-118'),catalog),e=>e.code==='not-owner');
// 기존 일반 펜트하우스 헬기 경로 그대로
const home=catalog.homes.find(h=>h.heli);let b=migrateAccount({save:{property:{cash:K.price+1000,homes:[home.id]}}},catalog);b=applyCommand(b,buy(home.id),catalog).account;assert.ok(b.property.helis[home.id]);
const noHeli=catalog.homes.find(h=>!h.heli&&!h.bunker);let c=migrateAccount({save:{property:{cash:K.price,homes:[noHeli.id]}}},catalog);assert.throws(()=>applyCommand(c,buy(noHeli.id),catalog),e=>e.code==='not-owner');
console.log('PASS aurelis floor heli buy (owned floor only, one per floor, bad ids rejected), manual free, chauffeur $500, lost floor/forged rejected, regular penthouse unchanged');
