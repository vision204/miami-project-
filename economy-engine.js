import {randomUUID, randomInt} from 'node:crypto';
import {JOBS,jobPayout,cleanJobSave} from './economy-job-core.js';
import {TIDE,distance} from './heist-layout.js';
import{RODS,DOCKS,zoneAt,rollFish,fishById,payout}from'./fishing-catalog.js';
import {GOLF_SETS} from './golf-items.js';

export class EconomyError extends Error {
  constructor(code, message, status=400){super(message);this.code=code;this.status=status;}
}
const fail=(code,message,status)=>{throw new EconomyError(code,message,status);};
const copy=x=>JSON.parse(JSON.stringify(x));
const money=x=>Number.isSafeInteger(x)&&x>=0;
const list=x=>Array.isArray(x)?x:[];
const owns=(a,id)=>list(a).includes(id);
const add=(o,k,id)=>{o[k]=[...new Set([...list(o[k]),id])];};
const entry=(a,id)=>list(a).find(x=>String(x.id)===String(id))||fail('unknown-item','등록되지 않은 상품입니다.');
const paint=x=>Number.isInteger(x)&&x>=0&&x<=0xffffff?x:0xffffff;
const charge=(s,n)=>{if(!money(n))fail('invalid-price','서버 가격을 확인할 수 없습니다.',503);if(s.property.cash<n)fail('insufficient-funds','서버 잔액이 부족합니다.',409);s.property.cash-=n;return n;};
const credit=(s,n)=>{if(!money(n)||!money(s.property.cash+n))fail('balance-overflow','잔액 한도를 초과합니다.');s.property.cash+=n;};
export const saleRefund=paid=>Math.floor(paid/5)*2+Math.floor((paid%5)*2/5);

