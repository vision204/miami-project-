import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TestPayments,TEST_PRODUCTS,MAX_PAYMENT_KRW} from './payment-test.js';
import {paymentExpiresAt,availableGrant} from './payment-validity.js';
import {refundEligibility} from './payment-refunds.js';
import {CASH_PRODUCTS,CASH_PACKS,CASH_LIVE} from '../assets/cloud/cash-catalog.js';
class DB{
 constructor(){this.map=new Map();this.tail=Promise.resolve();}
 snap(path){const d=this.map.get(path);return {exists:d!==undefined,data:()=>structuredClone(d)};}
 doc(path){return {path,get:async()=>this.snap(path)};}
 runTransaction(fn){const p=this.tail.then(async()=>{const writes=[];const out=await fn({get:async r=>this.snap(r.path),create:(r,d)=>{assert(!this.map.has(r.path));writes.push([r.path,d]);},set:(r,d,opt)=>writes.push([r.path,opt?.merge?{...this.map.get(r.path),...d}:d])});for(const[p,d]of writes)this.map.set(p,structuredClone(d));return out;});this.tail=p.catch(()=>{});return p;}
}
assert.equal(CASH_LIVE,false);assert.equal(TEST_PRODUCTS.length,11);
assert.equal(MAX_PAYMENT_KRW,100000);
assert(TEST_PRODUCTS.every(p=>Number.isSafeInteger(p.amount)&&p.amount>0&&p.amount<=MAX_PAYMENT_KRW));
assert.equal(TEST_PRODUCTS.find(p=>p.id==='cash-prestige').amount,93000);
assert.deepEqual(CASH_PACKS.map(p=>p.krw),[4900,12900,34900,89900,3500,4500]);
assert.deepEqual(TEST_PRODUCTS.slice(-2).map(p=>[p.id,p.units]),[['pack-breach',0],['pack-breach-x',0]]);
for(const [i,p]of [...CASH_PRODUCTS,...CASH_PACKS].entries()){const server=TEST_PRODUCTS[i];assert.equal(server.id,p.id);assert.equal(server.amount,p.krw);assert.equal(server.units,p.cash);assert.deepEqual(server.items,p.items||[]);assert.equal(server.validityMonths,12);}
assert.equal(new Date(paymentExpiresAt(Date.parse('2024-02-29T12:34:56Z'))).toISOString(),'2025-02-28T12:34:56.000Z');
assert.throws(()=>paymentExpiresAt(Date.now(),13));
const db=new DB();let payment,calls=0;
const svc=new TestPayments(db,{config:{enabled:true,users:['qa'],secret:'test_gsk_fake'},fetcher:async()=>{calls++;return {ok:true,json:async()=>structuredClone(payment)};}});
await assert.rejects(()=>svc.execute('qa',{action:'create',requestId:'limited_blocked_123456',productId:'pack-svr-67'}));
for(const product of TEST_PRODUCTS){
 const order=await svc.execute('qa',{action:'create',requestId:'product_test_'+product.id,productId:product.id,amount:1,units:999999999,validityMonths:999});
 assert.equal(order.amount,product.amount);assert.equal(order.validityMonths,12);
 payment={orderId:order.id,paymentKey:'key_'+product.id+'_12345678',totalAmount:order.amount,balanceAmount:order.amount,currency:'KRW',status:'DONE'};
 const data={action:'confirm',orderId:order.id,paymentKey:payment.paymentKey,amount:order.amount};
 await Promise.all([svc.execute('qa',data),svc.execute('qa',data)]);
 const saved=db.map.get('paymentTestOrders/'+order.id),receipt=db.map.get('paymentTestReceipts/'+order.id);
 assert.equal(saved.validUntil,paymentExpiresAt(saved.fulfilledAt));assert.equal(receipt.validUntil,saved.validUntil);assert.deepEqual(receipt.items,product.items);
 assert.equal(availableGrant(saved,saved.validUntil-1).units,product.units);
 assert.deepEqual(availableGrant(saved,saved.validUntil),{expired:true,units:0,items:[]});
 assert.equal(availableGrant({...saved,state:'REFUND_PENDING'},saved.validUntil-1).units,0);
 if(product.once){
  const second=await svc.execute('qa',{action:'create',requestId:'second_order_'+product.id,productId:product.id});payment={...payment,orderId:second.id,paymentKey:'second_key_'+product.id};const count=calls;
  await assert.rejects(()=>svc.execute('qa',{action:'confirm',orderId:second.id,paymentKey:payment.paymentKey,amount:second.amount}),e=>e.code==='package-already-claimed');assert.equal(calls,count,'reject before provider approval');
  assert.equal(refundEligibility(saved,receipt,{units:product.units},saved.fulfilledAt),'unsupported-product');
 }
}
const stale=await svc.execute('qa',{action:'create',requestId:'old_149000_order_12345',productId:'cash-prestige'});
db.map.get('paymentTestOrders/'+stale.id).amount=149000;
const providerCallsBeforeLimit=calls;
await assert.rejects(()=>svc.execute('qa',{action:'create',requestId:'old_149000_order_12345',productId:'cash-prestige'}),e=>e.code==='single-payment-limit');
await assert.rejects(()=>svc.execute('qa',{action:'confirm',orderId:stale.id,paymentKey:'stale_test_payment_key',amount:149000}),e=>e.code==='single-payment-limit');
assert.equal(calls,providerCallsBeforeLimit,'old over-limit orders are blocked before provider calls');
assert([...db.map.keys()].every(k=>k.startsWith('paymentTest')));
assert.equal(fs.readFileSync('index.html','utf8'),fs.readFileSync('miami_city_3d.html','utf8'));
fs.mkdirSync('.dev/payment-products',{recursive:true});fs.writeFileSync('.dev/payment-products/unit-report.json',JSON.stringify({passed:true,products:11,limitedRejected:true,calendarExpiry:true,expiryBoundary:true,packageExactlyOnce:true,refundRegression:'separate existing suite',isolated:true,live:false},null,2));
console.log('PASS: 11 catalog matches, server prices, package snapshots, exactly-once grants, one-time guard before provider approval, leap-year/expiry boundary, limited rejection, live lock, isolated records, identical HTML.');
