/* 당구 · 포켓볼 규칙과 물리 (2026-11-05 · Opus) — 브라우저와 서버(server/sports-shared/billiards-rules.js)가 같은 파일을 쓴다.
   · 테이블 로컬 좌표 : x = 긴 축(머리 쪽 −, 발 쪽 +), z = 짧은 축. 공은 반지름 R 의 평면 원(높이는 화면에서만).
   · 물리 : 미끄러짐(μs) → 구름(μr) 전환, 회전(위 · 아래 · 옆) 보존, 공끼리 탄성 충돌, 쿠션 반발 + 마찰(옆돌림이 각도를 바꾼다), 포켓.
     덧셈 · 곱셈 · 나눗셈 · 제곱근만 써서(삼각함수 없음) 같은 입력이면 어느 브라우저에서도 같은 결과 → 멀티는 '샷 값'만 보내고 각자 다시 굴린다.
   · 규칙 : 4구(한국식, 빨간 공 둘 맞히면 1점 · 상대 공 맞히면 감점 · 헛치기 감점) · 8볼(그룹 · 파울 · 프리볼 · 8번 마지막). */

export const KINDS={
 carom:{name:'당구 4구',HX:1.422,HZ:.711,R:.03275,e:.94,rail:.82,mus:.2,mur:.0105,muc:.18,vmax:7.2,pockets:false,cloth:0x1d58b5,balls:4},
 pool:{name:'포켓볼 8볼',HX:1.12,HZ:.56,R:.028575,e:.95,rail:.76,mus:.2,mur:.0115,muc:.2,vmax:8.4,pockets:true,cloth:0x1f7a4a,balls:16},
};
/* 테이블 자리 (월드 좌표 · rot = 긴 축이 바라보는 방향 라디안, 화면 THREE rotation.y = -rot). loc = 택시 목적지 그룹 */
export const CUE_TABLES=[
 {id:0,kind:'pool',loc:'school',zone:'f1',x:-9601.2,y:30,z:-9189.8,rot:0,lampY:1.85},
 {id:1,kind:'carom',loc:'school',zone:'gym',x:-9381.4,y:30,z:-9205,rot:Math.PI/2},
 {id:2,kind:'pool',loc:'school',zone:'gym',x:-9381.4,y:30,z:-9191.5,rot:Math.PI/2},
 {id:3,kind:'pool',loc:'airport',x:-3545,y:3.65,z:-662,rot:Math.PI/2},
 {id:4,kind:'carom',loc:'airport',x:-3545,y:3.65,z:-649,rot:Math.PI/2},
 {id:5,kind:'pool',loc:'club',x:-699.2,y:2.564,z:-389.9,rot:-.039,lampY:1.8},
 {id:6,kind:'carom',loc:'club',x:-692.5,y:2.564,z:-389.9,rot:-.039,lampY:1.8},
];
export const tableOf=id=>CUE_TABLES.find(t=>t.id===id)||null;
/** 월드 ↔ 테이블 로컬 */
export function toWorld(T,x,z){const c=Math.cos(T.rot),s=Math.sin(T.rot);return [T.x+x*c-z*s,T.z+x*s+z*c];}
export function toLocal(T,wx,wz){const c=Math.cos(T.rot),s=Math.sin(T.rot),dx=wx-T.x,dz=wz-T.z;return [dx*c+dz*s,-dx*s+dz*c];}

/* ---------- 포켓 · 쿠션 ---------- */
export function geometry(kind){const K=KINDS[kind],{HX,HZ}=K,segs=[],pockets=[];
 if(!K.pockets){segs.push([-HX,-HZ,HX,-HZ,0,1],[HX,HZ,-HX,HZ,0,-1],[-HX,HZ,-HX,-HZ,1,0],[HX,-HZ,HX,HZ,-1,0]);return {segs,pockets,K};}
 const cg=.062,sg=.058;   // 코너 · 사이드 포켓 입구 반폭
 for(const sx of [-1,1])for(const sz of [-1,1])pockets.push({x:sx*(HX+.012),z:sz*(HZ+.012),r:.066,corner:true});
 for(const sz of [-1,1])pockets.push({x:0,z:sz*(HZ+.03),r:.06,corner:false});
 /* 긴 쿠션 4토막(사이드 포켓으로 끊김) · 짧은 쿠션 2토막 : [x0,z0,x1,z1,nx,nz] (n = 안쪽) */
 segs.push([-HX+cg,-HZ,-sg,-HZ,0,1],[sg,-HZ,HX-cg,-HZ,0,1],[-HX+cg,HZ,-sg,HZ,0,-1],[sg,HZ,HX-cg,HZ,0,-1],[-HX,-HZ+cg,-HX,HZ-cg,1,0],[HX,-HZ+cg,HX,HZ-cg,-1,0]);
 return {segs,pockets,K};}

