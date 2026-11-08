import assert from'node:assert/strict';import fs from'node:fs';import {randomUUID} from'node:crypto';
import {migrateAccount} from'./economy-engine.js';import {EconomyStore} from'./economy-store.js';import {MemoryDB} from'./test-leisure-taxi.mjs';
import {FOUNDERS_KEY,FOUNDERS_PATH} from'./founders.js';import {cleanMail,listMail} from'./mailbox.js';
const catalog=JSON.parse(fs.readFileSync(new URL('./economy-catalog.json',import.meta.url)));
const car=catalog.vehicles.find(k=>k.type==='car'&&k.id!=='sv_sovrano'&&k.price>0).id;
const seed=cash=>migrateAccount({save:{property:{cash,homes:[],guns:['fists']}}},catalog);
const db=new MemoryDB();db.map.set('economyControl/config',{lockedVersion:1});
db.map.set(FOUNDERS_PATH,{campaign:FOUNDERS_KEY,limit:200,entries:[{uid:'qa-founder',at:1,rank:7}]});
for(const u of['qa-founder','qa-plain','qa-vip'])db.map.set('economyAccounts/'+u,seed(1000));
const store=new EconomyStore(db,catalog);
store.mails=cleanMail([{id:'gm-welcome',title:'환영 선물',body:'안녕',items:{cash:5000,vehicles:[{id:car}],tickets:{royal:2}}},
 {id:'gm-vip',title:'VIP',body:'x',to:['qa-vip'],items:{cash:1}},{id:'gm-old',title:'끝남',body:'x',until:Date.now()-1000,items:{cash:1}},{id:'gm-future',title:'예약',body:'x',at:Date.now()+86400000,items:{cash:1}}],catalog);
const run=(uid,command,version)=>store.execute(uid,{id:randomUUID(),type:command?'command':'load',version,command});
// load : 로브랑브르를 자동으로 주지 않고 우편으로
let L=await run('qa-founder');assert.ok(!L.account.grants?.[FOUNDERS_KEY]);assert.ok(!(L.account.property.over||[]).some(s=>s.k==='sv_sovrano'));
assert.deepEqual(L.result.mail.map(m=>m.id),[FOUNDERS_KEY,'gm-welcome']);assert.match(L.result.mail[0].body,/7번째/);
assert.deepEqual((await run('qa-plain')).result.mail.map(m=>m.id),['gm-welcome']);
assert.deepEqual((await run('qa-vip')).result.mail.map(m=>m.id).sort(),['gm-vip','gm-welcome']);
// 수령
let a=await run('qa-founder',{type:'mail.claim',id:FOUNDERS_KEY},L.account.version);assert.ok(a.account.grants[FOUNDERS_KEY]);assert.equal(a.account.property.over.filter(s=>s.k==='sv_sovrano').length,1);
await assert.rejects(run('qa-founder',{type:'mail.claim',id:FOUNDERS_KEY},a.account.version),e=>e.code==='mail-claimed');
await assert.rejects(run('qa-plain',{type:'mail.claim',id:FOUNDERS_KEY},0),e=>e.code==='mail-missing');
a=await run('qa-founder',{type:'mail.claim',id:'gm-welcome'},a.account.version);assert.equal(a.account.property.cash,6000);assert.ok(a.account.property.over.some(s=>s.k===car&&s.gift==='mail:gm-welcome'));assert.equal(a.account.property.gunmods.__skins.tickets.royal,2);
assert.ok(a.result.mail.every(m=>m.claimedAt));
await assert.rejects(run('qa-founder',{type:'mail.claim',id:'gm-welcome'},a.account.version),e=>e.code==='mail-claimed');
for(const id of['gm-vip','gm-old','gm-future','nope'])await assert.rejects(run('qa-plain',{type:'mail.claim',id},0),e=>e.code==='mail-missing'||e.code==='mail-expired');
// 목록만 보기는 원장을 바꾸지 않는다
const v=db.map.get('economyAccounts/qa-founder').version,ls=await run('qa-founder',{type:'mail.list'},0);assert.equal(db.map.get('economyAccounts/qa-founder').version,v);assert.equal(ls.result.mail.length,2);
// 같은 요청 두 번 = 한 번
{const req={id:randomUUID(),type:'command',version:0,command:{type:'mail.claim',id:'gm-welcome'}};const r=await Promise.all([store.execute('qa-plain',req),store.execute('qa-plain',req)]);assert.equal(r[0].account.property.cash,6000);assert.equal(r[1].replayed,true);assert.equal(db.map.get('economyAccounts/qa-plain').property.cash,6000);}
// 잘못된 우편 파일은 거절
for(const bad of[[{id:'x',title:'a',body:'b',items:{cash:1}}],[{id:'ok-1',title:'a',body:'b',items:{}}],[{id:'ok-1',title:'a',body:'b',items:{cash:-1}}],[{id:'ok-1',title:'a',body:'b',items:{vehicles:[{id:'sv_sovrano'}]}}],[{id:FOUNDERS_KEY,title:'a',body:'b',items:{cash:1}}]])assert.throws(()=>cleanMail(bad,catalog));
assert.equal(listMail(seed(0),'qa-founder',{campaign:FOUNDERS_KEY,entries:[{uid:'qa-founder',rank:201}]},[]).length,0);
console.log('PASS mailbox: founder gift by mail (no auto-grant), rank text, targeted/expired/scheduled mail, cash+vehicle+tickets, claim once, list is read-only, duplicate replay, bad mail rejected');
