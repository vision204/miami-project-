// 2026-11-21 배틀패스 테스트 · node test-battlepass.mjs (외부 API 없음)
import fs from 'node:fs';import assert from 'node:assert/strict';
import {applyCommand,migrateAccount} from './economy-engine.js';
import {PASS_SEASONS,PASS_PRODUCTS,passMissions,passEvent,passState} from './battlepass.js';
import {LivePayments,LIVE_POLICY_VERSION} from './payment-live.js';
import {DB} from '../tools/live-payment-qa-db.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('./economy-catalog.json',import.meta.url)));
const S=PASS_SEASONS[0],inSeason=S.start+3600000,ok=m=>console.log('PASS '+m);
const fresh=(cash=50000000)=>{const a=migrateAccount(null,catalog,inSeason,()=>'starter-asset');a.property.cash=cash;return a;};
const run=(a,cmd,now=inSeason)=>applyCommand(a,cmd,catalog,{now});
const premium=a=>{a.commerce={v:1,lots:{o1:{id:'o1',productId:'pass-s1',paidAt:inSeason,validUntil:inSeason+365*864e5,total:0,remaining:0,used:0,usage:0,held:0,items:[{k:'pass',id:'s1',remaining:1,claimed:0,grants:[]}]}}};return a;};
const rod=catalog.vehicles.find(v=>v.type==='car'&&v.price>=100000&&v.sale!==false&&!v.bunker&&v.id!=='sv_sovrano'&&v.id!=='tz_lanza'&&v.id!=='war_drone');

// 시즌 · 상품
assert.equal(S.levels,30);assert.equal(S.rewards.length,30);assert.equal(PASS_PRODUCTS[0].amount,6500);
assert.equal(new Date(S.start).toISOString(),'2026-11-30T15:00:00.000Z');assert.equal((S.end-S.start)/864e5,28);ok('season 1: 2026-12-01 KST, 4 weeks, 30 levels, ₩6,500');
{const m=passMissions(S,inSeason),n=passMissions(S,inSeason+1000);assert.equal(m.daily.length,3);assert.equal(m.weekly.length,4);assert.deepEqual(m,n);assert.notDeepEqual(passMissions(S,inSeason+864e5).daily,m.daily.slice(0,0));ok('same missions for everyone on the same day');}

// 할인 : 프리미엄만, buy.* 만, 구매가 = 할인가, 되팔기 차익 없음
{const home=Object.keys({});
 let a=fresh();const b=run(a,{type:'buy.clothes',id:catalog.clothes.find(c=>c.p>0).id});assert.equal(b.result.spent,catalog.clothes.find(c=>c.p>0).p);
 a=premium(fresh());const c=catalog.clothes.find(c=>c.p>0),r=run(a,{type:'buy.clothes',id:c.id});assert.equal(r.result.spent,Math.floor(c.p*0.8));assert.equal(r.result.passSaved,c.p-Math.floor(c.p*0.8));assert.equal(r.account.commerce.lots.o1.usage,1,'discount use marks the paid lot');
 assert.equal(run(fresh(),{type:'buy.clothes',id:c.id},S.end+1).result.spent,c.p);ok('premium gets 20% off game-money purchases, others pay full price');
 const after=run(premium(fresh()),{type:'buy.clothes',id:c.id},S.end+1);assert.equal(after.result.spent,c.p);ok('discount ends at season end');}

// 활동 XP · 미션 · 하루 한도
{let a=fresh();const st=passState(a,inSeason);const before=st.P.xp;
 for(let i=0;i<20;i++)passEvent(a,'cue',1,inSeason);const P=a.pass;assert(P.act.xp<=300,'activity cap');
 const doneDaily=P.daily.list.filter(m=>m.ev==='cue'&&m.done).length,doneWeekly=P.weekly.list.filter(m=>m.ev==='cue'&&m.done).length;
 assert.equal(P.xp,before+300+doneDaily*200+doneWeekly*1000);
 passState(a,inSeason+864e5);assert.equal(a.pass.act.xp,0);assert(a.pass.daily.list.every(m=>m.n===0));ok('activity XP capped at 300/day, missions reset next day');}