// All physical assets carry a server-generated identity independent of model/paint.
export function assetSlots(p){
 const out=[];const arrays=(obj,prefix)=>{for(const [id,a] of Object.entries(obj||{}))for(const r of list(a))if(r&&typeof r==='object')out.push({r,where:prefix+id,remove:()=>a.splice(a.indexOf(r),1)});};
 arrays(p.cars,'car:');arrays(p.pent?.cars,'pent:');arrays(p.hangars?.planes,'plane:');
 for(const [id,r] of Object.entries(p.helis||{}))if(r)out.push({r,where:'heli:'+id,remove:()=>delete p.helis[id]});
 for(const r of list(p.boats?.boats))out.push({r,where:'boat',remove:()=>p.boats.boats.splice(p.boats.boats.indexOf(r),1)});
 for(const r of list(p.over))out.push({r,where:'over',remove:()=>p.over.splice(p.over.indexOf(r),1)});
 if(p.starter?.car)out.push({r:p.starter.car,where:'starter',remove:()=>p.starter.car=null});
 return out;
}
export function migrateAccount(legacy,catalog,now=Date.now(),uuid=randomUUID){
 // Never accept a browser migration payload. Caller supplies a database snapshot.
 const p=copy(legacy?.save?.property||{cash:5000,homes:[],guns:['fists']});
 // Older game snapshots wrote each AURELIS garage both in cars[id] and
 // pent.cars[floor]. Collapse only these aliases, retaining genuine multiples.
 for(const [id,rows]of Object.entries(p.cars||{})){
  const match=/^aurelis-ph-(\d+)$/.exec(id);if(!match||!Array.isArray(rows))continue;
  p.pent??={owned:[],cars:{}};p.pent.cars??={};const canonical=p.pent.cars[match[1]]??=[];
  const signature=r=>JSON.stringify([r.a??null,r.k,r.c,r.p??null,r.f??null,r.t??null]);
  const remaining=new Map();for(const r of canonical){const key=signature(r);remaining.set(key,(remaining.get(key)||0)+1);}
  for(const r of rows){const key=signature(r),n=remaining.get(key)||0;if(n)remaining.set(key,n-1);else canonical.push(r);}
  delete p.cars[id];
 }
 if(!money(p.cash))fail('migration-review','기존 잔액을 관리자에게 확인해야 합니다.',409);
 const seen=new Set();for(const {r,where} of assetSlots(p)){
  if(!r.a||seen.has(r.a))r.a=uuid();seen.add(r.a);
  const K=catalog.vehicles.find(k=>k.id===r.k);
  // Preserve unknown historical models; they remain stored, but cannot be sold until catalogued.
  r.p=where==='starter'?0:money(r.p)?r.p:K?.price??0;
 }
 if(!p.starter?.given&&!list(p.homes).length&&!list(p.pent?.owned).length){const k=entry(catalog.vehicles,catalog.starter);p.starter={given:true,car:{a:uuid(),k:k.id,p:0,c:0xf2f2f0,f:k.fuel?.capacity??null}};}
 p.guns=[...new Set(['fists',...list(p.guns)])];
 p.golf={owned:[],equipped:'rental'};
 return {schema:1,version:0,property:p,work:copy(legacy?.work||{}),coupons:copy(legacy?.redeemedCoupons||{}),migratedAt:now,migrationSource:'players-database',updatedAt:now};
}
function garage(p,c,id,type){
 if(type==='plane'){const h=entry(c.hangars,id);if(!owns(p.hangars?.owned,id))fail('not-owner','내 격납고가 아닙니다.',403);p.hangars.planes??={};return {a:p.hangars.planes[id]??=[],slots:h.slots};}
 if(/^aurelis-ph-/.test(id)){const f=Number(id.slice(11));if(!owns(p.pent?.owned,f))fail('not-owner','내 타워 차고가 아닙니다.',403);p.pent.cars??={};return {a:p.pent.cars[f]??=[],slots:6,bunker:false};}
 const h=entry(c.homes,id);if(!owns(p.homes,id))fail('not-owner','내 차고가 아닙니다.',403);p.cars??={};return {a:p.cars[id]??=[],slots:h.slots,bunker:h.bunker,heli:h.heli};
}
const asset=(p,id)=>assetSlots(p).find(x=>x.r.a===id)||fail('not-owner','소유하지 않거나 이미 판매한 차량입니다.',403);
function tuneClean(t={}){const out={};for(const [k,max] of Object.entries({f:2,w:6,s:3,l:2,n:8,e:3,x:3,b:3,y:3,u:3,rc:16,wr:3,wc:16,ee:20})){if(t[k]!==undefined){if(!Number.isInteger(t[k])||t[k]<0||t[k]>max)fail('invalid-tuning','잘못된 튜닝 값입니다.');out[k]=t[k];}}for(const k of ['tb','ni','ap','fx'])if(t[k])out[k]=true;if(t.pl!==undefined){if(typeof t.pl!=='string'||t.pl.length>12)fail('invalid-plate','번호판을 확인해 주세요.');out.pl=t.pl;}return out;}
export function tuningCost(o,n,P){let v=0;const a=o.t||{},b=n.t||{};if(n.c!==o.c)v+=P.paint;for(const k of ['f','s','l'])if((a[k]||0)!==(b[k]||0))v+=P[k][b[k]||0];if((a.w||0)!==(b.w||0))v+=P.w;for(const k of ['n','pl'])if((b[k]||'')!==(a[k]||'')&&b[k])v+=P[k];for(const k of ['e','x','b','y','u'])for(let i=(a[k]||0)+1;i<=(b[k]||0);i++)v+=P[k][i];for(const k of ['tb','ni','ap','fx'])if(b[k]&&!a[k])v+=P[k]||0;if((b.rc||0)!==(a.rc||0)&&b.rc)v+=P.rc||0;if(((b.wr||0)!==(a.wr||0)||(b.wc||0)!==(a.wc||0))&&b.wr)v+=P.wr||0;return v;}

