export const JOBS = Object.freeze({
 delivery:{name:'배달',min:500,max:1000,cooldown:0,fee:0,rental:'van'},
 freight:{name:'물류창고 트럭 배송',min:40000,max:40000,cooldown:0,fee:0,rental:'boxtruck',fixed:true},
 taxi:{name:'택시',min:1000,max:1200,cooldown:0,fee:0,rental:'taxi'},
 race:{name:'타임어택',min:50000,max:70000,cooldown:2*60*60*1000,fee:0,rental:'sports'},
 air:{name:'항공 화물 운송',min:300000,max:500000,cooldown:6*60*60*1000,fee:30000,rental:'plane_swift'},
});
export function cleanJobSave(v={}) {
 const num=x=>Number.isFinite(x)?Math.max(0,Math.floor(x)):0;
 return {next:{race:num(v.next?.race),air:num(v.next?.air)},runs:num(v.runs),earned:num(v.earned),best:{...(v.best||{})},last:v.last||null};
}
export function jobPayout(type,quality,owned){const def=JOBS[type];const base=Math.round(def.min+(def.max-def.min)*Math.max(0,Math.min(1,quality)));const bonus=owned&&!def.fixed?Math.round(base*.1):0;return {base,bonus,total:base+bonus};}
export class JobRun {
 constructor({type,owned=false,goals,id,startedAt=Date.now(),goldSeconds=300,silverSeconds=480}){
  if(!JOBS[type]||!goals?.length)throw Error('Invalid mission');
  Object.assign(this,{type,owned,goals,id,startedAt,goldSeconds,silverSeconds,index:0,damage:0,elapsed:0,raceTime:0,startedRace:false,dwell:0,done:false,failed:false,farSeconds:0});
 }
 get goal(){return this.goals[this.index];}
 step(dt,sample){
  if(this.done||this.failed)return null;dt=Math.max(0,Math.min(dt,1));this.elapsed+=dt;
  if(this.startedRace)this.raceTime+=dt;
  if(sample.dead||sample.destroyed||sample.water){this.failed=true;return {failed:true,reason:'운행 불가 — 보상 없이 종료되었습니다.'};}
  if(this.elapsed>3600){this.failed=true;return {failed:true,reason:'제한 시간 60분이 지났습니다.'};}
  this.farSeconds=sample.inVehicle?0:this.farSeconds+dt;
  if(this.farSeconds>120){this.failed=true;return {failed:true,reason:'업무 차량을 2분 이상 벗어났습니다.'};}
  if(!sample.inVehicle)return null;
  if(sample.hit)this.damage=Math.min(1,this.damage+.08);
  const g=this.goal,d=Math.hypot(sample.x-g.x,sample.z-g.z),vertical=Math.abs(sample.y-g.y);
  const close=d<=(g.radius||18)&&vertical<=(g.air?110:7);
  if(!close){this.dwell=0;return null;}
  if(g.stop){if(Math.abs(sample.speed)>1.5||(!sample.landed&&this.type==='air')||!sample.interact){this.dwell=0;return null;}this.dwell+=dt;if(this.dwell<1.5)return null;}
  this.dwell=0;if(g.raceStart){this.startedRace=true;this.raceTime=0;}
  this.index++;
  if(this.index<this.goals.length)return {advanced:true,goal:g};
  this.done=true;
  const punctual=Math.max(0,Math.min(1,1-(this.elapsed-this.goldSeconds)/Math.max(1,this.silverSeconds-this.goldSeconds)));
  const quality=this.type==='race'?(this.raceTime<=this.goldSeconds?1:this.raceTime<=this.silverSeconds?.5:0):.5*(1-this.damage)+.5*punctual;
  return {finished:true,goal:g,reward:jobPayout(this.type,quality,this.owned),seconds:this.type==='race'?this.raceTime:this.elapsed};
 }
}
// Account-wide reservation is stored separately from ordinary position autosaves.
export function reserveJobLedger(old,request,now){
 if(old?.active?.id===request.id)return old;
 const v={...cleanJobSave(old),active:old?.active||null};const d=JOBS[request.type];if(!d)throw Error('알 수 없는 일거리입니다.');
 if(v.active&&v.active.expiresAt>now)throw Error('이미 진행 중인 일거리가 있습니다. 먼저 종료하세요.');
 if((v.next[request.type]||0)>now)throw Error('재도전 대기시간이 남았습니다.');
 if(d.cooldown)v.next[request.type]=now+d.cooldown;
 v.active={id:request.id,type:request.type,owned:!!request.owned,fee:request.owned?0:d.fee,startedAt:now,expiresAt:now+3600000};return v;
}
export function settleJobLedger(old,id,result,now){
 if(old?.last?.id===id)return {ledger:old,reward:0,already:true};
 if(!old?.active||old.active.id!==id)throw Error('이미 처리되었거나 다른 일거리입니다.');
 const a=old.active,v={...cleanJobSave(old),active:null};
 const max=jobPayout(a.type,1,a.owned).total;
 const reward=result?.completed&&a.expiresAt>=now?Math.max(0,Math.min(max,Math.floor(result.total||0))):0;
 v.runs++;v.earned+=reward;v.last={id,type:a.type,completed:!!result?.completed,total:reward,at:now};
 if(result?.completed&&a.type==='race'&&Number.isFinite(result.seconds)&&result.seconds>0){const key=(a.owned?'owned:':'rental:')+(result.raceKey||'default');v.best[key]=Math.min(v.best[key]||Infinity,result.seconds);}
 return {ledger:v,reward};
}
