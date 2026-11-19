// 미국 대륙(북서) 맵 서버 판정 (2026-11-18 · Claude) — 낚시 물 · 낚싯대 상점 · 택시 정류장 · 집 매물.
// 물 판정은 게임과 같은 지형 함수(northwest-layout.mjs = assets/northwest/layout.mjs)를 쓴다.
import {terrain} from './northwest-layout.mjs';
import {inNorthwest,NW_ROD_SHOPS,NW_TAXI,NW_TAXI_RADIUS,NW_HOMES} from './northwest-sites.js';
export {inNorthwest,NW_ROD_SHOPS,NW_TAXI,NW_TAXI_RADIUS,NW_HOMES};
const ZONE={lake:'lagoon',river:'creek',sea:'harbor'};
/** 북서 맵 물이면 낚시 구역 id · 수면 높이, 아니면 null */
export function nwWater(x,z){
 if(!Number.isFinite(x)||!Number.isFinite(z)||!inNorthwest(x,z))return null;
 const t=terrain(x,z),zone=ZONE[t.zone];
 return zone&&Number.isFinite(t.water)?{zone,level:t.water}:null;
}
/** 낚싯대 상점(TIDELINE) 계산대 앞인지 */
export const nwRodShopNear=o=>!!o&&NW_ROD_SHOPS.some(s=>(Math.hypot(s.cx-o.x,s.cz-o.z)<6||Math.hypot(s.x-o.x,s.z-o.z)<8)&&Math.abs(s.y-o.y)<3);
export const nwTaxiRoute=id=>NW_TAXI.find(r=>r.id===id)||null;
/* 2026-11-19 미국 대륙 맵 기록 (계정에 저장) : 볼링 점수(높을수록) · 3홀 골프 타수(낮을수록) · 코스 기록 ms(낮을수록).
   기록은 돈과 상관없고 화면 시계 값이라 범위만 막는다. */
const NW_CITIES=new Set(NW_HOMES.map(h=>h.city));
export const NW_COURSES=Object.freeze(['freight','hill','lakefront','air','boat']);
export function nwRecordRule(key,value){
 if(typeof key!=='string'||key.length>40||!Number.isInteger(value))return null;
 const [kind,id]=key.split(':');
 if(kind==='bowl'&&NW_CITIES.has(id)&&value>=0&&value<=300)return {better:(a,b)=>a>b};
 if(kind==='golf'&&NW_CITIES.has(id)&&value>=3&&value<=40)return {better:(a,b)=>a<b};
 if(kind==='course'&&NW_COURSES.includes(id)&&value>=15000&&value<=7200000)return {better:(a,b)=>a<b};
 return null;
}
