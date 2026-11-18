import assert from'node:assert/strict';import fs from'node:fs';import {randomUUID} from'node:crypto';
import {migrateAccount} from'./economy-engine.js';import {EconomyStore} from'./economy-store.js';import {MemoryDB} from'./test-leisure-taxi.mjs';
// 2026-11-18 새 차 5대 : 카탈로그 맨 뒤 순서(= 멀티 번호) · 값 · 구매 차감 · 잔액 부족 거절
const catalog=JSON.parse(fs.readFileSync(new URL('./economy-catalog.json',import.meta.url)));
const CARS=[['tz_f10',10_000_000],['ro_furia',10_200_000],['tz_neve',7_000_000],['tz_x1',10_050_000],['ro_fulmine',11_000_000]];
assert.deepEqual(catalog.fleet.slice(-6),['tz_vortice',...CARS.map(c=>c[0])]);assert.deepEqual(catalog.vehicles.slice(-6).map(v=>v.id),['tz_vortice',...CARS.map(c=>c[0])]);
assert.equal(catalog.fleet.length,307);assert.equal(catalog.vehicles.length,307);
for(const [id,price] of CARS){const V=catalog.vehicles.find(v=>v.id===id);assert.equal(V.price,price);assert.equal(V.sale,true);assert.equal(V.street,false);}
console.log('PASS 5 new cars at catalog end (after tz_vortice), prices ok');
const H=catalog.homes.find(h=>!h.bunker&&h.slots>=2).id;const seed=cash=>migrateAccount({save:{property:{cash,homes:[H],guns:['fists']}}},catalog);
for(const [id,price] of CARS){
 const db=new MemoryDB();db.map.set('economyControl/config',{lockedVersion:1});db.map.set('economyAccounts/qa',seed(price+250_000));db.map.set('economyAccounts/qb',seed(price-1));
 const store=new EconomyStore(db,catalog),run=(uid,command,version)=>store.execute(uid,{id:randomUUID(),type:'command',version,command});
 const V=catalog.vehicles.find(v=>v.id===id);
 const a=await run('qa',{type:'buy.vehicle',kind:id,color:V.paint,home:H},0);assert.equal(a.account.property.cash,250_000);
 const b=await run('qb',{type:'buy.vehicle',kind:id,color:V.paint,home:H},0).catch(e=>e);assert.equal(b.code,'insufficient-funds');
 console.log('PASS buy',id,'$'+price.toLocaleString('en-US'),'charged, poor rejected');
}
