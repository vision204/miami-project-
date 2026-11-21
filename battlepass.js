// 배틀패스 (2026-11-21 · Claude)
// 시즌 1 : 2026-12-01 00:00 ~ 12-29 00:00 KST (4주) · 30단계 · 단계당 1,000 XP
// · 무료 트랙 : 누구나. 프리미엄 트랙 : 실결제 상품 pass-s1 (₩6,500 · 시즌당 1회)을 산 계정.
// · 프리미엄 혜택 : 시즌 동안 게임머니로 사는 모든 물건(buy.*) 20% 할인 (연료 · 치료 · 렌트 같은 이용료 제외).
//   할인가가 그대로 구매가(r.p)로 기록되므로 되팔기 차익이 없다. 할인을 쓰거나 프리미엄 보상을 받으면 결제 lot 의 usage 가 올라가 자동 환불 대상에서 빠진다.
// · XP : 일일 미션 3개(각 200) · 주간 미션 4개(각 1,000) · 활동 XP(하루 300 한도). 돈으로 단계를 사는 기능은 없다.
// · 미션 목록은 날짜 · 주차로 정해진다(모두 같은 미션). 서버가 계정의 pass 칸에 오늘 · 이번 주 미션과 진행도를 적는다.
import {randomUUID} from 'node:crypto';
import {EconomyError} from './economy-engine.js';
const fail=(code,message,status=409)=>{throw new EconomyError(code,message,status);};
const KST=9*3600000,DAY=86400000;

export const PASS_LEVEL_XP=1000,PASS_DAILY_XP=200,PASS_WEEKLY_XP=1000,PASS_ACTIVITY_CAP=300,PASS_DISCOUNT=0.2;
export const PASS_NO_DISCOUNT=new Set(['buy.fuel','buy.heal','buy.rental']);
/* 활동 XP (economy 명령으로 서버가 확인하는 것만) */
export const PASS_ACTIVITY={job:50,race:80,air:80,heist:150,fish:10,hunt:30,cue:60,flight:40,buy:20};
export const PASS_MISSIONS={
 daily:[
  {id:'d-job2',ev:'job',goal:2,label:'일거리(택시·물류 등) 2번 완료'},
  {id:'d-race1',ev:'race',goal:1,label:'레이스 1번 완주'},
  {id:'d-fish3',ev:'fish',goal:3,label:'물고기 3마리 낚기'},
  {id:'d-hunt2',ev:'hunt',goal:2,label:'사냥 2번 수확'},
  {id:'d-cue1',ev:'cue',goal:1,label:'당구·포켓볼 1번 승리'},
  {id:'d-attend',ev:'attend',goal:1,label:'출석 보상 받기'},
  {id:'d-buy1',ev:'buy',goal:1,label:'게임머니로 아무거나 1번 사기'},
  {id:'d-flight1',ev:'flight',goal:1,label:'비행기로 다른 공항 가기'},
  {id:'d-air1',ev:'air',goal:1,label:'항공 일거리 1번 완료'}
 ],
 weekly:[
  {id:'w-job10',ev:'job',goal:10,label:'일거리 10번 완료'},
  {id:'w-race5',ev:'race',goal:5,label:'레이스 5번 완주'},
  {id:'w-fish15',ev:'fish',goal:15,label:'물고기 15마리 낚기'},
  {id:'w-heist2',ev:'heist',goal:2,label:'블랙 타이드 습격 2번 성공'},
  {id:'w-hunt10',ev:'hunt',goal:10,label:'사냥 10번 수확'},
  {id:'w-cue3',ev:'cue',goal:3,label:'당구·포켓볼 3번 승리'},
  {id:'w-attend5',ev:'attend',goal:5,label:'출석 보상 5번 받기'}
 ]
};
const free=l=>l===30?{cash:500000}:l%10===0?{cash:150000}:{cash:30000};
const prem=l=>l===30?{vehicle:{id:'ro_fulmine',color:0x7fd3ff,label:'ROSSANTE FULMINE · 시즌 1 프로스트'}}:l%5===0?{cash:300000,tickets:{royal:1}}:{cash:60000};
export const PASS_SEASONS=Object.freeze([{
 id:'s1',name:'시즌 1 · 마이애미 윈터',start:Date.parse('2026-12-01T00:00:00+09:00'),end:Date.parse('2026-12-29T00:00:00+09:00'),levels:30,product:'pass-s1',
 rewards:Array.from({length:30},(_,i)=>({level:i+1,free:free(i+1),premium:prem(i+1)}))
}]);
export const PASS_PRODUCTS=Object.freeze(PASS_SEASONS.map(s=>Object.freeze({id:s.product,name:'배틀패스 '+s.name.split(' · ')[0]+' 프리미엄',amount:6500,units:0,items:[{k:'pass',id:s.id,label:'배틀패스 '+s.name+' 프리미엄 · 시즌 동안 게임머니 구매 20% 할인 · 프리미엄 보상'}],once:true,validityMonths:12,season:s.id})));

