export const bounds = {west:-24500,east:3500,north:-13500,south:6500,width:28000,depth:20000};
export const places = [
  {name:'로스앤젤레스', x:-21850,z:-2800,area:'태평양 해안 평지'},
  {name:'라스베이거스',x:-19500,z:-4250,area:'건조 분지'},
  {name:'그랜드캐니언',x:-16550,z:-4600,area:'고원 아래로 파인 협곡'},
  {name:'로키산맥',x:-17400,z:-10250,area:'서부 고산 지대'},
  {name:'시카고',x:-10500,z:-10150,area:'오대호 남쪽 평지'},
  {name:'뉴올리언스',x:-11250,z:-4840,area:'삼각주와 범람원'},
  {name:'피츠버그',x:-7450,z:-10700,area:'애팔래치아 구릉과 합류 지점'},
  {name:'워싱턴',x:-5500,z:-9470,area:'동부 강변 평지'},
  {name:'뉴욕',x:-4300,z:-11300,area:'북동 해안 평지'},
  {name:'마이애미',x:-1950,z:-400,area:'기존 게임 지역'},
];

// +X east, +Z south. The southeast headland faces Miami's northwest coast.
const coast = [
  [-23650,-11850],[-22000,-12700],[-19500,-12680],[-17300,-12800],[-15100,-12200],
  [-12900,-12630],[-11000,-12050],[-9130,-12200],[-7500,-12400],[-6040,-12850],
  [-4380,-12840],[-3050,-12000],[-3670,-11200],[-4190,-10650],[-4250,-10020],
  [-5110,-9700],[-4950,-9140],[-5950,-8670],[-6930,-7920],[-7450,-6810],
  [-7950,-6000],[-8350,-5100],[-8460,-4120],[-8910,-3550],[-9470,-3910],
  [-9620,-4890],[-10100,-5270],[-10700,-5030],[-11300,-4030],[-12300,-4210],
  [-13000,-4780],[-14200,-4840],[-15700,-4320],[-17250,-3290],[-18300,-2250],
  [-19900,-1430],[-21450,-1770],[-22270,-2650],[-22600,-4000],[-22900,-5480],
  [-22260,-6510],[-23000,-7930],[-23150,-9160],[-23530,-10400],
];
const shore = coast.flatMap((point,i) => {
  const next = coast[(i+1)%coast.length];
  return [.16,.84].map(t => [mix(point[0],next[0],t),mix(point[1],next[1],t)]);
});
const lakes = [
  {x:-12200,z:-11000,a:1060,b:560,angle:.27,level:100},
  {x:-10250,z:-11240,a:690,b:620,angle:-.58,level:100},
  {x:-8680,z:-11450,a:690,b:405,angle:-.28,level:100},
];
const canyon = [[-18900,-5220],[-18000,-4800],[-17400,-4600],[-16850,-4380],[-16250,-4730],[-15450,-5350],[-14950,-6000]];
const delta = [[-11780,-8170],[-11350,-7380],[-11580,-6560],[-11170,-5880],[-11240,-5180],[-10970,-4800],[-11250,-4170]];
const eastRiver = [[-8250,-11620],[-7520,-10870],[-7070,-10350],[-6330,-10150],[-5620,-9510],[-5300,-9020]];

