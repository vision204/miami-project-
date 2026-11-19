// 2026-11-18 미국 대륙 맵 서버 경제 : 집 구매 · TIDELINE 낚싯대 · 북서 물 낚시 · 택시 정류장 (5 km) · 위치 범위
import assert from'node:assert/strict';import fs from'node:fs';import {randomUUID} from'node:crypto';
import {applyCommand,migrateAccount} from'./economy-engine.js';import {NW_HOMES,NW_ROD_SHOPS,NW_TAXI,nwWater} from'./northwest-economy.js';
const catalog=JSON.parse(fs.readFileSync(new URL('./economy-catalog.json',import.meta.url))),now=Date.now();
const seed=(cash,extra={})=>migrateAccount({save:{property:{cash,homes:[],guns:['fists'],...extra}}},catalog);
const at=(o)=>({hp:100,speed:0,car:false,flags:0,at:now,...o});
// 1. 집 24채가 카탈로그 맨 뒤에 같은 값 · 2대 차고로
assert.equal(NW_HOMES.length,24);for(const h of NW_HOMES){const c=catalog.homes.find(x=>x.id===h.id);assert.ok(c,h.id);assert.equal(c.price,h.price);assert.equal(c.slots,2);}
assert.deepEqual(catalog.homes.slice(-24).map(h=>h.id),NW_HOMES.map(h=>h.id));
{const h=NW_HOMES[0],out=applyCommand(seed(h.price+1000),{type:'buy.home',id:h.id},catalog,{now,observation:null});assert.equal(out.account.property.cash,1000);assert.ok(out.account.property.homes.includes(h.id));
 assert.throws(()=>applyCommand(out.account,{type:'buy.home',id:h.id},catalog,{now}),e=>e.code==='already-owned');
 assert.throws(()=>applyCommand(seed(h.price-1),{type:'buy.home',id:h.id},catalog,{now}),e=>e.code==='insufficient-funds');}
console.log('PASS northwest homes : 24 in catalog, buy charges price, owned once, poor rejected');
// 2. 낚싯대 : 미국 대륙 TIDELINE 계산대 앞에서만
{const s=NW_ROD_SHOPS[3],ok=applyCommand(seed(10000),{type:'buy.rod',id:'starter'},catalog,{now,observation:at({x:s.cx,y:s.y,z:s.cz})});assert.ok(ok.account.property.fishing.owned.includes('starter'));
 assert.throws(()=>applyCommand(seed(10000),{type:'buy.rod',id:'starter'},catalog,{now,observation:at({x:s.cx+40,y:s.y,z:s.cz})}),e=>e.code==='fishing-shop-location');
 assert.throws(()=>applyCommand(seed(10000),{type:'buy.rod',id:'starter'},catalog,{now,observation:at({x:s.cx,y:s.y+8,z:s.cz})}),e=>e.code==='fishing-shop-location');}
console.log('PASS northwest rod shops : counter only');
// 3. 낚시 : 호숫가 부두(수면 100 m) · 바다 부두 · 높이 틀리면 거절
const rodOwner=()=>seed(1000,{fishing:{owned:['starter'],equipped:'starter'}});
const fish=(o,target)=>applyCommand(rodOwner(),{type:'fishing.start',run:randomUUID(),target},catalog,{now,observation:at(o)});
{const lake=NW_TAXI.find(t=>t.id==='nw-fishing-lake'),t=[lake.x+12,lake.z];assert.ok(nwWater(...t));
 const out=fish({x:lake.x,y:lake.y,z:lake.z},t);assert.equal(out.account.fishing.active.zone,'lagoon');
 assert.throws(()=>fish({x:lake.x,y:2,z:lake.z},t),e=>e.code==='fishing-location');
 assert.throws(()=>fish({x:lake.x,y:lake.y,z:lake.z},[lake.x+400,lake.z]),e=>e.code==='fishing-water');}
{const coast=NW_TAXI.find(t=>t.id==='nw-fishing-coast'),dir=coast.yaw,t=[coast.x+Math.cos(dir)*12,coast.z+Math.sin(dir)*12];
 const out=fish({x:coast.x,y:coast.y,z:coast.z},t);assert.ok(out.account.fishing.active.zone);}
// 마이애미 낚시는 그대로 (부두 높이 0 ~ 5 m)
console.log('PASS northwest fishing : lake pier at water 100 m, coast dock, wrong height/out of range rejected');
// 4. 택시 : 5 km 안 정류장만, 도착 확인
const ride=(dest)=>({type:'taxi.ride',destination:dest,ride:randomUUID()});
for(const r of NW_TAXI){const o=at({x:r.x+600,y:r.y,z:r.z+300}),out=applyCommand(seed(1000),ride(r.id),catalog,{now,observation:o});assert.equal(out.account.property.cash,500);assert.deepEqual(out.position,{x:r.x,y:r.y,z:r.z,yaw:r.yaw});
 const arrived=applyCommand(out.account,{type:'taxi.arrive',ride:out.account.cityTaxi.id},catalog,{now,observation:at({x:r.x,y:r.y,z:r.z})});assert.equal(arrived.account.cityTaxi.pending,false);}
{const r=NW_TAXI[0];assert.throws(()=>applyCommand(seed(1000),ride(r.id),catalog,{now,observation:at({x:r.x+6000,y:r.y,z:r.z})}),e=>e.code==='taxi-range');
 assert.throws(()=>applyCommand(seed(1000),ride(r.id),catalog,{now,observation:at({x:r.x+100,y:r.y,z:r.z,car:true})}),e=>e.code==='taxi-location');
 assert.throws(()=>applyCommand(seed(1000),ride('fishing'),catalog,{now,observation:at({x:r.x,y:r.y,z:r.z})}),e=>e.code==='taxi-location');}
console.log('PASS northwest taxi : '+NW_TAXI.length+' stops within 5 km, arrival confirmed, far/in-car/Miami-from-northwest rejected');
// 5. 서버 위치 범위
const src=fs.readFileSync(new URL('./server.js',import.meta.url),'utf8');assert.ok(src.includes('num(m.s[0], -53000, 20000)')&&src.includes('num(m.s[2], -26000, 20000)'));
console.log('PASS position range covers the northwest map (x -53,000 · z -26,000)');
// 6. 기록 : 계정에 저장, 더 좋을 때만, 범위 밖 · 모르는 종목 거절
{let a=seed(0);const rec=(key,value)=>{const o=applyCommand(a,{type:'nw.record',key,value},catalog,{now});a=o.account;return o.result.record;};
 const city=NW_HOMES[0].city;
 assert.equal(rec('bowl:'+city,120).improved,true);assert.equal(rec('bowl:'+city,90).improved,false);assert.equal(a.northwest.records['bowl:'+city],120);assert.equal(rec('bowl:'+city,210).value,210);
 assert.equal(rec('golf:'+city,12).value,12);assert.equal(rec('golf:'+city,9).value,9);assert.equal(rec('golf:'+city,15).value,9);
 assert.equal(rec('course:hill',95000).value,95000);assert.equal(rec('course:hill',91000).value,91000);
 for(const [k,v] of [['bowl:'+city,301],['bowl:Nowhere',100],['golf:'+city,2],['course:hill',1000],['course:moon',60000],['bowl:'+city,99.5]])assert.throws(()=>rec(k,v),e=>e.code==='invalid-record',k+' '+v);
 assert.equal(a.property.cash,0);}
console.log('PASS northwest records : stored on the account, best only, out-of-range and unknown keys rejected');
