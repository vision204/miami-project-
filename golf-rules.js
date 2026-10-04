import { HOLES, REGIONS } from './golf-course.js';
export const CLUBS = [{name:'드라이버',range:210,loft:.48},{name:'아이언',range:110,loft:.68},{name:'웨지',range:45,loft:.95},{name:'퍼터',range:18,loft:0}];
export const MAX_STROKES=12;
export function inside(x,z,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
const ellipse=(x,z,e)=>e&&((x-e[0])/e[2])**2+((z-e[1])/e[3])**2<1;
export function lieAt(h,p){if(!inside(p[0],p[2],REGIONS[h.region].poly))return 'OB';if(ellipse(p[0],p[2],h.water))return '물';if(Math.hypot(p[0]-h.cup[0],p[2]-h.cup[2])<7)return '그린';if(ellipse(p[0],p[2],h.bunker))return '벙커';const dx=h.cup[0]-h.tee[0],dz=h.cup[2]-h.tee[2],len=Math.hypot(dx,dz),t=((p[0]-h.tee[0])*dx+(p[2]-h.tee[2])*dz)/(len*len);return t>=-.1&&t<=1.1&&Math.abs((p[0]-h.tee[0])*dz-(p[2]-h.tee[2])*dx)/len<h.width/2?'페어웨이':'러프';}
// Identical fixed-step ball flight, bounce, rolling friction and cup detection on server and browser.
export function simulateShot(h,start,input){
 const club=CLUBS[input.club],power=Math.max(.01,Math.min(1,input.power)),angle=input.angle+input.error*.15,putt=club.loft===0,lie=lieAt(h,start),factor=lie==='벙커'?.55:lie==='러프'?.8:1;
 const distance=club.range*power*factor,speed=putt?Math.sqrt(2*1.4*distance):Math.sqrt(distance*9.81/Math.sin(2*club.loft)),p=start.slice(),v=[Math.cos(angle)*speed*Math.cos(club.loft),speed*Math.sin(club.loft),Math.sin(angle)*speed*Math.cos(club.loft)],frames=[[0,...p]];
 let cup=false,penalty=false,time=0,bounced=putt;
 for(let k=1;k<=1800;k++){
  const prev=p.slice(),dt=1/60;time=k*dt;p[0]+=v[0]*dt;p[2]+=v[2]*dt;p[1]+=v[1]*dt;v[1]-=9.81*dt;
  if(p[1]<=h.tee[1]){p[1]=h.tee[1];const surface=lieAt(h,p),sp=Math.hypot(v[0],v[2]);
   if(surface==='OB'||surface==='물'){penalty=true;break;}
   const dx=p[0]-prev[0],dz=p[2]-prev[2],l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((h.cup[0]-prev[0])*dx+(h.cup[2]-prev[2])*dz)/l)):0;
   if(sp<3.2&&Math.hypot(prev[0]+t*dx-h.cup[0],prev[2]+t*dz-h.cup[2])<.45){p.splice(0,3,...h.cup);cup=true;break;}
   if(!putt&&!bounced&&Math.abs(v[1])>2){v[1]=Math.abs(v[1])*.24;v[0]*=.7;v[2]*=.7;bounced=true;}else{v[1]=0;const drag=surface==='그린'?1.4:surface==='벙커'?7:surface==='러프'?4:2.4;const f=Math.max(0,sp-drag*dt)/(sp||1);v[0]*=f;v[2]*=f;if(sp<.08)break;}
  }
  if(k%6===0)frames.push([time,...p]);
 }
 frames.push([time,...p]);return {frames,duration:time,end:penalty?start.slice():p,cup,penalty,lie:penalty?'벌타 후 재타격':lieAt(h,p)};
}
export function newRound(ids,count,mode){const teams=mode==='teams'?[[ids[0],ids[1]],[ids[2],ids[3]]]:ids.map(id=>[id]);return {count,mode,teams,hole:0,turn:0,playerTurns:teams.map(()=>0),balls:teams.map(()=>HOLES[0].tee.slice()),strokes:teams.map(()=>0),done:teams.map(()=>false),scores:teams.map(()=>[]),phase:'play',shot:null,seq:0,winner:null};}
export function currentPlayer(r){const team=r.teams[r.turn];return team[r.playerTurns[r.turn]%team.length];}
export function playShot(r,input,time){if(r.phase!=='play')return false;const i=r.turn,h=HOLES[r.hole],result=simulateShot(h,r.balls[i],input);r.strokes[i]+=1+(result.penalty?1:0);r.strokes[i]=Math.min(MAX_STROKES,r.strokes[i]);r.shot={input,start:r.balls[i].slice(),team:i,hole:r.hole,at:time,duration:result.duration,penalty:result.penalty,cup:result.cup,seq:++r.seq};r.balls[i]=result.end;r.done[i]=result.cup||r.strokes[i]>=MAX_STROKES;r.playerTurns[i]++;r.phase='flight';return true;}
export function advanceRound(r,time){if(r.phase!=='flight'||time<r.shot.at+r.shot.duration*1000)return false;
 if(r.done.every(Boolean)){r.scores.forEach((sc,i)=>sc.push(r.strokes[i]));r.hole++;if(r.hole>=r.count){r.phase='over';r.completed=true;const sums=r.scores.map(sc=>sc.reduce((a,b)=>a+b,0)),min=Math.min(...sums);r.winner=sums.filter(s=>s===min).length===1?sums.indexOf(min):-1;return true;}r.balls=r.teams.map(()=>HOLES[r.hole].tee.slice());r.strokes=r.teams.map(()=>0);r.done=r.teams.map(()=>false);r.turn=r.hole%r.teams.length;}
 else{for(let n=1;n<=r.teams.length;n++){const i=(r.turn+n)%r.teams.length;if(!r.done[i]){r.turn=i;break;}}}
 r.phase='play';r.deadline=time+60000;return true;}