export const passSeason=(now,id)=>id?PASS_SEASONS.find(s=>s.id===id):PASS_SEASONS.find(s=>now>=s.start&&now<s.end)||null;
const dayKey=now=>new Date(now+KST).toISOString().slice(0,10);
const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
function pick(pool,n,seed){const a=[...pool],out=[];let h=hash(seed);while(out.length<n&&a.length){h=Math.imul(h^(h>>>13),1597334677)>>>0;out.push(a.splice(h%a.length,1)[0]);}return out;}
export function passMissions(season,now){
 const day=dayKey(now),week=Math.floor((now-season.start)/(7*DAY));
 return {day,week,daily:pick(PASS_MISSIONS.daily,3,season.id+':d:'+day),weekly:pick(PASS_MISSIONS.weekly,4,season.id+':w:'+week)};
}
/* 결제 lot : 이 시즌 프리미엄을 산 lot (환불 · 만료 · 환불 보류 아님) */
export function passLot(a,season){return season?Object.values(a?.commerce?.lots||{}).find(l=>l.productId===season.product&&!l.refunded&&!l.refundHeld&&!l.expired)||null:null;}
export function passDiscount(a,cmdType,now){
 if(typeof cmdType!=='string'||!cmdType.startsWith('buy.')||PASS_NO_DISCOUNT.has(cmdType))return 0;
 const season=passSeason(now);return season&&passLot(a,season)?PASS_DISCOUNT:0;
}
/* 계정의 pass 칸을 지금 시즌 · 오늘 · 이번 주에 맞춘다 (새 날이면 일일 미션, 새 주면 주간 미션 초기화) */
export function passState(s,now){
 const season=passSeason(now);if(!season)return null;
 let P=s.pass&&typeof s.pass==='object'&&s.pass.season===season.id?s.pass:null;
 if(!P)P={season:season.id,xp:0,claimed:{free:[],premium:[]},daily:null,weekly:null,act:{day:null,xp:0},saved:0};
 const m=passMissions(season,now);
 if(P.daily?.day!==m.day)P.daily={day:m.day,list:m.daily.map(x=>({id:x.id,ev:x.ev,goal:x.goal,label:x.label,n:0,done:false}))};
 if(P.weekly?.week!==m.week)P.weekly={week:m.week,list:m.weekly.map(x=>({id:x.id,ev:x.ev,goal:x.goal,label:x.label,n:0,done:false}))};
 if(P.act?.day!==m.day)P.act={day:m.day,xp:0};
 P.claimed??={free:[],premium:[]};P.claimed.free=(P.claimed.free||[]).filter(Number.isInteger);P.claimed.premium=(P.claimed.premium||[]).filter(Number.isInteger);
 P.xp=Number.isSafeInteger(P.xp)&&P.xp>=0?Math.min(P.xp,season.levels*PASS_LEVEL_XP):0;
 s.pass=P;return {season,P};
}
/* 활동 하나 = 미션 진행 + 활동 XP(하루 한도) */
export function passEvent(s,ev,n,now){
 const st=passState(s,now);if(!st||!(n>0))return 0;const {season,P}=st,max=season.levels*PASS_LEVEL_XP;let gain=0;
 for(const m of [...P.daily.list,...P.weekly.list]){if(m.ev!==ev||m.done)continue;m.n=Math.min(m.goal,m.n+n);if(m.n>=m.goal){m.done=true;gain+=m.id.startsWith('d-')?PASS_DAILY_XP:PASS_WEEKLY_XP;}}
 const per=PASS_ACTIVITY[ev]||0;if(per){const add=Math.min(per*n,PASS_ACTIVITY_CAP-P.act.xp);if(add>0){P.act.xp+=add;gain+=add;}}
 P.xp=Math.min(max,P.xp+gain);return gain;
}
/* 명령 하나가 끝난 뒤 : 어떤 활동이었는지 서버 결과로 판단 */
export function passAfterCommand(s,cmd,result,spent,now){
 const t=cmd?.type,evs=[];
 if(t==='job.settle'&&result?.reward>0&&!result.already){const k=s.work?.last?.type;evs.push([k==='race'?'race':k==='air'?'air':'job',1]);if(k==='air')evs.push(['job',1]);}
 else if(t==='heist.settle'&&result?.reward>0&&!result.already)evs.push(['heist',1]);
 else if(t==='fishing.settle'&&result?.reward>0&&!result.already)evs.push(['fish',1]);
 else if(t==='hunt.claim')evs.push(['hunt',1]);
 else if(t==='cue.claim')evs.push(['cue',1]);
 else if(t==='attendance.claim')evs.push(['attend',1]);
 else if(t==='flight.arrive'&&result?.flight?.arrivedAt===now)evs.push(['flight',1]);
 else if(typeof t==='string'&&t.startsWith('buy.')&&spent>0&&!PASS_NO_DISCOUNT.has(t))evs.push(['buy',1]);
 let gain=0;for(const [ev,n] of evs)gain+=passEvent(s,ev,n,now);return gain;
}
export const passLevel=xp=>Math.floor(xp/PASS_LEVEL_XP);
/* 보상 받기 : track = 'free' | 'premium' · level 1~30 */
export function passClaim(s,cmd,catalog,now,{credit,uuid=randomUUID}={}){
 const st=passState(s,now);if(!st)fail('pass-closed','지금은 진행 중인 배틀패스 시즌이 없어요.');
 const {season,P}=st,level=cmd.level,track=cmd.track;
 if(!Number.isInteger(level)||level<1||level>season.levels||!['free','premium'].includes(track))fail('invalid-pass','받을 보상을 확인해 주세요.',400);
 if(passLevel(P.xp)<level)fail('pass-locked','아직 이 단계에 도달하지 않았어요.');
 if(P.claimed[track].includes(level))fail('pass-claimed','이미 받은 보상이에요.');
 let lot=null;if(track==='premium'){lot=passLot(s,season);if(!lot)fail('pass-premium','프리미엄 패스를 산 계정만 받을 수 있어요.',403);}
 const R=season.rewards[level-1][track],p=s.property,got={};
 if(R.cash){credit(s,R.cash);got.cash=R.cash;}
 if(R.tickets){p.gunmods??={};const sk=p.gunmods.__skins??={inv:[],eq:{},pity:0};sk.tickets??={};for(const [id,k] of Object.entries(R.tickets))sk.tickets[id]=(sk.tickets[id]|0)+k;got.tickets=R.tickets;}
 if(R.vehicle){const K=catalog.vehicles.find(k=>k.id===R.vehicle.id&&k.type==='car');if(!K)fail('pass-review','보상 차량을 확인해야 해요.',503);p.over??=[];if(p.over.length>=200)fail('capacity','차량 보관함을 정리해 주세요.');
  const r={a:uuid(),k:K.id,p:0,c:R.vehicle.color,season:season.id};if(K.fuel)r.f=K.fuel.capacity;p.over.push(r);got.vehicle={...R.vehicle,asset:r.a};}
 P.claimed[track].push(level);if(lot)lot.usage=(lot.usage|0)+1;
 return {level,track,got,pass:P};
}
/* 할인을 실제로 쓴 구매 : 아낀 금액을 적고 결제 lot 에 '사용'을 남긴다 (자동 환불 대상에서 빠짐) */
export function passNoteDiscount(s,saved,now){
 if(!(saved>0))return;const st=passState(s,now);if(!st)return;st.P.saved=(st.P.saved|0)+saved;const lot=passLot(s,st.season);if(lot)lot.usage=(lot.usage|0)+1;
}