// The server accepts intents, never client totals, cash, ownership lists or paid prices.
export function applyCommand(account,cmd,catalog,{now=Date.now(),uuid=randomUUID,roll=n=>randomInt(n),plan=null,proof=null,heistProof=null,fishingProof=null,coupons={},observation=null}={}){
 if(!account||account.schema!==1)fail('invalid-account','계정 원장을 불러올 수 없습니다.',503);
 const s=copy(account),p=s.property;let spent=0,result={};
 if(!cmd||typeof cmd.type!=='string')fail('invalid-command','거래 종류를 확인해 주세요.');
 switch(cmd.type){
 case 'buy.rod':{const q=entry(RODS,cmd.id);if(!observation||now-observation.at>2000||!DOCKS.some(d=>Math.hypot(d.x-observation.x,d.z-observation.z)<5.5&&Math.abs(d.y-observation.y)<3)||observation.car)fail('fishing-shop-location','부두 낚시 상인 앞에서 구매해 주세요.',409);p.fishing??={owned:[],equipped:null};if(owns(p.fishing.owned,q.id))fail('already-owned','이미 가진 낚싯대입니다.',409);spent=charge(s,q.price);add(p.fishing,'owned',q.id);p.fishing.equipped=q.id;break;}
 case 'equip.rod':{entry(RODS,cmd.id);if(!owns(p.fishing?.owned,cmd.id))fail('not-owner','구매한 낚싯대만 장착할 수 있어요.',403);p.fishing.equipped=cmd.id;break;}
 case 'fishing.start':{
  if(typeof cmd.run!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(cmd.run))fail('invalid-fishing','낚시 식별자를 확인해 주세요.');
  if(s.heist?.active||s.work?.active?.expiresAt>now||s.fishing?.active?.expiresAt>now)fail('job-active','진행 중인 낚시나 작업을 먼저 끝내세요.',409);
  const rod=RODS.find(r=>r.id===p.fishing?.equipped);if(!rod||!owns(p.fishing?.owned,rod.id))fail('rod-required','먼저 부두 상인에게 낚싯대를 구매하세요.',409);
  const o=observation,K=catalog.vehicles?.[o?.kind],boat=o?.car&&K?.type==='boat',target=cmd.target;
  if(!o||now-o.at>1500||!Number.isFinite(o.speed)||Math.abs(o.speed)>.35||(o.flags&18)||o.hp<=0||(o.car&&!boat)||o.y<(boat?-2:-.1)||o.y>(boat?18:5))fail('fishing-location','물가나 정박한 배 위에서 멈춰 낚시하세요.',409);
  if(!Array.isArray(target)||target.length!==2||!target.every(Number.isFinite))fail('fishing-water','물 위를 향해 던지세요.');
  const range=Math.hypot(target[0]-o.x,target[1]-o.z),zone=zoneAt(...target);if(!zone||range<3||range>rod.range+1)fail('fishing-water','낚싯대 사거리 안의 수면을 선택하세요.',409);
  const caught=rollFish(zone,roll);s.fishing={...(s.fishing||{}),active:{id:cmd.run,rod:rod.id,zone,target,origin:{x:o.x,y:o.y,z:o.z},startedAt:now,biteAt:now+6000+roll(6000),expiresAt:now+125000,catch:caught}};result={active:s.fishing.active};break;
 }
 case 'fishing.settle':{
  const f=s.fishing||{},a=f.active;if(!a||a.id!==cmd.run){if(f.last?.id===cmd.run){result={reward:0,already:true,catch:f.last.catch};break;}fail('invalid-fishing','진행 중인 낚시가 아닙니다.',409);}
  let caught=null,reward=0;if(cmd.completed===true){if(!fishingProof?.valid||fishingProof.id!==a.id||JSON.stringify(fishingProof.catch)!==JSON.stringify(a.catch))fail('fishing-unverified','서버에서 포획을 확인하지 못했습니다.',409);caught=a.catch;const fish=fishById(caught.fish);reward=payout(fish,caught.grams);credit(s,reward);f.records??={};const r=f.records[fish.id]||{count:0,grams:0,length:0};f.records[fish.id]={count:r.count+1,grams:Math.max(r.grams,caught.grams),length:Math.max(r.length,caught.length)};f.total=(f.total||0)+1;f.earnings=(f.earnings||0)+reward;}
  s.fishing={...f,active:null,last:{id:a.id,catch:caught,reward,at:now}};result={catch:caught,reward};break;
 }

 case 'buy.golf':{const q=entry(GOLF_SETS,cmd.id);p.golf??={owned:[],equipped:'rental'};if(owns(p.golf.owned,q.id))fail('already-owned','이미 보유한 골프채 세트입니다.',409);spent=charge(s,q.price);add(p.golf,'owned',q.id);p.golf.equipped=q.id;break;}
 case 'equip.golf':{p.golf??={owned:[],equipped:'rental'};if(cmd.id!=='rental'){entry(GOLF_SETS,cmd.id);if(!owns(p.golf.owned,cmd.id))fail('not-owner','구매한 골프채만 장착할 수 있습니다.',403);}p.golf.equipped=cmd.id;break;}
 case 'heist.start':{if(typeof cmd.run!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(cmd.run))fail('invalid-heist','작업 식별자가 필요합니다.');if(s.heist?.active||s.work?.active?.expiresAt>now||s.fishing?.active?.expiresAt>now)fail('job-active','진행 중인 작업을 먼저 종료하세요.',409);if(!observation||now-observation.at>1500||observation.car||distance(observation,TIDE.start)>7||Math.abs(observation.y-TIDE.y)>2)fail('heist-location','항구 집결지에서 하차한 뒤 시작하세요.',409);s.heist={...(s.heist||{}),active:{id:cmd.run,type:TIDE.id,startedAt:now}};result={active:s.heist.active};break;}
 case 'heist.settle':{const h=s.heist||{},a=h.active;if(!a||a.id!==cmd.run){if(h.last?.id===cmd.run){result={reward:0,already:true};break;}fail('invalid-heist','진행 중인 습격이 아닙니다.',409);}let reward=0;if(cmd.completed){if(!heistProof?.valid||heistProof.id!==a.id)fail('heist-unverified','서버에서 회수와 탈출을 확인하지 못했습니다.',409);reward=heistProof.reward;if(![TIDE.reward,TIDE.reward+10000].includes(reward))fail('heist-unverified','보상을 확인할 수 없습니다.',409);credit(s,reward);}s.heist={active:null,last:{id:a.id,completed:!!cmd.completed,reward,seconds:cmd.completed?heistProof.seconds:null,at:now},best:cmd.completed?Math.min(h.best||Infinity,heistProof.seconds):h.best||null};result={reward,heist:s.heist};break;}
 case 'vehicle.use':{const a=asset(p,cmd.asset);if(a.r.k!==cmd.kind)fail('forged-assets','차종과 서버 소유권이 일치하지 않습니다.',403);result={asset:a.r};break;}
 case 'claim.vehicle':{const K=entry(catalog.vehicles,cmd.kind);if(!K.street||!observation?.car||catalog.fleet?.[observation.kind]!==K.id||now-observation.at>5000)fail('invalid-claim','길거리 차량 탑승을 서버에서 확인하지 못했습니다.',409);const g=garage(p,catalog,cmd.home,'car');if(g.a.length>=g.slots||g.bunker)fail('capacity','차고에 빈 자리가 없습니다.');const h=catalog.homes.find(h=>h.id===cmd.home);if(h&&Math.hypot(observation.x-h.x,observation.z-h.z)>100)fail('invalid-claim','내 차고 앞에서 보관해 주세요.');const r={a:uuid(),k:K.id,p:0,c:paint(cmd.color)};if(K.fuel)r.f=K.fuel.capacity;g.a.push(r);result={asset:r};break;}
 case 'redeem.coupon':{const code=String(cmd.code||'').trim().toLowerCase(),n=coupons[code];if(!money(n)||!n)fail('invalid-coupon','사용할 수 없는 쿠폰입니다.');s.coupons??={};if(s.coupons[code])fail('already-redeemed','이미 사용한 쿠폰입니다.',409);credit(s,n);s.coupons[code]=true;result={reward:n};break;}
 case 'job.start':{if(typeof cmd.run!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(cmd.run))fail('invalid-job','업무 식별자가 필요합니다.');const d=JOBS[cmd.job];if(!d||!plan?.goals?.length)fail('invalid-job','일거리 경로를 확인할 수 없습니다.');const w={...cleanJobSave(s.work),active:s.work?.active||null};if(w.active&&w.active.expiresAt>now)fail('job-active','진행 중인 일거리가 있습니다.',409);if((w.next[cmd.job]||0)>now)fail('job-cooldown','재도전 대기시간이 남았습니다.',409);let owned=false,vehicleKind=d.rental;if(cmd.asset){const a=asset(p,cmd.asset),K=entry(catalog.vehicles,a.r.k);if(!K.jobs?.includes(cmd.job)||!observation?.car||catalog.fleet?.[observation.kind]!==K.id)fail('invalid-job-vehicle','업무에 맞는 개인 장비가 아닙니다.');owned=true;vehicleKind=K.id;}const fee=owned?0:d.fee;spent=charge(s,fee);if(d.cooldown)w.next[cmd.job]=now+d.cooldown;w.active={id:cmd.run,type:cmd.job,owned,fee,startedAt:now,expiresAt:now+3600000,vehicleKind,plan};s.work=w;result={ledger:w,cash:p.cash,plan};break;}
 case 'job.settle':{const w=s.work||{},a=w.active;if(!a||a.id!==cmd.run){if(w.last?.id===cmd.run){result={ledger:w,reward:0,cash:p.cash,already:true};break;}fail('invalid-job','진행 중인 일거리가 아닙니다.',409);}let reward=0;if(cmd.completed){if(!proof||proof.invalid||!proof.finishedAt||proof.id!==a.id||a.expiresAt<now)fail('job-unverified','서버에서 경유지 통과를 확인하지 못했습니다.',409);const elapsed=(proof.finishedAt-(proof.raceAt||a.startedAt))/1000,min=a.plan.length/(a.type==='air'?300:130);if((proof.finishedAt-a.startedAt)/1000<min)fail('job-too-fast','운행 시간을 확인할 수 없습니다.',409);const gold=a.type==='race'?Math.max(110,a.plan.length/20):a.type==='air'?Math.max(600,a.plan.length/45):Math.max(300,a.plan.length/10);const punctual=Math.max(0,Math.min(1,1-(elapsed-gold)/(gold*.5))),quality=a.type==='race'?(elapsed<=gold?1:elapsed<=gold*1.5?.5:0):.5+.5*punctual;reward=jobPayout(a.type,quality,a.owned).total;credit(s,reward);}const next={...cleanJobSave(w),active:null};next.runs++;next.earned+=reward;next.last={id:a.id,type:a.type,completed:!!cmd.completed,total:reward,at:now};s.work=next;result={ledger:next,reward,cash:p.cash};break;}
 case 'buy.vehicle': {
  const K=entry(catalog.vehicles,cmd.kind),type=K.type;if(K.sale===false)fail('not-for-sale','상점에서 판매하지 않는 차량입니다.');if(K.id==='war_drone')fail('invalid-command','드론 라이선스 구매를 이용해 주세요.');
  if(type==='boat'){p.boats??={seq:0,boats:[]};if(list(p.boats.boats).length>=200)fail('capacity','보유 한도입니다.');}
  let target;if(type==='car'||type==='plane')target=garage(p,catalog,cmd.home,type);
  if(target&&(target.a.length>=target.slots||type==='car'&&!!K.bunker!==!!target.bunker))fail('capacity','맞는 차고에 빈 자리가 없습니다.',409);
  if(type==='heli'){const h=entry(catalog.homes,cmd.home);if(!owns(p.homes,cmd.home)||!h.heli)fail('not-owner','내 헬리패드가 아닙니다.',403);p.helis??={};if(p.helis[cmd.home])fail('capacity','헬리패드가 이미 차 있습니다.',409);}
  spent=charge(s,K.price);const r={a:uuid(),k:K.id,p:spent,c:paint(cmd.color)};if(K.fuel)r.f=K.fuel.capacity;
  if(type==='boat'){r.id='boat-'+(++p.boats.seq);r.col=r.c;p.boats.boats.push(r);}
  else if(type==='plane'){r.id='air-'+(p.hangars.seq=(p.hangars.seq||0)+1);target.a.push(r);}
  else if(type==='heli')p.helis[cmd.home]=r;else target.a.push(r);
  result={asset:r};break;
 }
 case 'sell.vehicle':{
  const a=asset(p,cmd.asset),K=entry(catalog.vehicles,a.r.k);if(K.type!=='car')fail('unsupported-sale','이 탈것의 판매는 지원하지 않습니다.');
  const refund=saleRefund(a.r.p);a.remove();credit(s,refund);result={refund};break;
 }
 case 'buy.home':{const h=entry(catalog.homes,cmd.id);if(owns(p.homes,h.id))fail('already-owned','이미 보유 중입니다.',409);spent=charge(s,h.price);add(p,'homes',h.id);p.cars??={};p.cars[h.id]=[];p.designs??={};p.designs[h.id]=(h.bunker?catalog.bunkerDesigns:catalog.homeDesigns)?.includes(cmd.design)?cmd.design:h.bunker?'military':'coastal';p.spawn??=h.id;break;}
 case 'buy.hangar':{const h=entry(catalog.hangars,cmd.id);p.hangars??={owned:[],planes:{},seq:0};if(owns(p.hangars.owned,h.id))fail('already-owned','이미 보유 중입니다.',409);spent=charge(s,h.price);add(p.hangars,'owned',h.id);p.hangars.planes??={};p.hangars.planes[h.id]=[];break;}
 case 'buy.penthouse':{const h=list(catalog.penthouses).find(h=>h.floor===cmd.floor)||fail('unknown-item','없는 층입니다.');p.pent??={owned:[],cars:{},rooms:{}};if(owns(p.pent.owned,h.floor))fail('already-owned','이미 보유 중입니다.',409);spent=charge(s,h.price);add(p.pent,'owned',h.floor);break;}
 case 'buy.gun':{const w=entry(catalog.guns,cmd.id);if(owns(p.guns,w.id))fail('already-owned','이미 보유 중입니다.',409);spent=charge(s,w.price);add(p,'guns',w.id);break;}
 case 'buy.clothes':{const q=entry(catalog.clothes,cmd.id);p.clothes??={owned:[0]};if(!owns(p.clothes.owned,q.id)){spent=charge(s,q.p);add(p.clothes,'owned',q.id);}break;}
 case 'buy.luxury':{const q=list(catalog.lux).find(q=>q.k===cmd.kind&&q.id===cmd.id)||fail('unknown-item','없는 상품입니다.');const key={t:'tops',b:'bottoms',w:'watches'}[q.k];p.lux??={tops:[],bottoms:[],watches:[]};if(!owns(p.lux[key],q.id)){if(q.o?.tier&&catalog.lux.some(w=>w.k==='w'&&w.brand===q.brand&&w.o?.tier<q.o.tier&&!owns(p.lux.watches,w.id)))fail('prerequisite','앞 단계 시계를 먼저 소장해야 합니다.');spent=charge(s,q.p);add(p.lux,key,q.id);}break;}
 case 'buy.drone':{const q=entry(catalog.vehicles,cmd.kind);if(q.id!=='war_drone')fail('unknown-item','없는 장비입니다.');if(p.war?.drone)fail('already-owned','이미 보유 중입니다.',409);spent=charge(s,q.price);p.war={drone:true};break;}
 case 'buy.armor':{const q=catalog.armor[cmd.index];if(!q)fail('unknown-item','없는 방탄복입니다.');if((p.armor||0)>=q.v)fail('already-owned','현재 방탄복으로 충분합니다.',409);spent=charge(s,q.p);p.armor=q.v;break;}
 case 'buy.parts':{if(!owns(p.guns,cmd.weapon))fail('not-owner','내 무기가 아닙니다.',403);if(!Array.isArray(cmd.selection)||cmd.selection.length!==catalog.partSlots.length)fail('invalid-parts','파츠를 확인해 주세요.');p.gunmods??={};const r=p.gunmods[cmd.weapon]??={o:[],e:[]};cmd.selection.forEach((i,k)=>{const slot=catalog.partSlots[k],q=catalog.parts[slot]?.[i];if(!q||!catalog.partAllowed[cmd.weapon]?.[slot]?.[i])fail('invalid-parts','장착할 수 없는 파츠입니다.');const id=slot+':'+q.id;if(i&&!owns(r.o,id)){spent+=q.p;r.o.push(id);}});charge(s,spent);r.e=[...cmd.selection];break;}
 case 'buy.interior':{if(!owns(p.pent?.owned,cmd.floor))fail('not-owner','내 층이 아닙니다.',403);if(!Array.isArray(cmd.selection)||cmd.selection.length!==6)fail('invalid-interior','인테리어 선택을 확인해 주세요.');p.pent.rooms??={};const r=p.pent.rooms[cmd.floor]??={sel:[0,0,0,0,0,0],own:['','','','','','']};cmd.selection.forEach((i,k)=>{if(!Number.isInteger(i)||!catalog.pentSets[i])fail('invalid-interior','없는 인테리어입니다.');const have=String(r.own[k]||'').split(',').filter(Boolean).map(Number);if(i&&!have.includes(i)){spent+=catalog.pentItemPrices[k][i];have.push(i);r.own[k]=have.join(',');}});if(cmd.selection[0]&&cmd.selection.every(i=>i===cmd.selection[0]))spent=Math.round(spent*.8/10000)*10000;charge(s,spent);r.sel=[...cmd.selection];break;}
 case 'buy.tuning':{const a=asset(p,cmd.asset),t=tuneClean(cmd.tuning),c=paint(cmd.color);delete t.ee;if(a.r.t?.ee)t.ee=a.r.t.ee;spent=charge(s,tuningCost({t:a.r.t,c:a.r.c},{t,c},catalog.tune));a.r.t=t;a.r.c=c;result={asset:a.r};break;}
 case 'tune.enhance':{const a=asset(p,cmd.asset),t=tuneClean(a.r.t||{}),E=catalog.tune?.ee;if(!E)fail('invalid-command','강화를 쓸 수 없습니다.');if((t.e||0)<3)fail('enhance-locked','엔진 3단계부터 강화할 수 있어요.');const lv=t.ee||0;if(lv>=E.rate.length)fail('enhance-max','이미 최고 단계예요.');spent=charge(s,E.cost[lv]);const ok=roll(10000)<Math.round(E.rate[lv]*100);if(ok)t.ee=lv+1;a.r.t=t;result={asset:a.r,success:ok,level:t.ee||0};break;}
 case 'buy.skinbox':{const B=entry(catalog.boxes,cmd.id);spent=charge(s,B.price);p.gunmods??={};const sk=p.gunmods.__skins??={inv:[],eq:{},pity:0};if(B.pity)sk.pity=(sk.pity||0)+1;let n=roll(1000000)/1000000,t=0;for(;t<4&&n>=B.odds[t];t++)n-=B.odds[t];let pool=catalog.skins.filter(k=>k.t===t),pity=false;if(B.pity&&sk.pity>=catalog.pity&&t!==4){pool=catalog.skins.filter(k=>k.t===4);const fresh=pool.filter(k=>!owns(sk.inv,k.id));if(fresh.length)pool=fresh;pity=true;}const win=pool[roll(pool.length)];if(win.t===4&&B.pity)sk.pity=0;const dup=owns(sk.inv,win.id),back=dup?B.refund[win.t]:0;if(dup)credit(s,back);else add(sk,'inv',win.id);result={skin:{id:win.id,dup,back,pity,box:B.id}};break;}
 case 'buy.food':{const menu=entry(catalog.menus,cmd.shop).menu,q=menu[cmd.index];if(!q)fail('unknown-item','없는 메뉴입니다.');spent=charge(s,q[1]);result={heal:q[2]||0};break;}
 case 'buy.heal':spent=charge(s,catalog.healPrice);break;
 case 'buy.rental':spent=charge(s,entry(catalog.rentals,cmd.id).fee);break;
 case 'buy.fuel':{const a=asset(p,cmd.asset),K=entry(catalog.vehicles,a.r.k);if(!K.fuel)fail('unknown-item','주유할 수 없는 차량입니다.');const have=Number.isFinite(a.r.f)?a.r.f:K.fuel.capacity,amount=cmd.amount==='full'?K.fuel.capacity:cmd.amount;if(!Number.isFinite(amount)||amount<0)fail('invalid-fuel','주유량을 확인해 주세요.');const liters=Math.min(K.fuel.capacity-have,amount);spent=charge(s,Math.round(liters*20));a.r.f=have+liters;result={liters,cost:spent,capacity:K.fuel.capacity};break;}
 default:fail('unsupported-command','서버에서 지원하지 않는 거래입니다.');
 }
 s.version++;s.updatedAt=now;return {account:s,result:{...result,spent}};
}

