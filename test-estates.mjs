import assert from'node:assert/strict';import fs from'node:fs';import {randomUUID} from'node:crypto';
import {migrateAccount,applyProgress} from'./economy-engine.js';import {EconomyStore} from'./economy-store.js';import {MemoryDB} from'./test-leisure-taxi.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('./economy-catalog.json',import.meta.url)));
assert.equal(catalog.estates.length,24);assert.equal(catalog.homes.filter(h=>!h.bunker).length,144);
const seed=cash=>migrateAccount({save:{property:{cash,homes:[],guns:['fists']}}},catalog);
const db=new MemoryDB();db.map.set('economyControl/config',{lockedVersion:1});
db.map.set('economyAccounts/qa-rich',seed(60_000_000));db.map.set('economyAccounts/qa-poor',seed(1_000_000));
const store=new EconomyStore(db,catalog),run=(uid,command,version)=>store.execute(uid,{id:randomUUID(),type:'command',version,command});
const cheap=catalog.estates.reduce((a,b)=>a.price<b.price?a:b),top=catalog.estates.reduce((a,b)=>a.price>b.price?a:b);
let a=await run('qa-rich',{type:'buy.estate',id:top.id},0);assert.deepEqual(a.account.property.estates.owned,[top.id]);assert.equal(a.account.property.cash,60_000_000-top.price);
await assert.rejects(run('qa-rich',{type:'buy.estate',id:top.id},a.account.version),e=>e.code==='already-owned');
await assert.rejects(run('qa-rich',{type:'buy.estate',id:'bay-99'},a.account.version),e=>e.code==='unknown-item');
await assert.rejects(run('qa-poor',{type:'buy.estate',id:cheap.id},0),e=>e.code==='insufficient-funds');
a=await run('qa-rich',{type:'estate.theme',id:top.id,theme:'noir'},a.account.version);assert.equal(a.account.property.estates.theme[top.id],'noir');
await assert.rejects(run('qa-rich',{type:'estate.theme',id:top.id,theme:'gold'},a.account.version),e=>e.code==='invalid-interior');
await assert.rejects(run('qa-rich',{type:'estate.theme',id:cheap.id,theme:'noir'},a.account.version),e=>e.code==='not-owner');
/* 같은 사람이 여러 채 · 다른 사람도 같은 저택 (누구나 구매) */
db.map.set('economyAccounts/qa-two',seed(30_000_000));const b=await run('qa-two',{type:'buy.estate',id:cheap.id},0);assert.ok(b.account.property.estates.owned.includes(cheap.id));
/* 브라우저 저장(save)이 소유를 바꿀 수 없다 */
const forged=structuredClone(a.account.property);forged.estates={owned:catalog.estates.map(e=>e.id),theme:{}};forged.cash=9e9;
const after=applyProgress(a.account,{property:forged},catalog).account;assert.deepEqual(after.property.estates.owned,[top.id]);assert.equal(after.property.cash,a.account.property.cash);
console.log('PASS estates: buy once per estate, price charged, unknown/insufficient rejected, theme only owner + known theme, many owners per estate, browser save cannot forge ownership');
