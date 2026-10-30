// No external APIs, credentials, Auth users or production documents are used.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {LivePayments,LIVE_PRODUCTS,LIVE_POLICY_VERSION,liveConfiguration} from '../payment-live.js';
import {EconomyStore} from '../economy-store.js';
import {migrateAccount,assetSlots} from '../economy-engine.js';
import {sweepCommerce} from '../payment-commerce.js';
import {RaceLedger} from '../speed-racing.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../economy-catalog.json',import.meta.url))),clone=structuredClone;
import {DB} from './live-payment-qa-db.mjs';

let clock=Date.parse('2026-10-30T10:00:00Z');const uid='qa-paid';
function setup({approvalEnabled=true}={}){
 const db=new DB();db.map.set('economyControl/config',{lockedVersion:1});db.map.set('economyAccounts/'+uid,migrateAccount(null,catalog,clock,()=> 'starter-asset'));db.map.set('players/'+uid,{save:{property:{cash:5000}},name:'QA'});
 const config={configured:true,secret:'live_gsk_fixture_only',client:'live_gck_fixture_only',mid:'fixture-mid',checkoutEnabled:true,approvalEnabled,publicEnabled:false,users:[uid],giftEnabled:true};
 const payments=new Map(),approvals=new Set(),cancels=new Set(),requests=[];let loseApprove=false,loseCancel=false;
 const fetcher=async(url,opts)=>{
  requests.push({url,method:opts.method,id:opts.headers['Idempotency-Key']});assert(opts.headers.Authorization.startsWith('Basic '));
  const data=opts.body?JSON.parse(opts.body):null,route=url.split('/v1/payments/')[1],key=route==='confirm'?data.paymentKey:decodeURIComponent(route.split('/')[0]),p=payments.get(key);assert(p,'Known fixture payment required');
  if(route==='confirm'){
   assert.equal(data.amount,p.totalAmount);assert.equal(data.orderId,p.orderId);assert(opts.headers['Idempotency-Key']);if(!approvals.has(key)){approvals.add(key);p.status='DONE';p.approvedAt=new Date(clock).toISOString();}if(loseApprove){loseApprove=false;throw Error('lost approval response');}
  }else if(route.endsWith('/cancel')){
   assert(opts.headers['Idempotency-Key']);assert.equal(data.cancelAmount,p.totalAmount);if(!cancels.has(key)){cancels.add(key);p.status='CANCELED';p.balanceAmount=0;p.cancels=[{cancelStatus:'DONE',cancelAmount:p.totalAmount}];}if(loseCancel){loseCancel=false;throw Error('lost cancel response');}
  }
  return {ok:true,json:async()=>clone(p)};
 };
 const live=new LivePayments(db,{catalog,config,fetcher,now:()=>clock}),store=new EconomyStore(db,catalog);
 let n=0;
 async function create(product='cash-starter'){
  const order=await live.execute(uid,{action:'create',productId:product,requestId:'fixture_request_'+(++n).toString().padStart(16,'0'),amount:1,units:999999999});
  const key='live_fixture_payment_'+n.toString().padStart(12,'0');payments.set(key,{mId:config.mid,orderId:order.id,paymentKey:key,totalAmount:order.amount,balanceAmount:order.amount,currency:'KRW',status:'IN_PROGRESS',method:'카드',cancels:[]});return {...order,key};
 }
 const accept=o=>live.execute(uid,{action:'accept',orderId:o.id,terms:true,privacy:true,policyVersion:LIVE_POLICY_VERSION});
 const confirm=o=>live.execute(uid,{action:'confirm',orderId:o.id,paymentKey:o.key,amount:o.amount});
 const account=()=>clone(db.map.get('economyAccounts/'+uid));
 const command=cmd=>store.execute(uid,{id:'economy_fixture_'+(++n).toString().padStart(16,'0'),type:'command',version:account().version,command:cmd});
 return {db,live,store,config,payments,requests,approvals,cancels,create,accept,confirm,account,command,loseApproval:()=>loseApprove=true,loseCancellation:()=>loseCancel=true};
}
const checks=[];function passed(name){checks.push(name);console.log('PASS '+name);}
assert.equal(liveConfiguration({TOSS_LIVE_SECRET_KEY:'test_gsk_fake',TOSS_LIVE_CLIENT_KEY:'live_gck_fake',TOSS_LIVE_MID:'m'}).configured,false);
assert.equal(liveConfiguration({}).approvalEnabled,false);assert.equal(liveConfiguration({TOSS_LIVE_PUBLIC_ENABLED:'1'}).publicEnabled,false);passed('live/test key separation and closed defaults');
{
 const s=setup();await assert.rejects(()=>s.live.execute('outsider',{action:'config'}),e=>e.code==='live-review-only');
 await assert.rejects(()=>s.create('pack-svr-67'),e=>e.code==='invalid-product');
 const o=await s.create();assert.equal(o.amount,6500);await assert.rejects(()=>s.confirm(o),e=>e.code==='purchase-consent-required');assert.equal(s.requests.length,0);
 await assert.rejects(()=>s.live.execute(uid,{action:'accept',orderId:o.id,terms:true,privacy:false,policyVersion:LIVE_POLICY_VERSION}));await s.accept(o);
 await assert.rejects(()=>s.live.execute(uid,{action:'confirm',orderId:o.id,paymentKey:o.key,amount:1}));assert.equal(s.requests.length,0);
 s.payments.get(o.key).mId='wrong-mid';await assert.rejects(()=>s.confirm(o),e=>e.code==='live-payment-mismatch');assert.equal(s.approvals.size,0);passed('UID, price, consent, MID and limited-product gates');
}
{
 const s=setup({approvalEnabled:false}),o=await s.create();await s.accept(o);await assert.rejects(()=>s.confirm(o),e=>e.code==='live-approval-paused');assert.equal(s.approvals.size,0);assert.equal(s.account().property.cash,5000);passed('live widget preview cannot approve or grant currency');
}
{
 const s=setup(),o=await s.create();await s.accept(o);await Promise.all([s.confirm(o),s.confirm(o),s.confirm(o)]);assert.equal(s.approvals.size,1);assert.equal(s.account().property.cash,4005000);assert.equal([...s.db.map.keys()].filter(k=>k.startsWith('paymentReceipts/')).length,1);assert(![...s.db.map.keys()].some(k=>k.startsWith('paymentTest')));
 const h=catalog.homes.find(h=>h.price===2200);assert(h);await s.command({type:'buy.home',id:h.id});assert.equal(s.account().commerce.lots[o.id].remaining,4000000-2200);assert.equal(s.account().property.cash,4005000-2200);
 const r=await s.live.execute(uid,{action:'refund',orderId:o.id,requestId:'refund_usage_fixture_0001',reason:'unused'});assert.equal(r.refund.state,'REVIEW_REQUIRED');assert.equal(s.cancels.size,0);passed('atomic once-only grant, real economy spend and used-order review');
}
for(const product of LIVE_PRODUCTS){
 const s=setup(),o=await s.create(product.id);await s.accept(o);await s.confirm(o);const a=s.account();assert.equal(a.property.cash,5000+product.units);assert.equal(a.commerce.lots[o.id].items.length,product.items.length);assert.equal(a.commerce.lots[o.id].validUntil,Date.parse('2027-10-30T10:00:00Z'));
 if(product.once){const q=await s.create(product.id);await s.accept(q);await assert.rejects(()=>s.confirm(q),e=>e.code==='package-already-claimed');assert.equal(s.approvals.size,1);}
 const r=await s.live.execute(uid,{action:'refund',orderId:o.id,requestId:'refund_unused_fixture_0001',reason:'unused'});assert.equal(r.refund.state,'REFUNDED');assert.equal(s.account().property.cash,5000);assert.equal(s.account().commerce.lots[o.id].refunded,true);
 await s.live.execute(uid,{action:'refund',orderId:o.id,requestId:'refund_unused_fixture_0002',reason:'unused'});assert.equal(s.cancels.size,1);
}
passed('all 9 products: price, 12-month grants, package-once lock and unused full refund');
{
 const s=setup(),o=await s.create();await s.accept(o);s.loseApproval();await assert.rejects(()=>s.confirm(o),e=>e.code==='live-provider-unavailable');assert.equal(s.account().property.cash,5000);clock+=60001;await s.live.tick();assert.equal(s.account().property.cash,4005000);assert.equal(s.approvals.size,1);passed('lost provider approval response recovered by GET worker');
}
{
 const s=setup(),o=await s.create();await s.accept(o);s.db.failCommit=w=>w.some(([p])=>p.startsWith('paymentReceipts/'));await assert.rejects(()=>s.confirm(o));assert.equal(s.account().property.cash,5000);clock+=60001;await s.live.tick();assert.equal(s.account().property.cash,4005000);assert.equal(s.approvals.size,1);passed('storage failure after approval recovered without duplicate charge');
}
{
 const s=setup(),o=await s.create();await s.accept(o);await s.confirm(o);s.loseCancellation();const r=await s.live.execute(uid,{action:'refund',orderId:o.id,requestId:'refund_lost_fixture_00001',reason:'unused'});assert.equal(r.refund.state,'RETRY');assert.equal(s.account().property.cash,5000);assert.equal(s.account().commerce.lots[o.id].held,4000000);clock+=60001;await s.live.tick();assert.equal(s.db.map.get('paymentRefunds/'+o.id).state,'REFUNDED');assert.equal(s.cancels.size,1);assert.equal(s.account().commerce.lots[o.id].held,0);passed('durable refund hold, lost cancel response and restart-safe completion');
}
{
 const s=setup(),o=await s.create('pack-prestige');await s.accept(o);await s.confirm(o);let items=s.account().commerce.lots[o.id].items;
 const hangarIndex=items.findIndex(i=>i.k==='hangar');await s.command({type:'commerce.claim',orderId:o.id,item:hangarIndex});
 for(const [index,item]of items.entries()){
  if(index===hangarIndex)continue;
  const home=item.k==='home-choice'?catalog.homes.find(h=>/-penthouse-/.test(h.id)&&h.price>=item.minPrice&&h.price<=item.maxPrice).id:undefined;
  const count=item.quantity||1;for(let n=0;n<count;n++)await s.command({type:'commerce.claim',orderId:o.id,item:index,...(home?{homeId:home}:{})});
 }
 const a=s.account(),l=a.commerce.lots[o.id];assert(l.items.every(i=>i.remaining===0));assert.equal(assetSlots(a.property).filter(s=>s.r.paidOrder===o.id).length,5);assert(l.items.flatMap(i=>i.grants).filter(g=>g.skin).every(g=>catalog.skins.find(s=>s.id===g.skin).t===(l.items.find(i=>i.grants.includes(g)).guaranteedTier==='epic'?3:4)));
 assert.equal(a.property.hangars.planes.hangar_prestige.length,3);assert.equal(a.property.boats.boats.length,1);assert.equal(a.property.over.length,1);
 await assert.rejects(()=>s.command({type:'commerce.claim',orderId:o.id,item:0}),e=>e.code==='paid-item-unavailable');
 const independent={a:'unrelated-plane',k:'fighter_viper',p:15000000,c:123};a.property.hangars.planes.hangar_prestige.push(independent);s.db.map.set('economyAccounts/'+uid,a);
 const expired=s.account();sweepCommerce(expired,l.validUntil);assert.equal(expired.property.cash,5000);assert.equal(assetSlots(expired.property).filter(s=>s.r.paidOrder===o.id).length,0);assert(assetSlots(expired.property).some(s=>s.r.a==='unrelated-plane'));assert(!expired.property.hangars.owned.includes('hangar_prestige'));assert(Object.values(expired.property.gunmods.__skins.stock).every(n=>n===0));assert.equal(sweepCommerce(expired,l.validUntil+1),false);passed('all prestige components, guaranteed-tier boxes and selective expiry preserve unrelated assets');
}
{
 const s=setup();for(const id of ['pack-starter','pack-driver','pack-ace']){const o=await s.create(id);await s.accept(o);await s.confirm(o);const items=s.account().commerce.lots[o.id].items;for(const idx of [...items.keys()].sort((x,y)=>(items[x].k==='hangar'?-1:0)-(items[y].k==='hangar'?-1:0))){const i=items[idx];for(let n=0;n<(i.quantity||1);n++)await s.command({type:'commerce.claim',orderId:o.id,item:idx});}assert(s.account().commerce.lots[o.id].items.every(i=>i.remaining===0));}
 assert.equal(s.account().property.armor,100);assert.equal(s.account().property.hangars.planes.hangar_starter.length,1);passed('starter, driver and ace complete claims');
}
{
 const s=setup(),o=await s.create();await s.accept(o);await s.confirm(o);await assert.rejects(()=>s.live.execute('other-user',{action:'refund',orderId:o.id,requestId:'other_refund_fixture_00001',reason:'unused'}),e=>e.code==='order-not-found');
 const account=s.account();account.commerce.lots[o.id].validUntil=0;s.db.map.set('economyAccounts/'+uid,account);await assert.rejects(()=>s.command({type:'buy.home',id:catalog.homes[0].id}),e=>e.code==='version-conflict');assert.equal(s.account().property.cash,5000);assert(s.account().commerce.lots[o.id].expired);passed('cross-account refunds blocked; expiry commits before stale commands are rejected');
}
{
 const s=setup(),o=await s.create();await s.accept(o);await s.confirm(o);const ledger=new RaceLedger(()=>({db:s.db})),race={id:'fixture-race-1',room:'fixture-room',createdAt:Date.now(),hostUid:uid,nextAt:Date.now()+600000};
 await ledger.open(race);await ledger.join(race,uid);assert.equal(s.account().commerce.lots[o.id].remaining,3999000);assert.equal(s.account().property.cash,4004000);await ledger.settle(race,[{uid,credit:1000}]);await ledger.settle(race,[{uid,credit:1000}]);assert.equal(s.account().commerce.lots[o.id].remaining,4000000);assert.equal(s.account().commerce.lots[o.id].used,0);assert.equal(s.account().property.cash,4005000);
 const race2={...race,id:'fixture-race-2'};await ledger.join(race2,uid);const a=s.account();a.speedRace.expiresAt=0;s.db.map.set('economyAccounts/'+uid,a);await s.store.execute(uid,{id:'fixture_race_recovery_0001',type:'load'});assert.equal(s.account().commerce.lots[o.id].used,0);assert.equal(s.account().property.cash,4005000);passed('race fee debit, canceled return and relay-loss recovery preserve paid provenance');
}
{
 const s=setup(),o=await s.create();await s.accept(o);await s.confirm(o);const h=catalog.homes.find(h=>h.price===2200);const out=await Promise.allSettled([s.live.execute(uid,{action:'refund',orderId:o.id,requestId:'concurrent_refund_000001',reason:'unused'}),s.command({type:'buy.home',id:h.id})]);assert(out.some(r=>r.status==='fulfilled'));const a=s.account(),l=a.commerce.lots[o.id];assert(l.remaining<=a.property.cash);assert(a.property.cash>=0);if(l.refunded){assert.equal(l.remaining,0);assert.equal(s.cancels.size,1);assert(!a.property.homes.includes(h.id));}else{assert.equal(l.used,2200);assert.equal(s.cancels.size,0);}passed('concurrent refund versus spend cannot double-spend paid units');
}
{
 const s=setup(),o=await s.create('pack-driver');await s.accept(o);s.payments.get(o.key).status='EXPIRED';s.payments.get(o.key).method=null;await assert.rejects(()=>s.confirm(o),e=>e.code==='live-payment-not-approved');const saved=s.db.map.get('paymentOrders/'+o.id);assert.equal(saved.state,'FAILED');assert(saved.nextPaymentCheckAt>clock);const another=await s.create('pack-driver');await s.accept(another);await s.confirm(another);assert.equal(s.approvals.size,1);passed('expired unpaid package releases reservation without charge or worker starvation');
}
{
 const s=setup(),o=await s.create();await s.accept(o);await s.confirm(o);const h=catalog.homes.find(h=>h.price===2200),request={id:'lost_reply_expiry_fixture_001',type:'command',version:s.account().version,command:{type:'buy.home',id:h.id}};await s.store.execute(uid,request);const a=s.account();a.commerce.lots[o.id].validUntil=0;s.db.map.set('economyAccounts/'+uid,a);const replay=await s.store.execute(uid,request);assert(replay.replayed);assert(replay.account.commerce.lots[o.id].expired);assert.equal(replay.account.property.cash,5000);passed('lost economy reply still replays after paid currency expires');
}
fs.mkdirSync('.dev/live-payment-20261030',{recursive:true});fs.writeFileSync('.dev/live-payment-20261030/backend-tests.json',JSON.stringify({passed:true,checks,provider:'in-memory fixture only',realCharges:0,productionWrites:0},null,2));console.log({passed:true,groups:checks.length});