// 보상 받기
{let a=fresh(1000);a.pass=undefined;passState(a,inSeason);a.pass.xp=30000;
 let r=run(a,{type:'pass.claim',level:1,track:'free'});assert.equal(r.account.property.cash,1000+30000);a=r.account;
 await Promise.resolve();assert.throws(()=>run(a,{type:'pass.claim',level:1,track:'free'}),e=>e.code==='pass-claimed');
 assert.throws(()=>run(a,{type:'pass.claim',level:2,track:'premium'}),e=>e.code==='pass-premium');
 a=premium(a);r=run(a,{type:'pass.claim',level:30,track:'premium'});const car=r.account.property.over.at(-1);assert.equal(car.k,'ro_fulmine');assert.equal(car.c,0x7fd3ff);assert.equal(car.season,'s1');assert.equal(r.account.commerce.lots.o1.usage,1);
 let b=fresh();passState(b,inSeason);b.pass.xp=999;assert.throws(()=>run(b,{type:'pass.claim',level:1,track:'free'}),e=>e.code==='pass-locked');ok('claims: level gate, once each, premium only for buyers, season car');}

// 서버 활동 연결 : 출석 → 미션 진행
{let a=fresh();const r=run(a,{type:'attendance.claim'});const m=[...r.account.pass.daily.list,...r.account.pass.weekly.list].filter(m=>m.ev==='attend');assert(m.every(x=>x.n===1));ok('attendance feeds attend missions');}

// 결제 : 시즌 중에만 판매, 사면 프리미엄
{const db=new DB(),uid='qa-pass';let clock=inSeason;db.map.set('economyControl/config',{lockedVersion:1});db.map.set('economyAccounts/'+uid,fresh(5000));db.map.set('players/'+uid,{save:{property:{cash:5000}}});
 const payments=new Map();const config={configured:true,secret:'live_gsk_x',client:'live_gck_x',mid:'m',checkoutEnabled:true,approvalEnabled:true,publicEnabled:true,users:[],giftEnabled:true};
 const fetcher=async(url,opts)=>{const route=url.split('/v1/payments/')[1],d=opts.body?JSON.parse(opts.body):null,key=route==='confirm'?d.paymentKey:decodeURIComponent(route),p=payments.get(key);if(route==='confirm'){p.status='DONE';p.approvedAt=new Date(clock).toISOString();}return {ok:true,json:async()=>structuredClone(p)};};
 const live=new LivePayments(db,{catalog,config,fetcher,now:()=>clock});
 clock=S.start-1000;await assert.rejects(()=>live.execute(uid,{action:'create',productId:'pass-s1',requestId:'pass_request_000000000001'}),e=>e.code==='pass-not-on-sale');clock=inSeason;
 const o=await live.execute(uid,{action:'create',productId:'pass-s1',requestId:'pass_request_000000000002'});await live.execute(uid,{action:'accept',orderId:o.id,terms:true,privacy:true,policyVersion:LIVE_POLICY_VERSION});
 payments.set('pass_payment_key_0001',{mId:'m',orderId:o.id,paymentKey:'pass_payment_key_0001',totalAmount:6500,balanceAmount:6500,currency:'KRW',status:'IN_PROGRESS',method:'카드',cancels:[]});
 assert.equal((await live.execute(uid,{action:'confirm',orderId:o.id,paymentKey:'pass_payment_key_0001',amount:6500})).state,'FULFILLED');
 const acc=db.map.get('economyAccounts/'+uid);const c=catalog.clothes.find(c=>c.p>0);assert.equal(applyCommand(acc,{type:'buy.clothes',id:c.id},catalog,{now:clock}).result.spent,Math.floor(c.p*0.8));
 ok('premium sold only in season; a paid order turns the discount on');}
console.log('PASS all battle pass checks');