function mix(a,b,t){return a+(b-a)*t;}
function sat(t){return Math.max(0,Math.min(1,t));}
function smooth(a,b,v){const t=sat((v-a)/(b-a));return t*t*(3-2*t);}
function hash(i,j){
  let n = Math.imul(i,374761393)+Math.imul(j,668265263);
  n = Math.imul(n^(n>>>13),1274126177);
  return ((n^(n>>>16))>>>0)/4294967295;
}
function noise(x,z){
  const i=Math.floor(x),j=Math.floor(z);
  const u=smooth(0,1,x-i),v=smooth(0,1,z-j);
  return mix(mix(hash(i,j),hash(i+1,j),u),mix(hash(i,j+1),hash(i+1,j+1),u),v)*2-1;
}
function segmentDistanceSq(x,z,[ax,az],[bx,bz]){
  const dx=bx-ax,dz=bz-az,t=sat(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz));
  return (x-ax-t*dx)**2+(z-az-t*dz)**2;
}
function lineDistance(x,z,points){
  let best=Infinity;
  for(let i=1;i<points.length;i++) best=Math.min(best,segmentDistanceSq(x,z,points[i-1],points[i]));
  return Math.sqrt(best);
}
// 2026-11-19 로딩 최적화 (Claude) : 해안선 거리 · 안팎 판정을 칸 색인으로 — 결과는 예전 전체 순회와 비트까지 같다(같은 식, 최솟값을 가진 선분이 항상 후보에 든다).
const SHORE_EDGES=shore.map((a,i)=>{const b=shore[(i+shore.length-1)%shore.length];return [a,b];});   // 예전 순회와 같은 (i, j=i-1) 짝
const COAST_BOX={minX:-24500,maxX:-2150,minZ:-13800,maxZ:-650},CELL=400;
const COLS=Math.ceil((COAST_BOX.maxX-COAST_BOX.minX)/CELL)+1,ROWS=Math.ceil((COAST_BOX.maxZ-COAST_BOX.minZ)/CELL)+1;
const shoreGrid=Array.from({length:COLS*ROWS},()=>[]);
SHORE_EDGES.forEach(([a,b],k)=>{
  const c0=Math.max(0,Math.floor((Math.min(a[0],b[0])-COAST_BOX.minX)/CELL)),c1=Math.min(COLS-1,Math.floor((Math.max(a[0],b[0])-COAST_BOX.minX)/CELL));
  const r0=Math.max(0,Math.floor((Math.min(a[1],b[1])-COAST_BOX.minZ)/CELL)),r1=Math.min(ROWS-1,Math.floor((Math.max(a[1],b[1])-COAST_BOX.minZ)/CELL));
  for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)shoreGrid[r*COLS+c].push(k);
});
// 안팎 판정 : 꼭짓점 z 사이 띠마다 그 띠를 가로지르는 선분만 (min<=z<max 조건과 정확히 같은 집합)
const bandZ=[...new Set(shore.map(p=>p[1]))].sort((a,b)=>a-b);
const bandEdges=bandZ.map((z,k)=>k+1<bandZ.length?SHORE_EDGES.filter(([a,b])=>Math.min(a[1],b[1])<=z&&Math.max(a[1],b[1])>=bandZ[k+1]):[]);
function coastInside(x,z){
  let lo=0,hi=bandZ.length-1;if(z<bandZ[0]||z>=bandZ[hi])return false;
  while(hi-lo>1){const m=(lo+hi)>>1;if(bandZ[m]<=z)lo=m;else hi=m;}
  let inside=false;
  for(const [a,b] of bandEdges[lo])if(x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  return inside;
}
const visited=new Uint32Array(SHORE_EDGES.length);let visitStamp=0;
function coastDistanceSq(x,z){
  const c=Math.floor((x-COAST_BOX.minX)/CELL),r=Math.floor((z-COAST_BOX.minZ)/CELL);
  let best=Infinity;const stamp=++visitStamp;
  for(let ring=0;ring<Math.max(COLS,ROWS);ring++){
    for(let rr=r-ring;rr<=r+ring;rr++){
      if(rr<0||rr>=ROWS)continue;
      const edge=rr===r-ring||rr===r+ring,step=edge?1:2*ring||1;
      for(let cc=c-ring;cc<=c+ring;cc+=step){
        if(cc<0||cc>=COLS)continue;
        const list=shoreGrid[rr*COLS+cc];
        for(let q=0;q<list.length;q++){const k=list[q];if(visited[k]===stamp)continue;visited[k]=stamp;const e=SHORE_EDGES[k],d=segmentDistanceSq(x,z,e[0],e[1]);if(d<best)best=d;}
      }
    }
    // ring 칸 바깥의 선분은 적어도 ring*CELL 만큼 떨어져 있다
    if(best<=(ring*CELL)**2)break;
  }
  return best;
}
function signedCoast(x,z){
  if(x>-2150||x<-24500||z>-650||z<-13800) return -900;
  const inside=coastInside(x,z),distance=coastDistanceSq(x,z);
  return Math.sqrt(distance)*(inside?1:-1)+105*noise(x/430,z/430)+35*noise(x/160,z/160);
}
function mound(x,z,cx,cz,rx,rz){
  return Math.exp(-(((x-cx)/rx)**2+((z-cz)/rz)**2));
}
function lakeDistance(x,z,lake){
  const dx=x-lake.x,dz=z-lake.z,c=Math.cos(lake.angle),s=Math.sin(lake.angle);
  return (1-Math.hypot((dx*c+dz*s)/lake.a,(dz*c-dx*s)/lake.b))*lake.a+70*noise(x/350,z/350);
}
export function createTerrain(miami){
  function existingHeight(x,z){
    const i=(x-miami.minX)/miami.step,j=(z-miami.minZ)/miami.step;
    if(i<0||j<0||i>=miami.cols-1||j>=miami.rows-1) return -35;
    const col=Math.floor(i),row=Math.floor(j),id=row*miami.cols+col;
    const a=mix(miami.values[id],miami.values[id+1],i-col);
    const b=mix(miami.values[id+miami.cols],miami.values[id+miami.cols+1],i-col);
    return mix(a,b,j-row)/100;
  }
  function sample(x,z){
    const d=signedCoast(x,z), old=existingHeight(x,z);
    if(d<=0 || old>0) {
      if(old>0) return {height:old, zone:'miami'};
      return {height:Math.max(-35,d/21,old),zone:'sea',water:0};
    }
    const rough=noise(x/760,z/760)*.64+noise(x/290,z/290)*.36;
    const rockies=mound(x,z,-17350,-10000,2600,3500);
    const pacific=mound(x,z,-22200,-10400,1500,2500);
    const highDesert=mound(x,z,-16500,-5450,3400,2500);
    const hills=mound(x,z,-7550,-9840,2200,1650);
    const desert=mound(x,z,-19300,-4300,3600,2550);
    const floodplain=mound(x,z,-11250,-5380,1320,3200);
    const northernPlain=mound(x,z,-10950,-11000,3700,2500);
    const aridBasin=mound(x,z,-19500,-4250,1260,1250);
    const coastFade=smooth(0,1300,d);
    let height=(30+75*northernPlain+rockies*(1400+420*rough)
      +pacific*(620+205*rough)+highDesert*(530+100*rough)
      +hills*(375+130*rough)+65*rough)*coastFade;
    height=mix(height,110+35*rough,aridBasin*.84*coastFade);
    height=mix(height,9+12*rough,floodplain*.94);
    const cutDistance=lineDistance(x,z,canyon)+45*noise(x/220,z/220);
    const canyonDepth=(1-smooth(100,820,cutDistance))*highDesert;
    if(canyonDepth>.025) {
      const floor=68+12*noise(x/700,z/700);
      const ledge=1-smooth(15,95,Math.abs(cutDistance-490));
      height=mix(height,floor,Math.min(1,canyonDepth*1.33))+ledge*35*canyonDepth;
      if(cutDistance<46) return {height:floor-4,zone:'river',water:floor};
      return {height:Math.max(.5,height),zone:'canyon'};
    }
    for(const lake of lakes){
      const edge=lakeDistance(x,z,lake);
      if(edge>0) return {height:lake.level-12-22*smooth(0,420,edge),zone:'lake',water:lake.level};
      if(edge>-370) height=mix(lake.level,height,smooth(0,370,-edge));
    }
    const riverDistance=Math.min(lineDistance(x,z,delta),lineDistance(x,z,eastRiver));
    if(riverDistance<48) {
      const bed=mix(3,height,.52);
      return {height:bed-2,zone:'river',water:bed};
    }
    if(floodplain>.4 && riverDistance<520){
      return {height:Math.max(.7,mix(height,5,1-smooth(65,640,riverDistance))),zone:'fields'};
    }
    if(d<105) return {height:Math.max(.35,height),zone:'shore'};
    if(desert>.34) return {height:Math.max(.6,height),zone:'desert'};
    return {height:Math.max(.6,height),zone:'land'};
  }
  return sample;
}

export function surfaceColor(sample,x,z){
  const {height,zone}=sample;
  if(zone==='sea') {
    const depth=smooth(0,35,-height);
    return [mix(57,14,depth),mix(133,45,depth),mix(137,66,depth)];
  }
  if(zone==='lake'||zone==='river') return [53,128,153];
  if(zone==='shore') return [198,185,138];
  if(zone==='miami') return [116,158,115];
  if(zone==='fields'){
    const row=Math.floor((z+x*.10)/82),col=Math.floor((x-z*.06)/114);
    const t=hash(col,row);
    return [94+t*62,125+t*46,70+t*34];
  }
  const grain=noise(x/390,z/390)*10;
  if(zone==='canyon') return [179+grain,100+grain+height*.04,66+grain+height*.025];
  if(zone==='desert') return [192+grain,152+grain,96+grain];
  const slope=smooth(420,1110,height),snow=smooth(1150,1510,height);
  return [mix(82+slope*37,220,snow)+grain,mix(126-slope*12,227,snow)+grain,mix(82+slope*27,228,snow)+grain];
}
