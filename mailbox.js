import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import {awardFounder,FOUNDERS_KEY,FOUNDERS_LIMIT} from './founders.js';
import {EconomyError} from './economy-engine.js';
/* 우편함 (2026-11-06 · Opus)
   · 최초 200인 로브랑브르 : 예전엔 접속하면 바로 차고에 넣었는데, 이제 우편함에서 [수령하기] 를 눌러야 받는다(이미 받은 계정은 그대로).
   · 운영 우편 : server/mailbox.json 의 mails 를 서버가 시작할 때 읽는다. 받는 건 사용자가 우편함에서 하나씩 [수령하기].
     { id, title, body, from?, at?(ms), until?(ms), to?[uid…], items:{ cash?, vehicles?:[{id,color?}], tickets?:{royal} } }
     id 는 한 번 쓰면 바꾸지 않는다(수령 기록이 id 로 남는다). 보낸 우편을 고치려면 새 id 로.
   · 수령 기록 : 계정 mailbox.claimed[id] = 받은 시각. 로브랑브르는 기존 grants[robrembre-first-200-v1] 그대로. */
export const FOUNDER_VEHICLE='sv_sovrano';
const MAX_CASH=1e9,ID=/^[a-z0-9][a-z0-9_-]{2,63}$/;
function fail(code,message,status=400){throw new EconomyError(code,message,status);}
export function founderMail(rank,at){return {id:FOUNDERS_KEY,from:'MIAMI 운영팀',at,title:'최초 200인 기념 선물 — 로브랑브르',
 body:`축하합니다! 당신은 MIAMI 최초 200명 플레이어 중 ${rank}번째로 이 도시에 발을 들였어요.\n처음부터 함께해 준 고마움을 담아, 오직 200명만 가질 수 있는 하이퍼카 '로브랑브르'를 선물로 드려요.\n아래 [수령하기]를 누르면 내 차고로 바로 들어가요. 앞으로도 MIAMI를 잘 부탁해요!`,
 items:{vehicles:[{id:FOUNDER_VEHICLE}]},founder:rank};}
export function cleanMail(list,catalog){const out=[],seen=new Set();
 for(const m of Array.isArray(list)?list:[]){
  if(!m||!ID.test(m.id)||m.id===FOUNDERS_KEY||seen.has(m.id)||typeof m.title!=='string'||!m.title||typeof m.body!=='string')throw Error('mailbox: bad mail '+JSON.stringify(m?.id));
  const it=m.items||{},cash=it.cash==null?0:it.cash;if(!Number.isSafeInteger(cash)||cash<0||cash>MAX_CASH)throw Error('mailbox: bad cash '+m.id);
  const vehicles=(it.vehicles||[]).map(v=>{const K=catalog?.vehicles?.find(k=>k.id===v?.id);if(!K||v.id===FOUNDER_VEHICLE)throw Error('mailbox: bad vehicle '+m.id+' '+v?.id);return {id:K.id,color:Number.isInteger(v.color)?v.color:null};});
  const royal=it.tickets?.royal==null?0:it.tickets.royal;if(!Number.isInteger(royal)||royal<0||royal>100)throw Error('mailbox: bad tickets '+m.id);
  if(!cash&&!vehicles.length&&!royal)throw Error('mailbox: empty mail '+m.id);
  seen.add(m.id);out.push({id:m.id,title:m.title.slice(0,80),body:m.body.slice(0,800),from:String(m.from||'MIAMI 운영팀').slice(0,30),at:Number(m.at)||0,until:Number(m.until)||0,to:Array.isArray(m.to)?m.to.map(String):null,items:{cash,vehicles,tickets:royal?{royal}:null}});}
 return out;}