/* ---------- 공 ---------- */
/** b = {n, x, z, vx, vz, wx, wz, wy, on} — wx · wz = 수평 축 회전(구름), wy = 옆돌림 */
export const ball=(n,x,z)=>({n,x,z,vx:0,vz:0,wx:0,wz:0,wy:0,on:true});
export function rack(kind){const K=KINDS[kind],{HX,HZ,R}=K;
 if(kind==='carom')return [ball(0,-HX/2,HZ*.32),ball(1,HX*.78,0),ball(2,HX/2,0),ball(3,-HX/2,0)];   // 흰(1P) · 노랑(2P) · 빨강 둘
 /* 8볼 : 발 쪽 점(foot spot)에 꼭짓점, 8번은 셋째 줄 가운데, 뒤 두 모서리는 솔리드 · 스트라이프 하나씩 (고정 배치 = 모두 같은 랙) */
 const order=[1,9,2,10,8,3,11,4,12,5,13,6,14,7,15],out=[ball(0,-HX/2,0)],d=R*2+.0004,h=d*.8660254;let k=0;
 for(let row=0;row<5;row++)for(let i=0;i<=row;i++){out.push(ball(order[k++],HX/2+row*h,(i-row/2)*d));}
 const corner=[out.findIndex(b=>b.x>HX/2+3.9*h&&b.z<-1.9*d),out.findIndex(b=>b.x>HX/2+3.9*h&&b.z>1.9*d)];
 if(out[corner[0]].n>8===out[corner[1]].n>8){const sw=out.findIndex(b=>b.n>8!==out[corner[0]].n>8&&b.n!==8&&b.x<HX/2+3.5*h);if(sw>0){const t=out[sw].n;out[sw].n=out[corner[1]].n;out[corner[1]].n=t;}}
 return out;}
export const cloneBalls=bs=>bs.map(b=>({...b}));
/** 큐 : dir = [dx,dz](길이 1), speed m/s, tip = [옆 a, 위아래 b] (−1…1, 공 반지름의 절반까지 당점) */
export function strike(b,dir,speed,tip,K){const R=K.R,a=Math.max(-1,Math.min(1,tip[0]||0)),c=Math.max(-1,Math.min(1,tip[1]||0)),dx=dir[0],dz=dir[1];
 const sq=-a*.012;   // 옆 당점의 밀림(스쿼트) : 반대쪽으로 아주 조금
 const ux=dx-dz*sq,uz=dz+dx*sq,l=Math.sqrt(ux*ux+uz*uz);b.vx=ux/l*speed;b.vz=uz/l*speed;
 const k=1.25*speed/R;b.wx=k*c*dz;b.wz=-k*c*dx;b.wy=-k*a;}

