import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {TestPayments} from './payment-test.js';import {ReviewDB} from '../tools/payment-review-db.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('./economy-catalog.json',import.meta.url))),db=new ReviewDB();
let now=Date.now(),payment,providerCalls=0;
const config={enabled:true,secret:'test_gsk_fake',client:'test_gck_fake',users:['qa'],gameEnabled:true};
const svc=new TestPayments(db,{catalog,config,fetcher:async()=>{providerCalls++;return {ok:true,json:async()=>structuredClone(payment)};}});svc.game.now=()=>now;
const game=r=>svc.execute('qa',{action:'game',request:r}),load=()=>game({type:'load',id:'load_review_1234567890'});
await assert.rejects(()=>svc.execute('outsider',{action:'game',request:{type:'load',id:'load_review_1234567890'}}),e=>e.code==='test-account-required');
const disabled=new TestPayments(db,{config:{...config,gameEnabled:false}});
await assert.rejects(()=>disabled.execute('qa',{action:'game',request:{type:'load',id:'load_review_1234567890'}}),e=>e.code==='test-game-disabled');
const start=await load();assert.equal(start.account.property.cash,0);assert.equal(start.reviewGame,true);
const home=catalog.homes.find(h=>h.price===2200);assert(home);
const buy={type:'command',id:'buy_review_1234567890',version:start.account.version,command:{type:'buy.home',id:home.id}};
await assert.rejects(()=>game(buy),e=>e.code==='insufficient-funds');
const order=await svc.execute('qa',{action:'create',requestId:'review_order_1234567890',productId:'cash-starter'});
assert.equal((await load()).account.property.cash,0,'unapproved order cannot grant credit');
payment={orderId:order.id,paymentKey:'sandbox_review_key_123456',currency:'KRW',totalAmount:6500,balanceAmount:6500,status:'DONE'};
const confirm={action:'confirm',orderId:order.id,amount:6500,paymentKey:payment.paymentKey};await svc.execute('qa',confirm);
assert.equal((await load()).account.property.cash,4000000);
const [a,b]=await Promise.all([game(buy),game(buy)]);assert.equal([a,b].filter(x=>x.replayed).length,1);
assert.equal(a.account.property.cash,3997800);assert(a.account.property.homes.includes(home.id));
assert.equal(db.map.get('paymentTestOrders/'+order.id).grant.used,2200);assert.equal(db.map.get('paymentTestOrders/'+order.id).grant.remaining,3997800);assert.equal(db.map.get('paymentTestWallets/qa').units,3997800);
await svc.execute('qa',confirm);assert.equal((await load()).account.property.cash,3997800,'confirm replay must not restore spent units');
await assert.rejects(()=>game({...buy,command:{type:'buy.home',id:'different'}}),e=>e.code==='idempotency-conflict');
await assert.rejects(()=>game({type:'command',id:'forged_reward_1234567',version:a.account.version,command:{type:'redeem.coupon',code:'imtester'}}),e=>e.code==='review-command-disabled');
// Real purchase engine, real server vehicle price; client-supplied quote cannot set price.
const current=await load(),vehicle=catalog.vehicles.find(v=>v.id==='sedan');assert.equal(vehicle.price,22500);
const car=await game({type:'command',id:'buy_car_review_12345678',version:current.account.version,command:{type:'buy.vehicle',kind:'sedan',home:home.id,color:0xffffff,price:1,quote:1}});
assert.equal(car.account.property.cash,3975300);assert.equal(car.account.property.cars[home.id][0].p,22500);
// Reopen a durable ledger and retry a completed purchase with its original intent.
const persistedFile=path.join(os.tmpdir(),'smm2-review-'+process.pid+'-'+Date.now()+'.json');
try{fs.writeFileSync(persistedFile,JSON.stringify([...db.map]));const reopened=new ReviewDB(persistedFile),afterRestart=new TestPayments(reopened,{catalog,config});const replay=await afterRestart.execute('qa',{action:'game',request:buy});assert(replay.replayed);assert.equal(replay.account.property.cash,3975300);assert.equal(reopened.map.get('paymentTestWallets/qa').units,3975300);}finally{fs.rmSync(persistedFile,{force:true});}
const corrupt=new ReviewDB();corrupt.map=new Map([...db.map].map(([k,v])=>[k,structuredClone(v)]));corrupt.map.delete('paymentTestReceipts/'+order.id);
await assert.rejects(()=>new TestPayments(corrupt,{catalog,config}).execute('qa',{action:'game',request:{type:'load',id:'corrupt_review_1234567'}}),e=>e.code==='review-credit-mismatch');
const saved=await game({type:'save',id:'save_review_1234567890',version:car.account.version,save:{property:{...car.account.property,cash:999999999}}});assert.equal(saved.account.property.cash,3975300);
const oldOrder=db.map.get('paymentTestOrders/'+order.id);now=oldOrder.validUntil;
assert.equal((await load()).account.property.cash,0,'expired credit is not spendable');now=Date.now();
const refund=await svc.execute('qa',{action:'refund',orderId:order.id,requestId:'used_refund_123456789',reason:'unused'});
assert.equal(refund.refund.state,'REVIEW_REQUIRED');assert.equal(refund.refund.reviewReason,'usage-review');assert.equal((await load()).account.property.cash,0,'review-held credit cannot be spent');
// A second unused order can be refunded, and an existing game tab must observe the recovery.
const second=await svc.execute('qa',{action:'create',requestId:'unused_review_order_123456',productId:'cash-starter'});
payment={...payment,orderId:second.id,paymentKey:'unused_review_key_1234567'};await svc.execute('qa',{...confirm,orderId:second.id,paymentKey:payment.paymentKey});assert.equal((await load()).account.property.cash,4000000);
svc.refunds.provider=async(route)=>route.endsWith('/cancel')?{...payment,status:'CANCELED',balanceAmount:0,cancels:[{cancelStatus:'DONE',cancelAmount:6500}]}:payment;
const returned=await svc.execute('qa',{action:'refund',orderId:second.id,requestId:'unused_refund_123456789',reason:'unused'});assert.equal(returned.refund.state,'REFUNDED');assert.equal((await load()).account.property.cash,0);
// A refund and purchase race must serialize on the same order lot and wallet.
const third=await svc.execute('qa',{action:'create',requestId:'racing_review_order_123456',productId:'cash-starter'});
payment={...payment,orderId:third.id,paymentKey:'racing_review_key_1234567'};await svc.execute('qa',{...confirm,orderId:third.id,paymentKey:payment.paymentKey});
const beforeRace=await load(),otherHome=catalog.homes.find(h=>h.price===2800);
const raced=await Promise.allSettled([game({type:'command',id:'race_buy_review_1234567',version:beforeRace.account.version,command:{type:'buy.home',id:otherHome.id}}),svc.execute('qa',{action:'refund',orderId:third.id,requestId:'race_refund_review_123456',reason:'unused'})]);
assert.equal(raced[1].status,'fulfilled');const raceOrder=db.map.get('paymentTestOrders/'+third.id),raceAccount=await load();assert.equal(raceAccount.account.property.cash,0);
if(raced[0].status==='fulfilled'){assert.equal(raceOrder.grant.used,2800);assert.equal(raced[1].value.refund.state,'REVIEW_REQUIRED');}else{assert.equal(raced[1].value.refund.state,'REFUNDED');assert(!raceAccount.account.property.homes.includes(otherHome.id));}
assert([...db.map.keys()].every(k=>k.startsWith('paymentTest')));
console.log('PASS review game: QA/feature gates, zero initial money, approval-only credit, same engine house/car prices, atomic FIFO spending, duplicate/concurrent/durable restart commands, missing-proof rejection, no regrant, forged-save/reward denial, expiry, used refund review, unused refund recovery and concurrent refund/spend; only paymentTest collections.');
