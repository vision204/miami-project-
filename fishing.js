// Server clock drives bites, tension, exhaustion and catch proof. Inputs are intents only.
// 2026-11-18 사용자 '너무 어렵다' : 예전엔 반반씩 눌러도 장력이 계속 올라 거의 늘 끊어졌다(시뮬레이션 : 어떤 리듬으로 연타해도 0/20).
// 이제 감을수록 장력이 천천히 차오르고(끝으로 갈수록 느림), 초록 구간이 넓고, 끊기기까지 여유가 있다. 리듬 있게 톡톡 누르면 잡히고, 계속 누르고만 있으면 4~5초 뒤 끊어진다.
const EASE={bite:3500,A:.42,Ad:.10,As:.16,cap:1.12,down:.30,downs:.05,overT:.97,overLim:2.0,slackT:.06,slackLim:4.0,lo:.10,hi:.95,base:4,k:3.2,decay:.003};
import{RODS,fishById}from'./fishing-catalog.js';
export class Fishing{
 constructor(){this.runs=new Map();}
 start(uid,a){if(this.runs.get(uid)?.id===a.id)return;this.runs.set(uid,{...a,phase:'cast',tension:.32,progress:0,slack:0,over:0,hold:false,inputAt:0,lastAt:Date.now(),lastSeen:Date.now(),valid:true,hooked:false,finishedAt:0});}
 observe(uid,s,now=Date.now()){const r=this.runs.get(uid);if(!r||!Array.isArray(s))return;r.lastSeen=now;if(Math.hypot(s[0]-r.origin.x,s[2]-r.origin.z)>3||Math.abs(s[1]-r.origin.y)>3||Math.abs(s[6])>.8||(s[7]&16)||s[9]<=0)this.fail(r,'자리를 벗어나 물고기를 놓쳤어요.');}
 fail(r,reason){if(r.phase==='caught'||r.phase==='failed')return;r.phase='failed';r.reason=reason;r.valid=false;r.finishedAt=Date.now();}
 action(uid,m,now=Date.now()){const r=this.runs.get(uid);if(!r||m.run!==r.id)return this.snapshot(uid);if(m.k==='cancel'){this.fail(r,'낚시를 취소했어요.');return this.snapshot(uid);}if(m.k!=='input')return this.snapshot(uid);r.hold=m.hold===true;r.inputAt=now;if(m.hook===true&&r.phase==='bite'&&now-r.biteAt<EASE.bite){r.phase='fight';r.hooked=true;r.lastAt=now;}return this.snapshot(uid);}
 tick(now=Date.now()){
  for(const[uid,r]of this.runs){if(r.finishedAt){if(now-r.finishedAt>600000)this.runs.delete(uid);continue;}if(now-r.startedAt>125000||now-r.lastSeen>4500){this.fail(r,'연결이 끊기거나 시간이 지나 낚시가 끝났어요.');continue;}
   const dt=Math.min(.2,Math.max(0,(now-r.lastAt)/1000));r.lastAt=now;
   if(r.phase==='cast'&&now>=r.startedAt+900)r.phase='wait';
   if(r.phase==='wait'&&now>=r.biteAt)r.phase='bite';
   if(r.phase==='bite'&&now-r.biteAt>EASE.bite){this.fail(r,'챔질이 늦어 물고기가 빠져나갔어요.');continue;}
   if(r.phase!=='fight')continue;
   const fish=fishById(r.catch.fish),rod=RODS.find(q=>q.id===r.rod),difficulty=Math.min(2.6,.7+Math.sqrt(r.catch.grams/1000)/rod.power*.23),t=(now-r.biteAt)/1000;
   r.surge=.5+.5*Math.sin(t*1.7+r.catch.length*.17);const holding=r.hold&&now-r.inputAt<650;
   const E=EASE;r.tension=Math.max(0,Math.min(1.15,holding?r.tension+dt*(E.A+difficulty*E.Ad+r.surge*E.As)*(E.cap-r.tension):r.tension-dt*(E.down-r.surge*E.downs)));
   r.over=r.tension>E.overT?r.over+dt:Math.max(0,r.over-dt*1.5);r.slack=r.tension<E.slackT?r.slack+dt:Math.max(0,r.slack-dt);
   if(r.over>E.overLim){this.fail(r,'장력이 너무 높아 줄이 끊어졌어요.');continue;}if(r.slack>E.slackLim){this.fail(r,'줄이 너무 느슨해 물고기가 빠졌어요.');continue;}
   if(holding&&r.tension>E.lo&&r.tension<E.hi)r.progress=Math.min(1,r.progress+dt/(E.base+difficulty*E.k));else r.progress=Math.max(0,r.progress-dt*E.decay);
   if(r.progress>=1){r.phase='caught';r.finishedAt=now;r.valid=true;r.hold=false;}
  }
 }
 snapshot(uid){const r=this.runs.get(uid);if(!r)return null;const q={id:r.id,phase:r.phase,tension:r.tension,progress:r.progress,surge:r.surge||0,reason:r.reason||'',hooked:r.hooked,at:Date.now()};if(r.phase==='caught')q.catch=r.catch;return q;}
 proof(uid,id){const r=this.runs.get(uid);return r&&r.id===id&&r.phase==='caught'&&r.valid?{valid:true,id,catch:r.catch}:null;}
 clear(uid,id){if(this.runs.get(uid)?.id===id)this.runs.delete(uid);}
}