// Saves may move existing assets between owned garages and consume fuel/armor;
// no save proposal can mint assets, change paid price, grant items or set cash.
export function applyProgress(account,proposal,catalog,now=Date.now()){
 const s=copy(account),p=s.property,v=proposal?.property||{};
 const all=assetSlots(p),offered=assetSlots(v),seen=new Set();
 for(const o of offered){if(!o.r.a||seen.has(o.r.a))fail('invalid-assets','차량 식별자를 확인해 주세요.');seen.add(o.r.a);const a=all.find(a=>a.r.a===o.r.a);if(!a||a.r.k!==o.r.k)fail('forged-assets','서버 소유권과 일치하지 않습니다.',403);if(o.r.p!==a.r.p)fail('forged-price','구매 가격을 바꿀 수 없습니다.',403);
  const K=catalog.vehicles.find(k=>k.id===a.r.k);if(Number.isFinite(o.r.f)&&K?.fuel)a.r.f=Math.min(a.r.f??K.fuel.capacity,Math.max(0,o.r.f));
  if(a.where!==o.where){const plane=a.where.startsWith('plane:')&&o.where.startsWith('plane:');if(!plane&&(!a.where.startsWith('car:')&&!a.where.startsWith('pent:')&&a.where!=='over'&&a.where!=='starter'||!o.where.startsWith('car:')&&!o.where.startsWith('pent:')&&o.where!=='over'))fail('invalid-transfer','다른 종류의 보관소로 옮길 수 없습니다.');
   if(o.where==='over')fail('invalid-transfer','예비 저장 목록으로 임의 이동할 수 없습니다.');
   let to;{const id=plane?o.where.slice(6):o.where.startsWith('pent:')?'aurelis-ph-'+o.where.slice(5):o.where.slice(4);const h=garage(p,catalog,id,plane?'plane':'car');if(a.where==='over'&&h.a.length>=h.slots)continue;if(h.a.length>=h.slots||!plane&&!!K?.bunker!==!!h.bunker)fail('capacity','목적지 차고를 확인해 주세요.');to=h.a;}
   a.remove();to.push(a.r);
  }
 }
 // Missing assets are deliberately retained: a partial snapshot must not delete a purchase.
 for(const [id,design]of Object.entries(v.designs||{})){const h=catalog.homes.find(h=>h.id===id);if(h&&owns(p.homes,id)&&(h.bunker?catalog.bunkerDesigns:catalog.homeDesigns)?.includes(design)){p.designs??={};p.designs[id]=design;}}
 if(typeof v.spawn==='string'&&owns(p.homes,v.spawn))p.spawn=v.spawn;
 if(owns(p.pent?.owned,v.pent?.spawn))p.pent.spawn=v.pent.spawn;
 if(Number.isFinite(v.armor))p.armor=Math.min(p.armor||0,Math.max(0,v.armor));
 for(const [wid,r]of Object.entries(v.gunmods||{})){if(wid==='__skins')continue;const own=p.gunmods?.[wid];if(!own)continue;const e=list(r.e);if(e.length!==catalog.partSlots.length)continue;if(e.every((i,k)=>i===0||owns(own.o,catalog.partSlots[k]+':'+catalog.parts[catalog.partSlots[k]]?.[i]?.id)))own.e=e;}
 const sk=p.gunmods?.__skins;if(sk)for(const [wid,id]of Object.entries(v.gunmods?.__skins?.eq||{}))if(owns(p.guns,wid)&&owns(sk.inv,id))sk.eq[wid]=id;
 for(const [floor,r]of Object.entries(v.pent?.rooms||{})){const own=p.pent?.rooms?.[floor];if(own&&list(r.sel).length===6&&r.sel.every((i,k)=>i===0||String(own.own[k]).split(',').includes(String(i))))own.sel=r.sel;}
 s.version++;s.updatedAt=now;
 const save={property:p};for(const k of ['x','y','z','yaw'])if(Number.isFinite(proposal?.[k])&&Math.abs(proposal[k])<=100000)save[k]=proposal[k];
 if(typeof proposal?.tod==='string')save.tod=proposal.tod.slice(0,20);
 // Ammo/health/physics remain outside this economy boundary, but weapon ownership is authoritative.
 return {account:s,save};
}
