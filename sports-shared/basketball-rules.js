// Shared school coordinates and server-authoritative half-court rules.
const co=.06440653886256534, si=-.9979237434552526;
export const COURTS=[0,1].map(i=>({id:'basket-'+i,u:-82,v:27.5+i*18,y:3.4545294134080975,rot:Math.atan2(si,co)}));
export function world(c,x,z,y=0){const u=c.u+x,v=c.v+z;return[-2942.08+u*co-v*si,c.y+y,-2593.26+u*si+v*co];}
export function local(c,p){const dx=p[0]+2942.08,dz=p[2]+2593.26;return[dx*co+dz*si-c.u,-dx*si+dz*co-c.v];}
export const slots=c=>[world(c,-4,-3),world(c,-4,0),world(c,-4,5)];
export const RIM=[.59,3.05,0], ARC=6.75;
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export const idealHold=p=>.65+.015*Math.hypot(p[0]-RIM[0],p[1]);
export const jumpHeight=(p,time)=>p.action>time?Math.sin(Math.PI*(1-(p.action-time)/650))*.65:0;
export function startRound(ids,practice,time){return{ids,practice,phase:'play',players:ids.map((id,i)=>({id,p:[9,i?2:-2],move:[0,0],sprint:false,charge:0,action:0,cooldown:0})),scores:[0,0],made:0,attempts:0,owner:0,clear:true,ball:null,shot:null,seq:0,deadline:time+20000,at:time,winner:null,reason:''};}
export function resetBall(r,owner,time){r.owner=owner;r.clear=true;r.ball=null;r.shot=null;r.deadline=time+20000;const p=r.players[owner];p.p=[9,owner?2:-2];p.charge=0;r.seq++;}
export function action(r,id,k,time){const i=r.ids.indexOf(id),p=r.players[i];if(i<0||r.phase!=='play')return false;
 if(k==='recall'&&r.practice){resetBall(r,0,time);return true;}
 if(k==='charge'&&r.owner===i&&!r.shot&&!p.charge){p.charge=time;return true;}
 if(k==='cancel'){p.charge=0;return true;}
 if(k==='block'&&time>=p.cooldown){p.action=time+650;p.cooldown=time+1100;return true;}
 if(k==='steal'&&r.owner!==null&&r.owner!==i&&!r.shot&&time>=p.cooldown){p.cooldown=time+1200;const o=r.players[r.owner];if(dist(p.p,o.p)<1.35&&!o.charge){o.charge=0;r.owner=i;r.clear=false;r.deadline=time+20000;r.seq++;}return true;}
 if(k!=='release'||r.owner!==i||!p.charge||r.shot)return false;
 const hold=(time-p.charge)/1000;p.charge=0;
 if(!r.clear){r.reason='공을 빼앗거나 수비 리바운드 후 바깥선 밖으로 나가세요.';return true;}
 const d=Math.hypot(p.p[0]-RIM[0],p.p[1]),error=Math.min(2,Math.abs(hold-idealHold(p.p))/.16);
 const defender=r.players[1-i],gap=defender?dist(p.p,defender.p):100;
 const blocked=defender&&defender.action>time&&gap<2.4;
 const made=!blocked&&error<(gap<1.5?.28:gap<2.8?.48:.7);
 const miss=(error+.35)*(i?-1:1),to=made?[...RIM]:[RIM[0]+1.4+Math.min(3,error),RIM[1],Math.max(-5,Math.min(5,miss*1.7))];
 r.shot={from:[p.p[0],1.75,p.p[1]],to,at:time,duration:850+d*45,made,blocked,by:i,points:d>=ARC?2:1,seq:++r.seq};r.owner=null;r.attempts++;r.reason=blocked?'블록!':made?'좋은 타이밍!':'슛이 빗나갔습니다.';return true;
}
export function tickRound(r,time){if(r.phase!=='play')return;const dt=Math.min(.15,Math.max(0,(time-r.at)/1000));r.at=time;
 for(const p of r.players){const len=Math.hypot(...p.move),speed=(p.sprint?6:4.5)*(p.charge?.45:1);if(len){p.p[0]=Math.max(.9,Math.min(13.5,p.p[0]+p.move[0]/Math.max(1,len)*speed*dt));p.p[1]=Math.max(-7,Math.min(7,p.p[1]+p.move[1]/Math.max(1,len)*speed*dt));}}
 if(r.players.length===2){const a=r.players[0].p,b=r.players[1].p,d=dist(a,b);if(d<.8){const dx=(b[0]-a[0])/(d||1),dz=d?(b[1]-a[1])/d:1;b[0]=Math.max(.9,Math.min(13.5,b[0]+dx*(.8-d)));b[1]=Math.max(-7,Math.min(7,b[1]+dz*(.8-d)));}}
 if(r.owner!==null&&Math.hypot(r.players[r.owner].p[0]-RIM[0],r.players[r.owner].p[1])>=ARC)r.clear=true;
 if(r.shot&&time>=r.shot.at+r.shot.duration+(r.shot.made?400:800)){const sh=r.shot;r.shot=null;if(sh.made){r.made++;r.scores[sh.by]+=sh.points;if(!r.practice&&r.scores[sh.by]>=11){r.phase='over';r.winner=sh.by;r.reason='11점 달성';return;}resetBall(r,r.practice?0:1-sh.by,time);}else{r.ball=[sh.to[0],sh.to[2]];r.lastShooter=sh.by;r.looseAt=time;}}
 if(r.ball){let nearest=-1,best=1.25;r.players.forEach((p,i)=>{const d=dist(p.p,r.ball);if(d<best){best=d;nearest=i;}});if(nearest>=0){r.owner=nearest;r.clear=r.practice||nearest===r.lastShooter;r.ball=null;r.deadline=time+20000;r.seq++;r.reason='리바운드';}else if(time-r.looseAt>10000)resetBall(r,r.practice?0:1-r.lastShooter,time);}
 if(!r.practice&&!r.shot&&r.owner!==null&&time>=r.deadline){resetBall(r,1-r.owner,time);r.reason='20초 공격 제한 · 공격권 변경';}
 for(const p of r.players)if(p.charge&&time-p.charge>2400)p.charge=0;
}
export function ballPosition(r,time){if(r.shot){const s=r.shot,t=Math.max(0,Math.min(1,(time-s.at)/s.duration)),fall=Math.max(0,(time-s.at-s.duration)/1000),pos=s.from.map((v,i)=>v+(s.to[i]-v)*t+(i===1?4*2.8*t*(1-t):0));if(fall)pos[1]=Math.max(.12,pos[1]-(s.made?fall*5:4.9*fall*fall));return pos;}if(r.ball)return[r.ball[0],.12,r.ball[1]];const p=r.players[r.owner??0];return[p.p[0]-.35,.35+Math.abs(Math.sin(time/130))*.65,p.p[1]+.4];}