/* ---------- 시뮬레이션 ---------- */
const G=9.81,DT0=1/600;
/** 한 번 칠 때까지 굴린다. 사건 목록 [{t:'ball',a,b}|{t:'rail',a}|{t:'pocket',a,p}] 과 걸린 단계 수. 최대 25초 */
export function simulate(balls,kind,opt={}){const DT=opt.dt||DT0,geo=geometry(kind),K=geo.K,R=K.R,R2=4*R*R,ev=[],trace=opt.trace?balls.map(()=>[]):null,stride=opt.stride||12;let step=0;
 const touched=new Set();
 for(const maxStep=25/DT;step<maxStep;step++){let moving=false;
  for(const b of balls){if(!b.on)continue;
   const ux=b.vx+R*b.wz,uz=b.vz-R*b.wx,us=Math.sqrt(ux*ux+uz*uz),v=Math.sqrt(b.vx*b.vx+b.vz*b.vz);
   if(us>.012){const f=K.mus*G*DT,fx=-ux/us*f,fz=-uz/us*f;   // 미끄러짐 : 접점 속도를 줄이는 마찰
    if(us<f*3.5){b.wz=-b.vx/R;b.wx=b.vz/R;}else{b.vx+=fx;b.vz+=fz;b.wx+=-2.5*fz/R;b.wz+=2.5*fx/R;}moving=true;}
   else if(v>.0035){const f=K.mur*G*DT,s=v>f?(v-f)/v:0;b.vx*=s;b.vz*=s;b.wz=-b.vx/R;b.wx=b.vz/R;moving=true;}   // 구름
   else{b.vx=b.vz=0;b.wx=b.wz=0;}
   if(b.wy!==0){const d=11*DT;b.wy=Math.abs(b.wy)<=d?0:b.wy-(b.wy>0?d:-d);if(b.wy!==0)moving=true;}
   b.x+=b.vx*DT;b.z+=b.vz*DT;}
  /* 공끼리 */
  for(let i=0;i<balls.length;i++){const a=balls[i];if(!a.on)continue;const am=a.vx!==0||a.vz!==0;for(let j=i+1;j<balls.length;j++){const c=balls[j];if(!c.on||!am&&c.vx===0&&c.vz===0)continue;
   const dx=c.x-a.x,dz=c.z-a.z,d2=dx*dx+dz*dz;if(d2>=R2||d2===0)continue;const d=Math.sqrt(d2),nx=dx/d,nz=dz/d,rv=(a.vx-c.vx)*nx+(a.vz-c.vz)*nz,ov=2*R-d;
   a.x-=nx*ov/2;a.z-=nz*ov/2;c.x+=nx*ov/2;c.z+=nz*ov/2;if(rv<=0)continue;const J=rv*(1+K.e)/2;a.vx-=J*nx;a.vz-=J*nz;c.vx+=J*nx;c.vz+=J*nz;
   /* 던짐(throw) : 접점 미끄러짐을 조금 넘겨 준다 */
   const tx=-nz,tz=nx,slip=(a.vx-c.vx)*tx+(a.vz-c.vz)*tz+R*(a.wy+c.wy),jt=Math.max(-.06*J,Math.min(.06*J,slip/7));a.vx-=jt*tx;a.vz-=jt*tz;c.vx+=jt*tx;c.vz+=jt*tz;
   const key=Math.min(a.n,c.n)*32+Math.max(a.n,c.n);if(!touched.has(key)||ev.length<400){ev.push({t:'ball',a:a.n,b:c.n,s:step});touched.add(key);}moving=true;}}
  /* 쿠션 · 포켓 */
  for(const b of balls){if(!b.on)continue;
   for(const p of geo.pockets){const dx=b.x-p.x,dz=b.z-p.z;if(dx*dx+dz*dz<p.r*p.r){b.on=false;b.vx=b.vz=b.wx=b.wz=b.wy=0;ev.push({t:'pocket',a:b.n,p:geo.pockets.indexOf(p),s:step});break;}}
   if(!b.on)continue;
   for(const g of geo.segs){const [x0,z0,x1,z1,nx,nz]=g,ex=x1-x0,ez=z1-z0,L2=ex*ex+ez*ez,t=Math.max(0,Math.min(1,((b.x-x0)*ex+(b.z-z0)*ez)/L2)),qx=x0+ex*t,qz=z0+ez*t;
    let dx=b.x-qx,dz=b.z-qz,d2=dx*dx+dz*dz;if(d2>=R*R)continue;let mx=nx,mz=nz;
    if(t<=0||t>=1){const d=Math.sqrt(d2)||1e-9;mx=dx/d;mz=dz/d;}   // 포켓 입구 모서리(너클) : 둥근 끝
    const pen=R-((b.x-qx)*mx+(b.z-qz)*mz);b.x+=mx*pen;b.z+=mz*pen;const vn=b.vx*mx+b.vz*mz;if(vn>=0)continue;
    const e=K.rail,tx=-mz,tz=mx,vt=b.vx*tx+b.vz*tz,slip=vt+R*b.wy,Jn=-(1+e)*vn,lim=K.muc*Jn,jt=Math.max(-lim,Math.min(lim,slip*2/7));
    b.vx+=mx*Jn-tx*jt;b.vz+=mz*Jn-tz*jt;b.wy-=2.5*jt/R;
    /* 쿠션 높이 때문에 수평 회전도 반쯤 뒤집힌다 */
    const wn=b.wx*-mz+b.wz*mx;b.wx-= -mz*wn*1.4;b.wz-=mx*wn*1.4;
    ev.push({t:'rail',a:b.n,s:step});moving=true;}
   /* 안전장치 : 테이블 밖으로 새면 가까운 포켓(4구는 안쪽으로) */
   if(Math.abs(b.x)>K.HX+.05||Math.abs(b.z)>K.HZ+.05){if(geo.pockets.length){b.on=false;b.vx=b.vz=0;ev.push({t:'pocket',a:b.n,p:-1,s:step});}else{b.x=Math.max(-K.HX+R,Math.min(K.HX-R,b.x));b.z=Math.max(-K.HZ+R,Math.min(K.HZ-R,b.z));b.vx=-b.vx*.5;b.vz=-b.vz*.5;}}}
  if(trace&&step%stride===0)balls.forEach((b,i)=>trace[i].push(b.x,b.z,b.on?1:0,b.wx,b.wz));
  if(!moving)break;}
 if(trace)balls.forEach((b,i)=>trace[i].push(b.x,b.z,b.on?1:0,0,0));
 return {events:ev,steps:step,trace,stride};}

