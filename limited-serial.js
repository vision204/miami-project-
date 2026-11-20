/* 한정판 시리얼 (2026-11-20) : 탄 차 튜닝 ctune 배열의 [14] 칸에 100+시리얼(101~167)을 싣는다.
   그 계정이 svr67-<시리얼> 차를 정말 가지고 있을 때만 그대로 중계하고, 아니면 0 으로 지운다.
   0 · 1 은 NIGHT BAT 비행 표시라 건드리지 않는다. */
import {assetSlots} from './economy-engine.js';
export const SERIAL_BASE=100;
export function ownsSerial(account,n){try{return !!account?.property&&assetSlots(account.property).some(({r})=>r?.a==='svr67-'+n&&r.k==='tz_lanza');}catch{return false;}}
export function sanitizeSerial(v,account){const x=v[14]|0;if(x<=SERIAL_BASE||x>SERIAL_BASE+67)return v;if(!ownsSerial(account,x-SERIAL_BASE))v[14]=0;return v;}