export function loadMailFile(catalog,url=new URL('./mailbox.json',import.meta.url)){try{return cleanMail(JSON.parse(fs.readFileSync(url,'utf8')).mails,catalog);}catch(e){if(e.code!=='ENOENT')console.error('[mailbox] mailbox.json ignored:',e.message);return [];}}
function founderEntry(founders,uid){const e=founders?.campaign===FOUNDERS_KEY&&founders.entries?.find(e=>e.uid===uid);return e&&Number.isInteger(e.rank)&&e.rank>=1&&e.rank<=FOUNDERS_LIMIT?e:null;}
/** 이 계정에 보이는 우편 (새 것 먼저 · 받은 것도 30일 동안 보여 준다) */
export function listMail(account,uid,founders,mails,now=Date.now()){
 const claimed=account?.mailbox?.claimed||{},out=[];
 const f=founderEntry(founders,uid);if(f){const g=account?.grants?.[FOUNDERS_KEY];out.push({...founderMail(f.rank,f.at||0),claimedAt:g?g.at||1:0});}
 for(const m of mails||[]){if(m.to&&!m.to.includes(uid))continue;if(m.at&&m.at>now)continue;const c=claimed[m.id]||0;
  if(!c&&m.until&&m.until<now)continue;if(c&&now-c>30*86400000)continue;
  out.push({id:m.id,title:m.title,body:m.body,from:m.from,at:m.at,until:m.until||0,items:m.items,claimedAt:c});}
 return out.sort((a,b)=>(!!a.claimedAt-!!b.claimedAt)||(b.at-a.at)).slice(0,50);}
export function claimMail(account,uid,founders,mails,catalog,cmd,{now=Date.now(),uuid=randomUUID}={}){
 const id=cmd?.id;if(typeof id!=='string'||id.length>64)fail('invalid-mail','우편을 확인해 주세요.');
 const a=structuredClone(account);let got={};
 if(id===FOUNDERS_KEY){
  if(!founderEntry(founders,uid))fail('mail-missing','받을 수 있는 우편이 아니에요.',404);
  if(a.grants?.[FOUNDERS_KEY])fail('mail-claimed','이미 받은 선물이에요.',409);
  if(!awardFounder(a,uid,founders,catalog,{now,uuid}))fail('mail-missing','받을 수 있는 우편이 아니에요.',404);
  got={vehicles:[FOUNDER_VEHICLE]};
 }else{
  const m=(mails||[]).find(m=>m.id===id&&(!m.to||m.to.includes(uid))&&!(m.at&&m.at>now));if(!m)fail('mail-missing','받을 수 있는 우편이 아니에요.',404);
  a.mailbox??={claimed:{}};a.mailbox.claimed??={};if(a.mailbox.claimed[id])fail('mail-claimed','이미 받은 우편이에요.',409);
  if(m.until&&m.until<now)fail('mail-expired','받을 수 있는 기간이 지났어요.',409);
  const p=a.property;
  if(m.items.cash){const n=p.cash+m.items.cash;if(!Number.isSafeInteger(n)||n>Number.MAX_SAFE_INTEGER)fail('balance-overflow','잔액 한도를 초과합니다.');p.cash=n;}
  for(const v of m.items.vehicles){const K=catalog.vehicles.find(k=>k.id===v.id);if(!K)fail('mail-missing','받을 수 없는 차량이에요.',409);p.over??=[];p.over.push({a:uuid(),k:K.id,c:v.color??K.paint??0xf2f2f2,p:0,f:K.fuel?.capacity??null,gift:'mail:'+id});}
  if(m.items.tickets?.royal){p.gunmods??={};const sk=p.gunmods.__skins??={inv:[],eq:{},pity:0};sk.tickets??={};sk.tickets.royal=(sk.tickets.royal|0)+m.items.tickets.royal;}
  a.mailbox.claimed[id]=now;a.version++;a.updatedAt=now;
  got={cash:m.items.cash||0,vehicles:m.items.vehicles.map(v=>v.id),tickets:m.items.tickets};
 }
 return {account:a,result:{claimed:id,got,mail:listMail(a,uid,founders,mails,now)}};}