/* ---------- 규칙 ---------- */
/** 새 경기. mode = 'npc' | 'pvp' | 'solo', target = 4구 목표 점수 */
export function newGame(kind,{target=10}={}){return {kind,balls:rack(kind),turn:0,score:[0,0],target,groups:[null,null],open:true,breakShot:kind==='pool',ballInHand:kind==='pool'?'kitchen':null,over:false,winner:-1,shots:0,msg:kind==='pool'?'브레이크 — 큐볼을 헤드 라인 뒤에 놓고 치세요':'흰 공(나)으로 빨간 공 두 개를 맞히세요'};}
const solid=n=>n>=1&&n<=7,stripe=n=>n>=9&&n<=15;
/** 치기 전 상태 (judge 에 넘긴다) */
export function preShot(g){const left=gr=>g.balls.filter(b=>b.on&&(gr==='solid'?solid(b.n):stripe(b.n))).length;const mg=g.groups[g.turn];return {onEight:!!mg&&left(mg)===0,group:mg,breakShot:g.breakShot};}
/** 한 번 친 결과로 다음 상태를 정한다. g(공 위치는 이미 굴린 뒤) 는 바뀐다. 반환 = {scored, foul, msg} */
export function judge(g,res,pre){const ev=res.events,me=g.turn,op=1-me;g.shots++;
 if(g.kind==='carom'){const cue=me,oppBall=1-me,hits=new Set();let foulHit=false;
  for(const e of ev)if(e.t==='ball'&&(e.a===cue||e.b===cue)){const o=e.a===cue?e.b:e.a;if(o===oppBall)foulHit=true;else hits.add(o);}
  let msg,scored=false,foul=false;
  if(foulHit){g.score[me]=Math.max(0,g.score[me]-1);foul=true;msg='상대 공을 맞혀 감점 −1';}
  else if(hits.has(2)&&hits.has(3)){g.score[me]++;scored=true;msg='득점! 빨간 공 둘 +1';}
  else if(!hits.size){g.score[me]=Math.max(0,g.score[me]-1);foul=true;msg='헛치기 · 감점 −1';}
  else msg='빨간 공 하나만 맞혔어요';
  if(g.score[me]>=g.target){g.over=true;g.winner=me;msg='목표 '+g.target+'점 달성!';}
  else if(!scored)g.turn=op;
  return {scored,foul,msg:g.msg=msg};}
 /* 8볼 */
 const potted=ev.filter(e=>e.t==='pocket').map(e=>e.a),first=ev.find(e=>e.t==='ball'&&(e.a===0||e.b===0)),firstBall=first?(first.a===0?first.b:first.a):null;
 const railAfter=ev.some(e=>e.t==='rail'&&first&&e.s>=first.s),scratch=potted.includes(0),eight=potted.includes(8);
 const mg=pre.group,onEight=pre.onEight,wasBreak=pre.breakShot,own=n=>mg==='solid'?solid(n):mg==='stripe'?stripe(n):(n!==8&&n!==0);
 g.breakShot=false;let foul=false,why='';
 if(firstBall===null){foul=true;why='공을 하나도 못 맞혔어요';}
 else if(!wasBreak&&onEight&&firstBall!==8){foul=true;why='8번을 먼저 맞혀야 해요';}
 else if(!wasBreak&&!onEight&&mg&&!own(firstBall)){foul=true;why='내 그룹 공을 먼저 맞혀야 해요';}
 else if(!wasBreak&&!mg&&firstBall===8){foul=true;why='오픈 테이블에서 8번을 먼저 맞혔어요';}
 if(scratch){foul=true;why='큐볼이 포켓에 들어갔어요 (스크래치)';}
 if(!foul&&!potted.length&&!railAfter&&!wasBreak){foul=true;why='맞힌 뒤 쿠션에 닿은 공이 없어요';}
 if(eight){
  if(wasBreak){const e=g.balls.find(b=>b.n===8);e.on=true;spot(g,e);}   // 브레이크에서 들어가면 다시 세운다
  else{g.over=true;const win=onEight&&!foul;g.winner=win?me:op;return {scored:win,foul,msg:g.msg=win?'8번 성공 — 승리!':(onEight?'8번과 함께 파울 — 패배':'8번을 일찍 넣어 패배')};}}
 if(scratch){const c=g.balls.find(b=>b.n===0);c.on=true;c.x=-KINDS.pool.HX/2;c.z=0;}
 const balls=potted.filter(n=>n!==0&&n!==8);
 /* 그룹 정하기 : 오픈 테이블(브레이크 다음부터)에서 파울 없이 넣으면, 처음 맞힌 공의 그룹 */
 if(!foul&&!wasBreak&&!mg&&balls.length){const pick=firstBall&&firstBall!==8?(solid(firstBall)?'solid':'stripe'):(solid(balls[0])?'solid':'stripe');g.groups[me]=pick;g.groups[op]=pick==='solid'?'stripe':'solid';g.open=false;}
 const mine=g.groups[me],scored=!foul&&(wasBreak?balls.length>0:balls.some(n=>mine?(mine==='solid'?solid(n):stripe(n)):true));
 let msg;
 if(foul){g.turn=op;g.ballInHand='anywhere';msg='파울 — '+why+' · 상대 프리볼';}
 else if(scored){g.ballInHand=null;msg=balls.length+'개 성공'+(mine&&!mg?' · 내 그룹 '+groupName(mine):'')+' · 계속 치세요';}
 else{g.turn=op;g.ballInHand=null;msg=wasBreak?'브레이크 끝 · 상대 차례':'넣지 못했어요 · 상대 차례';}
 return {scored,foul,msg:g.msg=msg};}
