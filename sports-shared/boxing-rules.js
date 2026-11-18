// The ring layout and match rules are shared verbatim with the relay.
export const STADIUM={x:-2842.4167558578647,z:24.710898057053786,y:3.4211539001121896,rot:-1.5737129290333054};
export const RINGS=[[-16,-12],[16,-12],[-16,12],[16,12]].map(([u,v],i)=>({id:i,u,v}));
/* 2026-11-18 MMA 펜타곤 : 경기장 가운데(센터 서클 자리, 네 복싱 링 사이)에 오각형 철망 케이지 하나. id 4 = 링 번호와 겹치지 않게 뒤에 붙인다. */
export const CAGES=[{id:4,u:0,v:0,mma:true}];
export const ARENAS=[...RINGS,...CAGES];
export function ringWorld(r,x=0,z=0,y=1.35){const c=Math.cos(STADIUM.rot),s=Math.sin(STADIUM.rot),u=r.u+x,v=r.v+z;return[STADIUM.x+u*c-v*s,STADIUM.y+y,STADIUM.z+u*s+v*c];}
export const ringGate=r=>ringWorld(r,0,5.3,.48);
const limit=(x,a,b)=>Math.max(a,Math.min(b,x));
export function newBout(ids,now,mma=false){return{ids,mma:!!mma,phase:'count',until:now+3000,round:1,at:now,winner:null,reason:'준비 · 3초',seq:0,last:null,players:ids.map((id,i)=>({id,p:[i?1.2:-1.2,0],hp:100,stamina:100,guard:false,move:[0,0],lastInput:now,cool:0,punch:0,hand:0,score:0,total:0,downs:0,roundDowns:0,downUntil:0,actionSeq:-1,ground:0,top:false,hitAt:0}))};}
export function finishBout(b,winner,reason,now){b.phase='over';b.winner=winner;b.reason=reason;b.until=now+8000;for(const p of b.players){p.ground=0;p.top=false;}}
/* 마지막 동작 결과 — 화면이 소리 · 효과를 고른다 : hit 정타 · block 가드 · miss 헛스윙 · down 다운 · td 테이크다운 · stuff 테이크다운 실패 · gnp 파운딩 · sub 서브미션 · esc 탈출 */
const mark=(b,i,kind,style,now)=>{b.seq++;b.last={seq:b.seq,by:i,kind,style,at:now};};
const MMA={kick:{cost:18,cool:640,dmg:15,guarded:4,reach:2.25},td:{cost:24,cool:900,reach:1.45,time:5000},gnp:{dmg:7,cool:420,cost:9},sub:{cost:30,hp:38},esc:{cost:10,cut:900}};
/** hand : 0 잽(콤보) · 1 스트레이트 — MMA 에서만 2 킥 · 3 테이크다운(위에 있으면 서브미션) */
export function punch(b,i,hand,seq,now){const a=b.players[i],o=b.players[1-i];if(b.phase!=='fight'||!a||!o||a.downUntil||o.downUntil||now<a.cool||!Number.isSafeInteger(seq)||seq<=a.actionSeq)return false;
 if(!b.mma&&hand>1||hand<0||hand>3)return false;
 /* MMA 바닥 싸움 : 아래 깔린 쪽은 어떤 버튼이든 탈출 시도, 위쪽은 파운딩(0 · 1 · 2) 또는 서브미션(3) */
 if(b.mma&&(a.ground||o.ground)){
  if(a.ground&&!a.top){if(a.stamina<MMA.esc.cost)return false;a.actionSeq=seq;a.cool=now+300;a.stamina-=MMA.esc.cost;a.ground=o.ground=Math.max(now,a.ground-MMA.esc.cut);b.reason='탈출 시도';mark(b,i,'esc','esc',now);return true;}
  if(!a.top)return false;
  if(hand===3){if(a.stamina<MMA.sub.cost)return false;a.actionSeq=seq;a.cool=now+900;a.stamina-=MMA.sub.cost;a.punch=now;a.style='sub';
   if(o.hp<=MMA.sub.hp){o.hp=0;mark(b,i,'sub','sub',now);finishBout(b,i,'서브미션 승',now);return true;}
   a.ground=o.ground=0;a.top=false;b.reason='서브미션 실패 · 빠져나감';mark(b,i,'esc','sub',now);return true;}
  if(a.stamina<MMA.gnp.cost)return false;a.actionSeq=seq;a.cool=now+MMA.gnp.cool;a.stamina-=MMA.gnp.cost;a.punch=now;a.style='gnp';a.hand=hand&1;
  o.hp=Math.max(0,o.hp-MMA.gnp.dmg);o.hitAt=now;a.score+=MMA.gnp.dmg;b.reason='파운딩';mark(b,i,'gnp','gnp',now);
  if(o.hp===0)finishBout(b,i,'파운딩 · TKO',now);return true;}
 if(hand===2){const k=MMA.kick;if(a.stamina<k.cost)return false;a.actionSeq=seq;a.cool=now+k.cool;a.stamina-=k.cost;a.punch=now;a.style='kick';a.hand=1;a.guard=false;
  if(Math.hypot(a.p[0]-o.p[0],a.p[1]-o.p[1])<=k.reach){const guarded=o.guard&&o.stamina>=8,dmg=guarded?k.guarded:k.dmg;if(guarded)o.stamina=Math.max(0,o.stamina-10);o.hp=Math.max(0,o.hp-dmg);o.hitAt=now;a.score+=dmg;b.reason=guarded?'킥 가드':'킥 정타';mark(b,i,guarded?'block':'hit','kick',now);
   if(o.hp===0)finishBout(b,i,'하이킥 · KO',now);}else{b.reason='헛발질';mark(b,i,'miss','kick',now);}return true;}
 if(hand===3){const t=MMA.td;if(a.stamina<t.cost)return false;a.actionSeq=seq;a.cool=now+t.cool;a.stamina-=t.cost;a.punch=now;a.style='td';a.guard=false;
  const gap=Math.hypot(a.p[0]-o.p[0],a.p[1]-o.p[1]);
  /* 가드를 올린 상대 · 지친 상대에게 잘 들어가고, 방금 펀치를 날린 상대(0.45초 안)에게는 카운터로 막힌다 */
  const ok=gap<=t.reach&&(o.guard||o.stamina<45)&&now-o.punch>450;
  if(ok){a.ground=o.ground=now+t.time;a.top=true;o.top=false;o.guard=false;a.move=[0,0];o.move=[0,0];for(let k=0;k<2;k++)a.p[k]=limit(o.p[k]+(a.p[k]-o.p[k])/Math.max(gap,.01)*.55,-2.65,2.65);b.reason='테이크다운!';mark(b,i,'td','td',now);}
  else{a.stamina=Math.max(0,a.stamina-8);b.reason=gap>t.reach?'테이크다운 · 너무 멀어요':'테이크다운 실패';mark(b,i,'stuff','td',now);}return true;}
 if(a.stamina<12)return false;
 a.actionSeq=seq;a.cool=now+360;a.stamina-=12;
 a.combo=now-a.punch<1150?((a.combo||0)+1)%4:0;a.style=hand===1?'cross':['jab','cross','hook','uppercut'][a.combo];
 a.punch=now;a.hand=a.style==='cross'||a.style==='uppercut'?1:0;a.guard=false;
 const gap=Math.hypot(a.p[0]-o.p[0],a.p[1]-o.p[1]);if(gap>1){const step=a.style==='jab'?.18:a.style==='cross'?.12:.08;for(let k=0;k<2;k++)a.p[k]=limit(a.p[k]+(o.p[k]-a.p[k])/gap*step,-2.65,2.65);}
 if(Math.hypot(a.p[0]-o.p[0],a.p[1]-o.p[1])<=1.8){const guarded=o.guard&&o.stamina>=8,dmg=guarded?3:12;if(guarded)o.stamina=Math.max(0,o.stamina-8);o.hp=Math.max(0,o.hp-dmg);o.hitAt=now;a.score+=dmg;b.reason=guarded?'가드':'정타';
  if(o.hp===0){if(b.mma){mark(b,i,'down',a.style,now);finishBout(b,i,'KO',now);return true;}
   o.downs++;o.roundDowns++;o.guard=false;o.move=[0,0];if(o.downs>=3){mark(b,i,'down',a.style,now);finishBout(b,i,'3회 다운 · TKO',now);}else{o.downUntil=now+8000;b.reason='다운 · 8 카운트';mark(b,i,'down',a.style,now);}}
  else mark(b,i,guarded?'block':'hit',a.style,now);
 }else{b.reason='헛스윙';mark(b,i,'miss',a.style,now);}return true;
}
export function tickBout(b,now){const dt=limit((now-b.at)/1000,0,.2);b.at=now;
 if(b.phase==='count'||b.phase==='rest'){if(now<b.until)return;b.phase='fight';b.until=now+60000;b.reason='파이트';}
 if(b.phase!=='fight')return;
 for(const p of b.players){if(p.downUntil){if(now>=p.downUntil){p.downUntil=0;p.hp=65;p.stamina=80;p.p=[p===b.players[0]?-1.5:1.5,0];}continue;}
  if(p.ground&&now>=p.ground){p.ground=0;p.top=false;if(b.reason!=='파이트')b.reason='일어섰다';}
  if(now-p.lastInput>450){p.move=[0,0];p.guard=false;}
  p.stamina=limit(p.stamina+dt*(p.guard?-6:14),0,100);if(!p.stamina)p.guard=false;
  if(p.ground){p.move=[0,0];p.guard=false;continue;}
  const n=Math.max(1,Math.hypot(...p.move)),speed=p.guard?1.3:2.8;for(let i=0;i<2;i++)p.p[i]=limit(p.p[i]+p.move[i]/n*speed*dt,-2.65,2.65);
 }
 const a=b.players[0],c=b.players[1],dx=c.p[0]-a.p[0],dz=c.p[1]-a.p[1],d=Math.hypot(dx,dz);if(d<.75&&!a.downUntil&&!c.downUntil&&!a.ground){const ux=d?dx/d:1,uz=d?dz/d:0;for(const [p,sg]of[[a,-1],[c,1]]){p.p[0]=limit(p.p[0]+sg*ux*(.75-d)/2,-2.65,2.65);p.p[1]=limit(p.p[1]+sg*uz*(.75-d)/2,-2.65,2.65);}}
 if(now>=b.until&&!b.players.some(p=>p.downUntil)){for(const p of b.players){p.ground=0;p.top=false;}const scores=b.players.map(p=>p.score-p.roundDowns*30),max=Math.max(...scores);b.players.forEach((p,i)=>{p.total+=scores[i]===max?10:Math.max(7,9-p.roundDowns);p.score=0;p.roundDowns=0;});
  if(b.round===3){finishBout(b,a.total===c.total?-1:a.total>c.total?0:1,'3라운드 판정',now);}else{b.round++;b.phase='rest';b.until=now+10000;b.reason='라운드 휴식 · 10초';for(const [i,p]of b.players.entries()){p.hp=Math.min(100,p.hp+25);p.stamina=100;p.move=[0,0];p.guard=false;p.p=[i?1.5:-1.5,0];}}}
}
