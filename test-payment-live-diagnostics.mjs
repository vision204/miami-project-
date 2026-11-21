// 2026-11-21 : 실결제 승인 멈춤(승인·지급 확인 중) 진단 · 복구 테스트 — 외부 API 없음
import fs from 'node:fs';import assert from 'node:assert/strict';
import {LivePayments,LIVE_POLICY_VERSION} from './payment-live.js';
import {migrateAccount} from './economy-engine.js';
import {DB} from '../tools/live-payment-qa-db.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('./economy-catalog.json',import.meta.url)));
let clock=Date.parse('2026-11-21T13:46:00Z');const uid='qa-paid',logs=[];const warn=console.warn;console.warn=(...a)=>logs.push(a.join(' '));
function setup(){
 const db=new DB();db.map.set('economyControl/config',{lockedVersion:1});db.map.set('economyAccounts/'+uid,migrateAccount(null,catalog,clock,()=>'starter-asset'));db.map.set('players/'+uid,{save:{property:{cash:5000}},name:'QA'});
 const config={configured:true,secret:'live_gsk_fixture_only',client:'live_gck_fixture_only',mid:'fixture-mid',checkoutEnabled:true,approvalEnabled:true,publicEnabled:true,users:[],giftEnabled:true};
 const payments=new Map(),calls=[];let reject=null,throwOnce=false;
 const fetcher=async(url,opts)=>{const route=url.split('/v1/payments/')[1],data=opts.body?JSON.parse(opts.body):null,key=route==='confirm'?data.paymentKey:decodeURIComponent(route.split('/')[0]),p=payments.get(key);calls.push(route==='confirm'?'confirm':'lookup');
  if(route==='confirm'){if(throwOnce){throwOnce=false;throw Error('network');}if(reject)return {ok:false,status:reject.http,json:async()=>({code:reject.code,message:reject.message})};p.status='DONE';p.method=p.method||'카드';p.approvedAt=new Date(clock).toISOString();}
  return {ok:true,json:async()=>structuredClone(p)};};
 const live=new LivePayments(db,{catalog,config,fetcher,now:()=>clock});let n=0;
 async function order(product='cash-starter',payment={}){const o=await live.execute(uid,{action:'create',productId:product,requestId:'diag_request_'+(++n).toString().padStart(16,'0')});await live.execute(uid,{action:'accept',orderId:o.id,terms:true,privacy:true,policyVersion:LIVE_POLICY_VERSION});
  const key='live_diag_payment_'+String(n).padStart(12,'0');payments.set(key,{mId:'fixture-mid',orderId:o.id,paymentKey:key,totalAmount:o.amount,balanceAmount:o.amount,currency:'KRW',status:'IN_PROGRESS',method:'카드',cancels:[],...payment});return {...o,key};}
 const confirm=o=>live.execute(uid,{action:'confirm',orderId:o.id,paymentKey:o.key,amount:o.amount});
 const doc=o=>db.map.get('paymentOrders/'+o.id);
 return {db,live,payments,calls,order,confirm,doc,setReject:r=>reject=r,failNext:()=>throwOnce=true};
}
const ok=s=>console.log('PASS '+s);
{ // 카드사 거절 → 주문 FAILED + 토스 문구 그대로 + 로그
 const s=setup(),o=await s.order();s.setReject({http:403,code:'REJECT_CARD_COMPANY',message:'카드사에서 결제를 거절했어요.'});
 await assert.rejects(()=>s.confirm(o),e=>e.code==='live-provider-rejected'&&/카드사에서 결제를 거절/.test(e.message));
 assert.equal(s.doc(o).state,'FAILED');assert.equal(s.doc(o).lastError.provider,'REJECT_CARD_COMPANY');assert(logs.some(l=>l.includes('REJECT_CARD_COMPANY')));
 const h=await s.live.execute(uid,{action:'history'});assert.match(h.orders[0].lastError,/카드사/);ok('definitive provider rejection closes the order with the provider message');
}
{ // 승인 전 결제수단 비어 있음(null) 허용
 const s=setup(),o=await s.order('cash-starter',{method:null});const r=await s.confirm(o);assert.equal(r.state,'FULFILLED');ok('IN_PROGRESS payment without method can still be approved');
}
{ // 지원하지 않는 결제수단 → 승인 호출 없이 FAILED
 const s=setup(),o=await s.order('cash-starter',{method:'계좌이체'});await assert.rejects(()=>s.confirm(o),e=>e.code==='live-method-unsupported');assert.equal(s.doc(o).state,'FAILED');assert(!s.calls.includes('confirm'));ok('unsupported method fails without approval');
}
{ // 승인 요청 중 연결 끊김 → CONFIRMING 유지 → 1분 뒤 tick 이 같은 키로 다시 승인 → 지급
 const s=setup(),o=await s.order();s.failNext();await assert.rejects(()=>s.confirm(o));assert.equal(s.doc(o).state,'CONFIRMING');assert.equal(s.doc(o).lastError.code,'live-provider-unavailable');
 clock+=61000;await s.live.tick();assert.equal(s.doc(o).state,'FULFILLED');ok('transient confirm failure is retried by the worker');
}
{ // MID 불일치는 어느 항목인지 로그
 const s=setup(),o=await s.order('cash-starter',{mId:'other-mid'});logs.length=0;await assert.rejects(()=>s.confirm(o),e=>e.code==='live-payment-mismatch'&&/mId/.test(e.message));assert(logs.some(l=>l.includes('"bad":["mId"]')&&l.includes('other-mid')));assert.equal(s.doc(o).state,'CONFIRMING');ok('mismatch names the field in logs and message');
}
{ // 확인 필요(PAYMENT_REVIEW)로 멈춘 1회 패키지 → 10분 정리에서 토스 만료 확인 → FAILED + 1회 구매 자리 풀림 → 다시 구매 가능, 내역에서 숨김
 const s=setup(),o=await s.order('pack-breach');s.failNext();await assert.rejects(()=>s.confirm(o));
 s.db.map.set('paymentOrders/'+o.id,{...s.doc(o),state:'PAYMENT_REVIEW',nextPaymentCheckAt:8000000000000000});s.payments.get(o.key).status='EXPIRED';
 let h=await s.live.execute(uid,{action:'history'});assert.equal(h.orders.length,1);
 clock+=3600000;await s.live.tick();assert.equal(s.doc(o).state,'FAILED');
 h=await s.live.execute(uid,{action:'history'});assert.equal(h.orders.length,0,'unpaid orders hidden');
 const again=await s.order('pack-breach');assert.equal((await s.confirm(again)).state,'FULFILLED');ok('stuck review order is closed and the one-time package can be bought again');
}
{ // 확인 필요인데 토스에서는 승인 완료(DONE) → 다시 지급
 const s=setup(),o=await s.order('pack-breach-x');s.failNext();await assert.rejects(()=>s.confirm(o));
 s.payments.get(o.key).status='DONE';s.payments.get(o.key).approvedAt=new Date(clock).toISOString();s.db.map.set('paymentOrders/'+o.id,{...s.doc(o),state:'PAYMENT_REVIEW',nextPaymentCheckAt:8000000000000000});
 clock+=600001;await s.live.tick();assert.equal(s.doc(o).state,'FULFILLED');ok('paid review order is granted');
}
{ // 주문만 만들고 결제 안 한 주문(CREATED)은 내역에 안 보임
 const s=setup();await s.order();const h=await s.live.execute(uid,{action:'history'});assert.equal(h.orders.length,0);ok('created-only orders are hidden');
}
console.warn=warn;console.log('PASS all diagnostics');