/** 8번을 발 쪽 점에 다시 세운다(겹치면 뒤로) */
function spot(g,b){const K=KINDS[g.kind];let x=K.HX/2;for(let k=0;k<40;k++){if(g.balls.every(o=>o===b||!o.on||Math.hypot(o.x-x,o.z)>2*K.R+.002))break;x+=.01;}b.x=x;b.z=0;b.vx=b.vz=b.wx=b.wz=b.wy=0;}
/** 큐볼을 (x,z) 에 놓을 수 있나 (프리볼 · 키친) */
export function canPlace(g,x,z){const K=KINDS[g.kind],R=K.R;if(Math.abs(x)>K.HX-R||Math.abs(z)>K.HZ-R)return false;if(g.ballInHand==='kitchen'&&x>-K.HX/2)return false;
 return g.balls.every(b=>b.n===0||!b.on||Math.hypot(b.x-x,b.z-z)>2*R+.001);}
/** 차례인 사람의 수구 번호 */
export const cueOf=g=>g.kind==='carom'?g.turn:0;
export const groupName=gr=>gr==='solid'?'솔리드 1~7':gr==='stripe'?'스트라이프 9~15':'오픈';
/** 경기 보상 (서버가 다시 정한다) */
export const CUE_REWARD={npc:{easy:500,normal:1000,hard:2000},pvp:2500,daily:10,minMs:60000,minShots:5};
