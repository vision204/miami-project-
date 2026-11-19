import {createTerrain, surfaceColor} from './northwest-terrain.mjs';

export const world = {minX:-52500,maxX:3500,minZ:-25400,maxZ:14600,sizeX:56000,sizeZ:40000};
const prototype = createTerrain({minX:1e6,minZ:1e6,step:50,rows:0,cols:0});
const source = [-8900,-3800], target = [-10300,-4100];
export function expand([x,z]){
  return [target[0]+2*(x-source[0]),target[1]+2*(z-source[1])];
}
function baseTerrain(x,z){
  const sx=source[0]+(x-target[0])/2,sz=source[1]+(z-target[1])/2;
  const ground=prototype(sx,sz);
  if(ground.waterEdge!==undefined)ground.waterEdge*=2;
  return ground;
}
const harborSound=[[-470,-17300],[-815,-18200],[-905,-19040],[-980,-19900],[-765,-20500],[-180,-21300],[650,-21620]];
const lakeRiver=[[-14550,-18130],[-14180,-17640],[-13830,-17480],[-13440,-17420],[-13050,-17460],[-12690,-17590],[-12350,-17840]];
const deltaRiver=[[-15340,-10050],[-15310,-9510],[-15100,-8910],[-14830,-8470],[-14790,-8190],[-14955,-7920],[-15185,-7620],[-15200,-6880]];
function distanceToLine(x,z,path){
  let best=Infinity;
  for(let i=1;i<path.length;i++){
    const [ax,az]=path[i-1],dx=path[i][0]-ax,dz=path[i][1]-az;
    const t=Math.min(1,Math.max(0,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
    best=Math.min(best,(x-ax-t*dx)**2+(z-az-t*dz)**2);
  }
  return Math.sqrt(best);
}
function smooth(a,b,v){
  const t=Math.min(1,Math.max(0,(v-a)/(b-a)));
  return t*t*(3-2*t);
}
export const westportSign={x:-34655,z:-5126,angle:.37};
const westportRidges=[
  // Crest position, elevation gain, and width along and across each ridge.
  [-35430,-6100,153,540,255,.57],[-35070,-5700,111,385,220,.78],
  [-34720,-5410,151,375,220,.23],[-34290,-5740,143,422,238,-.52],
  [-33900,-5500,111,430,230,-.55],[-33670,-6060,138,445,266,-.69],
  [-34650,-6530,184,585,310,.06],[-34030,-6660,119,490,260,-.20],
].map(([x,z,height,width,depth,angle])=>({x,z,height,width,depth,c:Math.cos(angle),s:Math.sin(angle)}));

function westportHills(x,z,base){
  const edge=smooth(-36300,-35650,x)*(1-smooth(-33800,-33150,x))*
    smooth(-7480,-6990,z)*(1-smooth(-5100,-4850,z));
  if(edge===0)return base;
  let rise=0;
  for(const {x:cx,z:cz,height,width,depth,c,s} of westportRidges){
    const dx=x-cx,dz=z-cz,u=(dx*c+dz*s)/width,v=(-dx*s+dz*c)/depth;
    rise+=(height*Math.exp(-(u*u+v*v)))**3;
  }
  rise=Math.cbrt(rise);
  const gullies=(.87+.13*Math.cos(x*.020+z*.009+1.1*Math.sin(z*.014)));
  const {x:sx,z:sz,angle}=westportSign,dx=x-sx,dz=z-sz;
  const u=dx*Math.cos(angle)+dz*Math.sin(angle),v=-dx*Math.sin(angle)+dz*Math.cos(angle);
  const shoulder=(1-smooth(132,260,Math.abs(u)))*(1-smooth(18,101,Math.abs(v)));
  const height=base.height+edge*rise*gullies;
  return {...base,height:between(height,174+u*.012-v*.22,shoulder),
    westportScrub:edge*smooth(5,80,rise)};
}
// Baycrest Golden Gate: a strait cut north of the city plateau, crossed by a
// suspension bridge from the city's north-edge street to a north vista point.
// t runs along the bridge (north), l across it (east positive).
export const goldenGate={
  start:[-37725,-13226],dir:[-.2377,-.9713],deck:209,
  center:700,radius:330,mouth:-1400,inner:40,
  anchorSouth:200,towerSouth:380,towerNorth:1020,anchorNorth:1200,end:1290,
};
function gateLocal(x,z){
  const {start:[sx,sz],dir:[dx,dz]}=goldenGate,rx=x-sx,rz=z-sz;
  return [rx*dx+rz*dz,rx*-dz+rz*dx];
}
export function gatePoint(t,l=0){
  const {start:[sx,sz],dir:[dx,dz]}=goldenGate;
  return [sx+dx*t-dz*l,sz+dz*t+dx*l];
}
function goldenGateGround(x,z,ground){
  const [t,l]=gateLocal(x,z),{center,radius,mouth,inner,deck}=goldenGate;
  const along=Math.min(inner,Math.max(mouth,l));
  const ragged=Math.abs(l)>130?18*Math.sin(l*.021+1.3)+9*Math.sin(l*.057):0;
  const shore=Math.hypot(t-center,l-along)-radius-ragged;
  if(shore<0)return {height:-14,zone:'sea',water:0};
  const lateral=smooth(-1000,-850,l)*(1-smooth(380,560,l))*(1-smooth(1480,1700,t))*smooth(-260,-60,t);
  const cliff=between(1.4,deck-.6,smooth(24,165,shore));
  const height=between(ground.height,Math.max(ground.height,cliff),lateral);
  if(shore<26&&lateral>.3)return {...ground,height:Math.max(.6,height),zone:'shore',gateCliff:lateral};
  return {...ground,height,gateHeadland:lateral*smooth(60,190,shore),gateCliff:lateral*(1-smooth(120,200,shore))};
}
// Iron Junction incline: a 30-degree hillside cut into the far bank of the gorge,
// downstream of the steel bridge, with a bench at the river and a pad on the rim.
export const inclineSite={x:-6586.7,z:-17186.3,water:181.61,R:113,flow:[.6802,.733],normal:[.733,-.6802],
  bench:16,run:250,top:331,half:30};
function inclineGround(x,z,ground){
  const I=inclineSite,dx=x-I.x,dz=z-I.z;
  const u=dx*I.flow[0]+dz*I.flow[1],v=dx*I.normal[0]+dz*I.normal[1];
  const start=I.R+I.bench,end=start+I.run;
  if(v<I.R-6||v>end+150||Math.abs(u)>I.half+90)return ground;
  const bottom=I.water+4;
  const ramp=v<start?bottom:v<end?bottom+(I.top-bottom)*(v-start)/I.run:I.top;
  const across=1-smooth(I.half,I.half+75,Math.abs(u));
  const beyond=1-smooth(end+60,end+140,v);
  const w=across*beyond;
  if(w<=0)return ground;
  return {...ground,height:between(ground.height,ramp,w),zone:'land',incline:w,inclineCut:w*smooth(start-10,start+20,v)*(1-smooth(end,end+30,v))};
}
// Harborline: a small harbor island for the Harbor Light statue, south-east of downtown.
export const harborIsland={x:-450,z:-17550,r:80};
function harborIslandGround(x,z,ground){
  const I=harborIsland,dx=x-I.x,dz=z-I.z,d=Math.hypot(dx,dz);
  const a=Math.atan2(dz,dx),edge=I.r+6*Math.sin(a*3+.8)+4*Math.sin(a*7);
  if(d<edge-14)return {height:3.4+1.6*(1-smooth(0,edge-14,d)),zone:'land',harborIsle:1};
  if(d<edge)return {height:between(3.4,.6,smooth(edge-14,edge,d)),zone:'shore',harborIsle:1};
  return ground;
}
// ---------------------------------------------------------------------------------------------
// Nature finish (2026-11-14): Cascade volcanoes, a reservoir behind a dam in the canyon's west
// arm, regional ground colours and snow caps.
export const volcanoes=[
  {name:'Mount Tacora',x:-34243,z:-19118,R:2100,H:1150,seed:3},
  {name:'Mount Shastel',x:-32900,z:-15491,R:1800,H:980,seed:7},
];
function volcanoLift(x,z){
  let lift=0;
  for(const v of volcanoes){
    const dx=x-v.x,dz=z-v.z,d=Math.hypot(dx,dz);
    if(d>=v.R)continue;
    const a=Math.atan2(dz,dx),f=1-d/v.R;
    let h=v.H*Math.pow(f,1.75)*(1+.07*Math.sin(a*7+v.seed)+.05*gcNoise(x/260,z/260));
    const crater=v.R*.055;if(d<crater)h-=v.H*.07*(1-d/crater);
    lift+=h*smooth(0,.12,f);
  }
  return lift;
}
// Bridal-veil style falls on the north face of the Rockies: a creek runs to a cliff lip, drops
// into a carved amphitheatre with a plunge pool, and leaves as a stream down the valley.
export const bigFalls={x:-27500,z:-20500,angle:4.32,W:56,drop:135,pool:95,R:96};
let fallsTop=null;
function fallsCarve(q,x,z){
  const F=bigFalls,dx=x-F.x,dz=z-F.z;
  if(dx*dx+dz*dz>900*900)return q;
  if(fallsTop===null)fallsTop=terrainCore(F.x,F.z).height;
  const fx=Math.cos(F.angle),fz=Math.sin(F.angle),u=dx*fx+dz*fz,v=-dx*fz+dz*fx,Ht=fallsTop,Hb=Ht-F.drop;
  let h=q.height,out=null;
  // creek above the lip
  if(u<=2&&u>-300&&Math.abs(v)<F.W/2+16){
    const w=1-smooth(F.W/2,F.W/2+16,Math.abs(v)),end=smooth(-300,-240,u),bed=Ht-3.2;
    h=Math.min(h,between(h,bed,w*end));
    if(Math.abs(v)<F.W/2&&u>-262&&u<-30)out={zone:'river',water:Ht+.2,waterEdge:Math.min(F.W/2-Math.abs(v),-30-u)};
  }
  // amphitheatre below the lip
  const pu=u-F.pool,d=Math.hypot(pu,v);
  if(u>-4&&d<F.R+16){
    const floor=Hb+Math.max(0,d-(F.R-34))*.22,w=1-smooth(F.R,F.R+16,d);
    h=Math.min(h,between(h,floor,w));
    if(d<54){h=Math.min(h,between(Hb-6,Hb+.4,smooth(36,54,d)));out={zone:'lake',water:Hb+1.2,waterEdge:54-d};}
  }
  // outflow stream down the valley
  if(pu>40&&pu<700&&Math.abs(v)<20){
    const base=terrainCore(F.x+fx*u,F.z+fz*u).height,lvl=Math.min(Hb+1.2,base-1),w=1-smooth(8,20,Math.abs(v));
    h=Math.min(h,between(h,lvl-1.6,w));
    if(Math.abs(v)<8&&!out)out={zone:'river',water:lvl,waterEdge:8-Math.abs(v)};
  }
  if(h===q.height&&!out)return q;
  const cut=Math.min(1,(q.height-h)/10);
  return out?{...q,...out,height:Math.min(h,out.water-.3)}:{...q,height:h,fallsCut:cut};
}
export function terrain(x,z){
  const q=terrainCore(x,z);
  if(q.zone==='sea'||q.water!==undefined)return q;
  const lift=volcanoLift(x,z),r=lift>0?{...q,height:q.height+lift,volcano:lift}:q;
  return fallsCarve(r,x,z);
}
export function bigFallsInfo(){terrain(bigFalls.x,bigFalls.z);return {...bigFalls,top:fallsTop,bottom:fallsTop-bigFalls.drop};}
function terrainCore(x,z){
  const ground=baseTerrain(x,z);
  if(Math.abs(x-harborIsland.x)<120&&Math.abs(z-harborIsland.z)<120){
    const isle=harborIslandGround(x,z,ground);if(isle!==ground)return isle;
  }
  if(ground.zone==='sea')return ground;
  if(x>-36300&&x<-33150&&z>-7480&&z<-4850&&ground.water===undefined)
    return westportHills(x,z,ground);
  if(x>-39400&&x<-36700&&z>-15100&&z<-12900&&ground.water===undefined)
    return goldenGateGround(x,z,ground);
  if(x>-6800&&x<-6050&&z>-17750&&z<-16700&&ground.water===undefined)
    return inclineGround(x,z,ground);
  if(x>-1400&&x<1020&&z>-21790&&z<-17100){
    const distance=distanceToLine(x,z,harborSound);
    if(distance<125)return {height:-12,zone:'sea',water:0};
    if(distance<255)return {...ground,height:Math.max(.5,ground.height*smooth(125,255,distance)),zone:'shore'};
  }
  if(x>-14800&&x<-12000&&z>-18500&&z<-17150){
    const distance=distanceToLine(x,z,lakeRiver);
    if(distance<66)return {height:94,zone:'river',water:100,waterEdge:66-distance};
    if(distance<180&&ground.water===undefined)return {...ground,height:between(101,ground.height,smooth(66,180,distance)),waterEdge:Math.max(ground.waterEdge??-Infinity,66-distance)};
  }
  if(x>-15720&&x<-14500&&z>-10400&&z<-6540){
    const distance=distanceToLine(x,z,deltaRiver);
    if(distance<112)return {height:-5.2,zone:'river',water:1,waterEdge:112-distance};
    if(distance<215&&ground.water===undefined)return {...ground,height:between(1.2,ground.height,smooth(112,215,distance)),waterEdge:Math.max(ground.waterEdge??-Infinity,112-distance)};
  }
  if(x>gc.box[0]&&x<gc.box[2]&&z>gc.box[1]&&z<gc.box[3]){
    const carved=grandCanyon(x,z,ground);
    if(carved)return reservoir(trailBuilding?carved:applyTrails(carved,x,z),x,z);
  }
  return ground;
}

// ---------------------------------------------------------------------------------------------
// Grand Canyon: rebuilt from the real stratigraphy. Heights follow the rock layers from the
// Colorado River up to the Kaibab rim (inner gorge, Tonto platform, Redwall cliff, Supai ledges,
// Hermit slope, Coconino cliff, Toroweap, Kaibab rim). Side canyons branch off the main gorge and
// isolated "temples" (buttes) stand inside it, carved from the same layers.
function gcHash(i,j){
  let n=Math.imul(i|0,374761393)+Math.imul(j|0,668265263);
  n=Math.imul(n^(n>>>13),1274126177);
  return ((n^(n>>>16))>>>0)/4294967295;
}
function gcNoise(x,z){
  const i=Math.floor(x),j=Math.floor(z),fx=x-i,fz=z-j,u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);
  const a=gcHash(i,j)+(gcHash(i+1,j)-gcHash(i,j))*u,b=gcHash(i,j+1)+(gcHash(i+1,j+1)-gcHash(i,j+1))*u;
  return (a+(b-a)*v)*2-1;
}
// [name, run, rise, colour, kind] from the river upwards. kind: 0 slope, 1 cliff, 2 bench.
export const canyonStrata=[
  ['Vishnu schist (inner gorge)',.06,.24,[98,82,78],1],
  ['Tapeats sandstone',.016,.03,[128,94,70],1],
  ['Tonto platform',.13,.04,[142,136,100],2],
  ['Muav limestone',.018,.05,[152,124,98],1],
  ['Redwall limestone',.026,.18,[172,90,62],1],
  ['Supai group',.05,.035,[160,82,57],0],
  ['Supai ledge',.014,.04,[182,100,69],1],
  ['Supai group',.05,.035,[154,78,55],0],
  ['Supai ledge',.014,.04,[184,104,71],1],
  ['Hermit shale',.075,.08,[165,72,50],0],
  ['Coconino sandstone',.017,.11,[222,204,166],1],
  ['Toroweap formation',.04,.05,[178,132,98],0],
  ['Kaibab limestone',.014,.07,[190,178,148],1],
]
const gc=(()=>{
  const main=[[-18900,-5220],[-18000,-4800],[-17400,-4600],[-16850,-4380],[-16250,-4730],[-15450,-5350],[-14950,-6000]].map(expand);
  const runTotal=canyonStrata.reduce((a,q)=>a+q[1],0),riseTotal=canyonStrata.reduce((a,q)=>a+q[2],0);
  let t=0,f=0;
  const layers=canyonStrata.map(([name,run,rise,color,kind])=>{
    const q={name,t0:t,t1:t+run/runTotal,f0:f,f1:f+rise/riseTotal,color,kind};t=q.t1;f=q.f1;return q;
  });
  const solara=[-31371,-4331],branches=[],temples=[];
  const along=[];let total=0;
  for(let i=1;i<main.length;i++){
    const [ax,az]=main[i-1],[bx,bz]=main[i],len=Math.hypot(bx-ax,bz-az);
    along.push({ax,az,dx:(bx-ax)/len,dz:(bz-az)/len,len,s0:total});total+=len;
  }
  const at=s=>{const g=along.find(q=>s<=q.s0+q.len)??along.at(-1),u=Math.min(s-g.s0,g.len);return [g.ax+g.dx*u,g.az+g.dz*u,g.dx,g.dz];};
  function grow(x,z,heading,length,width,seed,order){
    const points=[[x,z]],n=6;
    for(let k=1;k<=n;k++){
      heading+=(gcHash(seed,k)-.5)*.75;
      x+=Math.cos(heading)*length/n;z+=Math.sin(heading)*length/n;points.push([x,z]);
    }
    if(points.some(([px,pz])=>Math.hypot(px-solara[0],pz-solara[1])<3300))return;
    const segs=[];let acc=0;
    for(let k=1;k<points.length;k++){
      const [ax,az]=points[k-1],[bx,bz]=points[k],len=Math.hypot(bx-ax,bz-az);
      segs.push({ax,az,dx:bx-ax,dz:bz-az,len,s0:acc});acc+=len;
    }
    const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
    branches.push({segs,length:acc,width,order,box:[Math.min(...xs)-width*1.6,Math.min(...zs)-width*1.6,Math.max(...xs)+width*1.6,Math.max(...zs)+width*1.6]});
    if(order===0)for(const frac of [.35,.62]){
      const p=points[Math.round(frac*n)],side=gcHash(seed,91+frac*10)<.5?-1:1;
      grow(p[0],p[1],heading+side*(1+gcHash(seed,7)*.5),length*(.32+gcHash(seed,8)*.18),width*.62,seed*31+frac*100,1);
    }
  }
  let k=0;
  for(let s=380;s<total-250;s+=520+gcHash(k,3)*360,k++){
    const [px,pz,dx,dz]=at(s),side=k%2?1:-1;
    const heading=Math.atan2(dx*side,-dz*side)+(gcHash(k,5)-.5)*.6;    // roughly perpendicular to the river
    grow(px,pz,heading,1500+gcHash(k,6)*1300,560+gcHash(k,9)*200,k+11,0);
  }
  k=0;
  for(let s=650;s<total-400;s+=600+gcHash(k,13)*420,k++){
    const [px,pz,dx,dz]=at(s),side=gcHash(k,17)<.5?-1:1,off=(700+gcHash(k,19)*520)*side;
    temples.push({x:px-dz*off,z:pz+dx*off,r:190+gcHash(k,23)*190,top:.55+gcHash(k,29)*.38});
  }
  const xs=main.map(p=>p[0]),zs=main.map(p=>p[1]);
  const box=[Math.min(...xs)-4800,Math.min(...zs)-4800,Math.max(...xs)+4800,Math.max(...zs)+4800];
  return {main,layers,branches,temples,box,at,total};
})();
export const grandCanyonPath=gc.main;
// Along-canyon distance of a point (projection onto the main gorge line).
function canyonS(x,z){
  let best=Infinity,s=0,acc=0;
  for(let i=1;i<gc.main.length;i++){
    const [ax,az]=gc.main[i-1],[bx,bz]=gc.main[i],dx=bx-ax,dz=bz-az,L=Math.hypot(dx,dz);
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(L*L))),d=(x-ax-t*dx)**2+(z-az-t*dz)**2;
    if(d<best){best=d;s=acc+t*L;}
    acc+=L;
  }
  return s;
}
// Reservoir: a dam across the west arm (just upstream of the canyon road bridge) holds a lake
// back to the east, ending where the river comes in. A pale "bathtub ring" marks the old shore.
export const canyonDam={s:2650,end:4150,level:150};
export function canyonPoint(s){const [x,z,dx,dz]=gc.at(s);return {x,z,dx,dz};}
function reservoir(q,x,z){
  if(q.zone!=='canyon'&&q.zone!=='river')return q;
  const s=canyonS(x,z),D=canyonDam;
  if(s<D.s-1)return q;
  const w=1-smooth(D.end,D.end+320,s);
  if(w<=0)return q;
  const river=q.zone==='river'?q.water:72,L=river+(D.level-river)*w;
  if(q.height<L-.2)return {...q,zone:'river',water:L,waterEdge:Math.min(80,(L-q.height)*5),reservoir:w};
  if(q.height<L+15&&w>.6)return {...q,bathtub:1-(q.height-L)/15};
  return q;
}

// Canyon stair trails: three stone staircases from the river bank up to the rim, one near each
// end of the canyon and one in the middle. Each one is a straight line across the wall whose
// height profile is a smoothed, always-rising version of the cliffs it crosses; the terrain is
// cut/filled to that profile and the stairs sit on top. The cliffs themselves stay climbable.
export const trailSpec={step:.28,half:1.9,sample:4};
let trailBuilding=false,trailList=null;
function trailProbe(px,pz,nx,nz){
  let start=-1,end=-1,bad=0,top=-Infinity;
  for(let r=40;r<=2900;r+=8){
    const q=terrain(px+nx*r,pz+nz*r);
    if(start<0){if(q.zone!=='river')start=r;else continue;}
    if(q.zone==='river'||q.water!==undefined)bad+=40;
    if(q.height<top-6)bad+=(top-q.height)/6;              // dips = side canyons or temples in the way
    top=Math.max(top,q.height);
    if(q.zone==='plateau'){end=r;break;}
  }
  return end<0||start<0?null:{start,end,bad};
}
function buildTrails(){
  trailBuilding=true;
  const out=[];
  try{
    for(const frac of [.1,.5,.9]){
      let best=null;
      for(let ds=-480;ds<=480;ds+=120)for(const side of [-1,1]){
        const s=frac*gc.total+ds;
        if(s<200||s>gc.total-200)continue;
        const [px,pz,dx,dz]=gc.at(s),nx=-dz*side,nz=dx*side,probe=trailProbe(px,pz,nx,nz);
        if(!probe)continue;
        const score=probe.bad+(probe.end-probe.start)/300+Math.abs(ds)/400;
        if(!best||score<best.score)best={score,px,pz,nx,nz,...probe};
      }
      if(!best)continue;
      const {px,pz,nx,nz}=best,ax=px+nx*(best.start-4),az=pz+nz*(best.start-4);
      const len=best.end+50-(best.start-4),S=trailSpec.sample,n=Math.ceil(len/S)+1;
      const raw=new Float32Array(n);
      for(let i=0;i<n;i++)raw[i]=terrain(ax+nx*i*S,az+nz*i*S).height;
      let prof=Float32Array.from(raw);
      for(let pass=0;pass<2;pass++){                           // box filter, about 120 m wide
        const R=15,next=new Float32Array(n);
        for(let i=0;i<n;i++){let a=0,c=0;for(let j=Math.max(0,i-R);j<=Math.min(n-1,i+R);j++){a+=prof[j];c++;}next[i]=a/c;}
        prof=next;
      }
      const d0=raw[0]+.2-prof[0],d1=raw[n-1]-prof[n-1];
      let run=-Infinity;
      for(let i=0;i<n;i++){
        const u=i/(n-1);
        prof[i]+=d0*(1-u)*(1-u)+d1*u*u;
        run=Math.max(run,prof[i]);prof[i]=run;
      }
      for(let i=n-2;i>=0;i--)prof[i]=Math.max(prof[i],prof[i+1]-.62*S);   // no flight steeper than ~32 degrees
      out.push({ax,az,nx,nz,len:(n-1)*S,prof,
        box:[Math.min(ax,ax+nx*len)-260,Math.min(az,az+nz*len)-260,Math.max(ax,ax+nx*len)+260,Math.max(az,az+nz*len)+260]});
    }
  }finally{trailBuilding=false;}
  return out;
}
export function canyonTrails(){return trailList??=buildTrails();}
export function trailRamp(trail,u){
  const S=trailSpec.sample,f=Math.min(Math.max(u,0),trail.len)/S,i=Math.min(Math.floor(f),trail.prof.length-2),r=f-i;
  return trail.prof[i]+(trail.prof[i+1]-trail.prof[i])*r;
}
function trailHit(x,z){
  if(x<gc.box[0]||x>gc.box[2]||z<gc.box[1]||z>gc.box[3])return null;
  for(const trail of canyonTrails()){
    if(x<trail.box[0]||x>trail.box[2]||z<trail.box[1]||z>trail.box[3])continue;
    const rx=x-trail.ax,rz=z-trail.az,u=rx*trail.nx+rz*trail.nz,v=-rx*trail.nz+rz*trail.nx;
    if(u<-250||u>trail.len+250||Math.abs(v)>250)continue;
    return {trail,u,v};
  }
  return null;
}
function applyTrails(q,x,z){
  const hit=trailHit(x,z);
  if(!hit)return q;
  const {trail,u,v}=hit,uc=Math.min(Math.max(u,0),trail.len),d=Math.hypot(u-uc,v);
  const target=trailRamp(trail,uc)-.35,diff=Math.abs(q.height-target);
  const w=1-smooth(12,12+Math.max(26,diff*.9),d);
  if(w<=0)return q;
  return {...q,height:q.height+(target-q.height)*w,trail:w};
}
// Top of the stair tread under (x,z), or null when not on a staircase.
export function canyonTrailFloor(x,z){
  const hit=trailHit(x,z);
  if(!hit||Math.abs(hit.v)>trailSpec.half||hit.u<0||hit.u>hit.trail.len)return null;
  const H=trailSpec.step;
  return Math.ceil(trailRamp(hit.trail,hit.u)/H-1e-6)*H;
}
function canyonProfile(t){
  const river=.05;
  if(t<=river)return {f:0,layer:-1};
  const u=(t-river)/(1-river);
  for(let i=0;i<gc.layers.length;i++){
    const q=gc.layers[i];
    if(u>q.t1)continue;
    const r=(u-q.t0)/(q.t1-q.t0);
    const e=q.kind===1?Math.min(1,r*1.08):q.kind===2?r*r*(3-2*r):Math.pow(r,.75);
    return {f:q.f0+(q.f1-q.f0)*e,layer:i};
  }
  return {f:1,layer:gc.layers.length};
}
function grandCanyon(x,z,ground){
  if(ground.zone==='sea'||ground.zone==='lake'||ground.water!==undefined&&ground.rim===undefined)return null;
  const tx=source[0]+(x-target[0])/2,tz=source[1]+(z-target[1])/2;
  const plateau=Math.exp(-(((tx+16500)/3400)**2+((tz+5450)/2500)**2));
  const strength=smooth(.12,.5,plateau);
  if(strength<=0)return null;
  const raw=distanceToLine(x,z,gc.main);
  const width=1750+260*gcNoise(x/3000+5,z/3000);
  let t=(raw+150*gcNoise(x/1100,z/1100)+48*gcNoise(x/300+3,z/300))/width;
  // Spurs and gullies cut into every wall so the cliffs are never one smooth curtain.
  const rough=.05*gcNoise(x/170+11,z/170-4)+.028*gcNoise(x/75-7,z/75+2);
  for(const b of gc.branches){
    if(x<b.box[0]||z<b.box[1]||x>b.box[2]||z>b.box[3])continue;
    let best=Infinity,s=0;
    for(const g of b.segs){
      const q=Math.min(1,Math.max(0,((x-g.ax)*g.dx+(z-g.az)*g.dz)/(g.len*g.len)));
      const d=(x-g.ax-q*g.dx)**2+(z-g.az-q*g.dz)**2;
      if(d<best){best=d;s=(g.s0+q*g.len)/b.length;}
    }
    const tb=(b.order?.3:.16)+s*.78+(Math.sqrt(best)+40*gcNoise(x/200,z/200))/b.width;
    const h=.14,m=Math.max(h-Math.abs(t-tb),0)/h;
    t=Math.min(t,tb)-m*m*h*.25;                                      // smooth union of the canyons
  }
  for(const temple of gc.temples){
    const d=Math.hypot(x-temple.x,z-temple.z);
    if(d>temple.r)continue;
    const crown=temple.top*(1-smooth(temple.r*.42,temple.r,d+25*gcNoise(x/90,z/90)));
    if(crown>t)t=crown;
  }
  t+=rough*smooth(.08,.22,t);
  const base=ground.rim??(ground.water===undefined?ground.height:null);
  if(base===null)return null;
  // The south side drops toward the coast; hold it up as a real rim and let it fall away beyond.
  const rim=base+Math.max(0,440+40*gcNoise(x/900,z/900)-base)*strength*(1-smooth(1.05,1.9,t))*smooth(0,160,base);
  if(t>=1){
    // Kaibab plateau around the rim, blending back into the surrounding land.
    const blend=strength*(1-smooth(1.15,2.1,t));
    if(blend<=.02&&ground.zone!=='canyon'&&ground.zone!=='river')return null;
    return {...ground,height:rim,zone:'plateau',canyonF:1,canyonLayer:gc.layers.length,canyonRim:blend,waterEdge:-200};
  }
  const floor=(68+12*gcNoise(tx/700,tz/700))*1;
  const depth=Math.max(0,rim-floor)*strength;
  const riverDistance=raw+22*gcNoise(x/400,z/400),edge=85-riverDistance;
  if(edge>0&&strength>.3)return {height:floor-5-4*Math.min(1,edge/30),zone:'river',water:floor,waterEdge:edge};
  const {f,layer}=canyonProfile(t);
  const bed=edge>-30?1.4:0;
  return {...ground,height:rim-(1-f)*depth+bed*(1-f),zone:'canyon',canyonF:f,canyonLayer:layer,waterEdge:edge,rim};
}
function regionTint(point,x,z,c){
  if(point.zone==='sea'||point.zone==='shore'||point.water!==undefined||point.zone==='miami')return c;
  if(point.fallsCut>0){const k=point.fallsCut,n=gcNoise(x/18,z/18);return c.map((v,i)=>between(v,[[86,84,78],[70,72,70],[104,98,86]][n>.3?2:n>-.2?0:1][i],k*.9));}
  if(point.bathtub>0)return c.map((n,i)=>between(n,[226,220,204][i],Math.min(1,point.bathtub)*.85));
  const arid=point.zone==='canyon'||point.zone==='plateau'||point.zone==='desert';
  let out=c;
  if(!arid){
    // Great Plains patchwork: wheat, corn, stubble and pasture in 420 m squares.
    const plains=smooth(-21300,-20500,x)*(1-smooth(-17300,-16500,x))*smooth(-15900,-15100,z)*(1-smooth(-11200,-10400,z));
    if(plains>0){
      const i=Math.floor(x/420),j=Math.floor(z/420),h=gcHash(i*7+3,j*13+5);
      const tone=h<.34?[204,178,96]:h<.62?[104,146,58]:h<.82?[176,158,104]:[122,150,80];
      const stripe=.92+.08*Math.sin((x+z)*.09);
      out=out.map((n,k)=>between(n,tone[k]*stripe,plains*.72));
    }
    // Southern red clay.
    const south=smooth(-12300,-11600,x)*(1-smooth(-8900,-8200,x))*smooth(-10300,-9600,z)*(1-smooth(-6300,-5600,z));
    if(south>0){
      const patch=.55+.45*gcNoise(x/520+4,z/520-2);
      out=out.map((n,k)=>between(n,[176,88,56][k],south*.78*patch));
    }
    // Northern woods: darker, cooler greens.
    const north=1-smooth(-17500,-16500,z);
    if(north>0)out=out.map((n,k)=>between(n,[44,86,56][k]*(.9+.2*gcNoise(x/300,z/300)),north*.42));
  }
  // Snow on high peaks (Rockies and the Cascade volcanoes); a little lower on the volcanoes.
  const snowline=(point.volcano>0?1120:1360)+70*gcNoise(x/700+9,z/700+3);
  // Bare rock and alpine meadow below the snow, so only the real peaks turn white.
  if(!arid&&point.height>850&&point.height<snowline){
    const k=smooth(850,1000,point.height)*(1-smooth(snowline-140,snowline-50,point.height));
    const rock=gcNoise(x/240+1,z/240-5)>.15?[98,94,86]:[84,106,72];
    out=out.map((n,i)=>between(n,rock[i],k*.88));
  }
  if(point.height>snowline-60&&point.zone!=='canyon'){
    // Snow only settles on gentler ground: steep faces and ridgelines stay dark rock,
    // which gives the peaks their streaky, real-mountain look.
    const e=14,gx=terrain(x+e,z).height-terrain(x-e,z).height,gz=terrain(x,z+e).height-terrain(x,z-e).height,slope=Math.hypot(gx,gz)/(2*e);
    const gully=gcNoise(x/90+2,z/90-7);
    const hold=1-smooth(.62,1.05,slope+gully*.25);
    const patch=point.volcano>0?1:smooth(-.45,.2,gcNoise(x/260+5,z/260-1)+(point.height-snowline)/260);
    const k=smooth(snowline-60,snowline+90,point.height)*(.18+.82*hold)*patch;
    const rock=[92,94,98].map(n=>n*(.9+.2*gcNoise(x/60,z/60)));
    out=out.map((n,i)=>between(n,rock[i],smooth(snowline-60,snowline+40,point.height)*(1-hold)*.85));
    out=out.map((n,i)=>between(n,[238,242,247][i],k));
  }
  return out;
}
export function terrainColor(point,x,z){
  const c=regionTint(point,x,z,terrainColorBase(point,x,z));
  if(!(point.trail>.5))return c;
  const k=smooth(.5,1,point.trail),dust=[184,156,122];
  return c.map((n,i)=>between(n,dust[i],k*.85));
}
function terrainColorBase(point,x,z){
  if(point.inclineCut>.05){
    const grain=.5+.5*Math.sin(x*.07+z*.05);
    const scrub=[between(96,122,grain),between(104,116,grain),between(70,82,grain)];
    return surfaceColor(point,source[0]+(x-target[0])/2,source[1]+(z-target[1])/2).map((n,i)=>between(n,scrub[i],point.inclineCut));
  }
  if(point.gateCliff>.02){
    const grain=.5+.5*Math.sin(x*.05+z*.031+2*Math.sin(z*.013));
    const rock=[between(112,141,grain),between(99,118,grain),between(84,96,grain)];
    const above=point.gateHeadland?[118,124,80]:surfaceColor(point,source[0]+(x-target[0])/2,source[1]+(z-target[1])/2);
    return above.map((n,i)=>between(n,rock[i],point.gateCliff));
  }
  if(point.gateHeadland){
    const original=surfaceColor(point,source[0]+(x-target[0])/2,source[1]+(z-target[1])/2);
    const patch=.5+.5*Math.sin(x*.017+1.7*Math.sin(z*.011));
    const scrub=[between(104,138,patch),between(118,128,patch),between(74,84,patch)];
    return original.map((n,i)=>between(n,scrub[i],point.gateHeadland));
  }
  if(point.westportScrub){
    const patch=Math.sin(x*.013+2*Math.sin(z*.007))*.26+
      Math.sin(z*.023-x*.008)*.14+Math.cos(x*.061+z*.043)*.08;
    const cover=point.westportScrub*smooth(-.36,.30,patch);
    const dry=[171,145,101],scrub=[95,109,68];
    const original=surfaceColor(point,source[0]+(x-target[0])/2,source[1]+(z-target[1])/2);
    return original.map((n,i)=>between(n,between(dry[i],scrub[i],cover),point.westportScrub));
  }
  if((point.zone==='canyon'||point.zone==='plateau')&&point.canyonF!==undefined){
    const L=gc.layers,i=point.canyonLayer;
    if(i<0)return [150,128,100];                                   // river bank sand
    if(i>=L.length){
      const around=surfaceColor({...point,zone:point.height>420?'land':'desert'},source[0]+(x-target[0])/2,source[1]+(z-target[1])/2);
      const cover=smooth(-.15,.55,gcNoise(x/260,z/260)*.75+gcNoise(x/65+9,z/65)*.35+.15);
      const kaibab=[between(170,98,cover),between(152,108,cover),between(118,70,cover)];   // limestone soil under pinyon-juniper
      return around.map((n,k)=>between(n,kaibab[k],point.canyonRim??1));
    }
    const q=L[i],r=(point.canyonF-q.f0)/Math.max(1e-6,q.f1-q.f0);
    let c=q.color;
    if(r>.82&&L[i+1])c=c.map((n,k)=>between(n,L[i+1].color[k],(r-.82)/.36));   // soft contact with the layer above
    const bedding=.93+.07*Math.sin(point.height*.62+2.2*Math.sin(x*.004+z*.003));
    const grain=1+.05*Math.sin(x*.031+z*.027)*Math.cos(z*.019-x*.012);
    let out=c.map(n=>n*bedding*grain);
    if(q.kind===2||q.kind===0&&point.canyonF<.3){                 // scrub on benches and slopes
      const scrub=smooth(.35,.85,.5+.5*Math.sin(x*.021+3*Math.sin(z*.013))*Math.cos(z*.017));
      out=out.map((n,k)=>between(n,[104,112,78][k],scrub*(q.kind===2?.45:.2)));
    }
    if(q.kind===1)out=out.map(n=>n*.9);                            // desert varnish on cliff faces
    if(i===0){                                                     // pink Zoroaster granite veins in the schist
      const vein=smooth(.72,.95,.5+.5*Math.sin(x*.013-z*.021+3*Math.sin(point.height*.03)));
      out=out.map((n,k)=>between(n,[176,128,116][k],vein*.7));
    }
    return out;
  }
  if(point.zone==='canyon'){
    const layers=[[107,53,39],[153,81,52],[163,98,64],[134,67,46],[184,123,76],[147,89,63]];
    const edge=Math.floor((point.height+7*Math.sin(x*.008)+5*Math.cos(z*.011))/46);
    const base=layers[(edge%layers.length+layers.length)%layers.length];
    return base.map(n=>n+4*Math.sin(x*.045+z*.038));
  }
  return surfaceColor(point,source[0]+(x-target[0])/2,source[1]+(z-target[1])/2);
}
export const region = {minX:-40960,maxX:2048,minZ:-23552,maxZ:2048};
export const inRegion = (x,z) => x>=region.minX&&x<=region.maxX&&z>=region.minZ&&z<=region.maxZ;

const trunk = [[-9020,-4560],[-9500,-5450],[-10300,-5660],[-11350,-5560],
  [-12950,-5600],[-14600,-6040],[-15850,-6190],[-17400,-5890],[-18550,-5700],
  [-19350,-4800],[-19500,-4250],[-20600,-3700],[-21750,-2800]];
const canyonCrossing = [[-17900,-5380],[-17780,-4860],[-17740,-4430],[-18120,-3980],[-18400,-3640]];
const ridgeDrive = [[-15200,-6750],[-15700,-7460],[-15950,-8520],[-15300,-9220],[-15850,-10030],
  [-16600,-10500],[-17400,-10250],[-18500,-10000],[-18800,-11000]];
const eastern = [[-11140,-6530],[-10700,-7720],[-10400,-9350],[-10500,-10150],
  [-9370,-10320],[-8500,-10650],[-7450,-10700],[-6600,-10400],[-5780,-10170],
  [-5500,-9470]];
const northCoast = [[-5270,-10200],[-4860,-10700],[-4370,-11350]];
const pacific = [[-21500,-4400],[-21900,-6100],[-22150,-7750],[-22400,-9250],[-22200,-10800]];
const northern = [[-18050,-11300],[-15950,-11700],[-14300,-11350],[-12800,-10300],[-11000,-10100]];

function between(a,b,t){return a+(b-a)*t;}
function profilePoints(waypoints){
  const curved=waypoints.map((point,i)=>{
    if(i===0||i===waypoints.length-1)return [point];
    const before=waypoints[i-1],after=waypoints[i+1];
    const start=point.map((n,j)=>between(n,before[j],.18));
    const end=point.map((n,j)=>between(n,after[j],.18));
    return Array.from({length:9},(_,j)=>{
      const t=j/8,u=1-t;
      return start.map((n,k)=>n*u*u+2*point[k]*u*t+end[k]*t*t);
    });
  }).flat();
  const result=[curved[0]];
  for(let i=1;i<curved.length;i++){
    const a=curved[i-1],b=curved[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/12);
    for(let j=1;j<=steps;j++)result.push([between(a[0],b[0],j/steps),between(a[1],b[1],j/steps)]);
  }
  return result;
}
function closest(points,[x,z]){
  return points.reduce((best,p)=>Math.hypot(p.x-x,p.z-z)<Math.hypot(best.x-x,best.z-z)?p:best);
}

function route(id,waypoints,limit,width,{origin,destination,span,pins=[]}={}){
  const points=profilePoints(waypoints).map(([x,z],i,array)=>{
    const previous=array[i-1];
    return {x,z,d:previous?Math.hypot(x-previous[0],z-previous[1]):0};
  });
  let length=0;
  for(const p of points){length+=p.d;p.s=length;}
  const raw=points.map(p=>{
    const q=id==='local'?terrain(p.x,p.z):baseTerrain(p.x,p.z);
    return (q.water??q.height)+.2;
  });
  for(let i=0;i<points.length;i++){
    const p=points[i],t=p.s/length;
    if(span) {
      p.y=span(raw,t,p);
    } else {
      const from=Math.max(0,i-12),to=Math.min(points.length-1,i+12);
      let total=0;
      for(let j=from;j<=to;j++)total+=raw[j];
      p.y=total/(to-from+1);
    }
  }
  // The lower and upper envelopes both obey the grade limit. Their mean
  // balances the amount of fill and cut around sharp elevation changes.
  const lower=points.map(p=>p.y),upper=lower.slice();
  for(let i=1;i<points.length;i++){
    const delta=points[i].d*limit;
    lower[i]=Math.max(lower[i],lower[i-1]-delta);
    upper[i]=Math.min(upper[i],upper[i-1]+delta);
  }
  for(let i=points.length-2;i>=0;i--){
    const delta=points[i+1].d*limit;
    lower[i]=Math.max(lower[i],lower[i+1]-delta);
    upper[i]=Math.min(upper[i],upper[i+1]+delta);
  }
  const anchors=pins.map(([x,z,y])=>({s:closest(points,expand([x,z])).s,y}));
  if(origin!==undefined)anchors.push({s:0,y:origin});
  if(destination!==undefined)anchors.push({s:length,y:destination});
  anchors.sort((a,b)=>a.s-b.s);
  for(let i=1;i<anchors.length;i++){
    const a=anchors[i-1],b=anchors[i];
    if(Math.abs(a.y-b.y)>(b.s-a.s)*limit)
      throw new Error(id+' anchors exceed grade limit');
  }
  for(let i=0;i<points.length;i++){
    const p=points[i];
    p.y=between(upper[i],lower[i],.32);
    let min=-Infinity,max=Infinity;
    for(const anchor of anchors){
      const rise=Math.abs(p.s-anchor.s)*limit;
      min=Math.max(min,anchor.y-rise);
      max=Math.min(max,anchor.y+rise);
    }
    p.y=Math.max(min,Math.min(max,p.y));
  }
  return {id,points,width,limit,length};
}
const cityPlans={
  Westport:{
    x:[-1260,-1050,-835,-635,-465,-295,-130,0,115,240,380,545,745],
    z:[-710,-565,-430,-292,-145,0,125,260,410,565,730],
    bend:.23,open:[[-1050,-835,-145,125]],
    avenues:[0,-635],cross:[0,410],
    diagonal:[[-635,-430],[-295,-292],[0,0],[380,260]],
  },
  Solara:{
    x:[-735,-540,-345,-174,0,184,365,555,740],
    z:[-1050,-790,-535,-275,0,250,505,760,1010],
    open:[[-174,0,-275,0]],avenues:[0],cross:[0,505],
  },
  'Delta Haven':{
    x:[-465,-350,-248,-154,-65,0,75,156,241,340,455],
    z:[-535,-425,-324,-225,-115,0,99,202,314,428,548],
    bend:.56,open:[[-154,-65,0,99]],avenues:[0],cross:[-225,202],
  },
  Lakefront:{
    x:[-690,-535,-384,-230,-104,0,132,268,415,575,735],
    z:[-545,-403,-270,-141,0,135,278,430,585],
    bend:.27,
    open:[[415,735,-141,278]],avenues:[268,-230],cross:[0,-403],
  },
  'Union Capital':{
    x:[-650,-510,-360,-205,-45,115,275,435,590,750],
    z:[-615,-445,-276,-120,126,268,429,582],
    open:[[-510,590,-120,126]],avenues:[-510,590],cross:[-120,126],
    diagonal:[[-650,-276],[-360,-445],[115,-615]],
  },
  Harborline:{
    x:[-505,-395,-286,-176,-69,45,156,265,375,475],
    z:[-1040,-863,-690,-511,-330,-155,25,203,381,565,755,955],
    open:[[-176,156,-863,-330]],avenues:[-286,265],cross:[25,565],
    diagonal:[[-395,955],[-286,755],[-176,565],[-69,203],[45,25]],
  },
};

const growth={
  Westport:[-1620,1430,-1450,1460], Baycrest:[-1550,1460,-1580,1440],
  Solara:[-1500,1580,-1590,1510], 'Delta Haven':[-1260,1760,-1420,1560],
  Lakefront:[-1560,1470,-1450,1600], 'Iron Junction':[-1430,1550,-1520,1480],
  'Union Capital':[-1490,1530,-1500,1480], Harborline:[-1730,1180,-1540,1540],
};
function extendStreets(lines,left,right,phase){
  const before=[],after=[];
  for(let u=lines[0],i=phase;u-left>145;){u-=Math.min(u-left,166+(i++%4)*19);before.unshift(u);}
  for(let u=lines.at(-1),i=phase+2;right-u>145;){u+=Math.min(right-u,166+(i++%4)*19);after.push(u);}
  return [...before,...lines,...after];
}

function uniformPlan(step,radius){
  const lines=Array.from({length:radius*2+1},(_,i)=>(i-radius)*step);
  return {x:lines,z:lines,open:[],avenues:[0],cross:[0]};
}
function insideOpen(plan,x,z){
  return plan.open.some(([left,right,top,bottom])=>x>left&&x<right&&z>top&&z<bottom);
}
function buildCityRoads(list,name,parent,ref,offset,angle,step,radius){
  const p=closest(parent.points,expand(ref)),x=p.x+offset[0],z=p.z+offset[1];
  const core=cityPlans[name]??uniformPlan(step,radius);
  const [left,right,top,bottom]=growth[name];
  const plan={...core,x:extendStreets(core.x,left,right,0),z:extendStreets(core.z,top,bottom,2)};
  const coreX=Math.max(...core.x.map(Math.abs)),coreZ=Math.max(...core.z.map(Math.abs));
  const c=Math.cos(angle),s=Math.sin(angle);
  const at=(u,v)=>{
    const bend=plan.bend??0;
    const fringe=Math.min(1,Math.max(0,(Math.abs(u)-coreX)/420,(Math.abs(v)-coreZ)/420));
    const curvedU=u+bend*(v*v/1300-53*Math.sin(v/165))+fringe*84*Math.sin(v/390+u/700);
    const curvedV=v+fringe*105*Math.sin(u/425-v/930);
    return [x+curvedU*c-curvedV*s,z+curvedU*s+curvedV*c];
  };
  const {x:columns,z:rows}=plan,nx=columns.length,nz=rows.length;
  const key=(i,j)=>j*nx+i;
  const points=rows.flatMap(v=>columns.map(u=>at(u,v)));
  const edges=[],neighbors=new Map();
  const allowed=(a,b,river=true)=>{
    for(const t of [0,.25,.5,.75,1]){
      const q=terrain(between(a[0],b[0],t),between(a[1],b[1],t));
      if(q.zone==='sea'||q.zone==='lake'||q.zone==='river'&&!river)return false;
    }
    return true;
  };
  const connect=(a,b,horizontal,line,index)=>{
    const ax=columns[a%nx],az=rows[Math.floor(a/nx)],bx=columns[b%nx],bz=rows[Math.floor(b/nx)];
    const avenue=(horizontal?plan.cross:plan.avenues).includes(horizontal?az:ax);
    const crossesRiver=name!=='Delta Haven'&&(name!=='Lakefront'||avenue);
    if(insideOpen(plan,(ax+bx)/2,(az+bz)/2)||!allowed(points[a],points[b],crossesRiver))return;
    for(const [from,to] of [[a,b],[b,a]]){
      if(!neighbors.has(from))neighbors.set(from,[]);
      neighbors.get(from).push(to);
    }
    edges.push({a,b,horizontal,line,index});
  };
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    if(i+1<nx)connect(key(i,j),key(i+1,j),true,j,i);
    if(j+1<nz)connect(key(i,j),key(i,j+1),false,i,j);
  }
  // Use the nearest dry junction with an actual road, then keep its connected grid.
  const candidates=[...neighbors.keys()].filter(i=>core.x.includes(columns[i%nx])&&
    core.z.includes(rows[Math.floor(i/nx)])&&terrain(...points[i]).water===undefined);
  if(!candidates.length)return null;
  const gate=candidates.reduce((a,b)=>Math.hypot(points[a][0]-p.x,points[a][1]-p.z)<Math.hypot(points[b][0]-p.x,points[b][1]-p.z)?a:b);
  const distance=Math.hypot(points[gate][0]-p.x,points[gate][1]-p.z);
  if(distance<.1)return null;
  const datum=name==='Lakefront'?117:name==='Harborline'?14:baseTerrain(x,z).height+.2;
  const climb=Math.min(36,distance*.045);
  const minY=name==='Lakefront'?103:name==='Delta Haven'?3:-Infinity;
  const gradeY=Math.min(p.y+climb,Math.max(p.y-climb,minY,datum));
  const connector=route('local',[[p.x,p.z],points[gate]],.055,9,{origin:p.y,destination:gradeY});
  connector.access=true;
  connector.district=name;
  list.push(connector);
  const reached=new Set([gate]),queue=[gate];
  for(let i=0;i<queue.length;i++)for(const node of neighbors.get(queue[i])){
    if(reached.has(node))continue;
    reached.add(node);
    queue.push(node);
  }
  const height=connector.points.at(-1).y;
  let loop=null;
  if(name==='Lakefront'){
    const linked=(a,b)=>neighbors.get(a)?.includes(b)&&reached.has(a)&&reached.has(b);
    let area=0;
    for(let l=0;l<nx-3;l++)for(let r=l+3;r<nx;r++)for(let t=0;t<nz-3;t++)for(let b=t+3;b<nz;b++){
      if(columns[l]>=0||columns[r]<=0||rows[t]>=0||rows[b]<=0)continue;
      const size=(columns[r]-columns[l])*(rows[b]-rows[t]);
      if(size<=area)continue;
      const ring=[key(l,t)];
      for(let i=l+1;i<=r;i++)ring.push(key(i,t));
      for(let j=t+1;j<=b;j++)ring.push(key(r,j));
      for(let i=r-1;i>=l;i--)ring.push(key(i,b));
      for(let j=b-1;j>=t;j--)ring.push(key(l,j));
      if(!ring.slice(1).every((q,i)=>linked(ring[i],q)))continue;
      area=size;loop=ring.map(i=>({x:points[i][0],z:points[i][1],y:height}));
    }
  }
  const flat={origin:height,destination:height,span:()=>height};
  const byLine=new Map();
  for(const edge of edges){
    if(!reached.has(edge.a)||!reached.has(edge.b))continue;
    const label=(edge.horizontal?'h':'v')+edge.line;
    if(!byLine.has(label))byLine.set(label,[]);
    byLine.get(label).push(edge);
  }
  for(const items of byLine.values()){
    const first=items[0];
    const value=first.horizontal?rows[first.line]:columns[first.line];
    const avenue=(first.horizontal?plan.cross:plan.avenues).includes(value);
    const width=avenue?(name==='Solara'&&!first.horizontal?30:17):name==='Delta Haven'?6.5:9;
    const append=path=>{
      const street=route('local',path,.04,width,flat);
      street.district=name;
      list.push(street);
    };
    let batch=[points[first.a]],last=first.index-1;
    for(const edge of items){
      if(edge.index!==last+1){
        append(batch);
        batch=[points[edge.a]];
      }
      batch.push(points[edge.b]);
      last=edge.index;
    }
    append(batch);
  }
  if(plan.diagonal){
    const path=plan.diagonal.map(([u,v])=>key(columns.indexOf(u),rows.indexOf(v)));
    if(path.every(node=>reached.has(node))&&path.slice(1).every((node,i)=>allowed(points[path[i]],points[node]))){
      const diagonal=route('local',path.map(node=>points[node]),.04,13,flat);
      diagonal.district=name;
      list.push(diagonal);
    }
  }
  const blocks=[];
  for(let j=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){
    if(![key(i,j),key(i+1,j),key(i,j+1),key(i+1,j+1)].some(node=>reached.has(node)))continue;
    const left=columns[i],right=columns[i+1],top=rows[j],bottom=rows[j+1];
    const u=(left+right)/2,v=(top+bottom)/2;
    if(!insideOpen(plan,u,v))blocks.push({row:j,col:i,x:u,z:v,w:right-left,d:bottom-top,
      fringe:left<core.x[0]||right>core.x.at(-1)||top<core.z[0]||bottom>core.z.at(-1)});
  }
  const halfX=Math.max(...columns.map(Math.abs)),halfZ=Math.max(...rows.map(Math.abs));
  const outskirts=[];
  const outerJunctions=[];
  const neighborhoodJunctions=[];
  {
    const scale=name==='Westport'?1.42:name==='Harborline'?1.22:1;
    for(const [axis,sign,offset] of [[0,1,.36],[1,1,-.39],[0,-1,-.31],[1,-1,.35]]){
      const border=axis===0?(sign<0?0:nx-1):(sign<0?0:nz-1);
      const cross=axis===0?rows:columns;
      const extent=axis===0?halfZ:halfX;
      const options=[...reached].filter(i=>axis===0?i%nx===border:Math.floor(i/nx)===border);
      options.sort((a,b)=>Math.abs(cross[axis===0?Math.floor(a/nx):a%nx]-offset*extent)
        -Math.abs(cross[axis===0?Math.floor(b/nx):b%nx]-offset*extent));
      for(const edge of options.slice(0,4)){
        const u=columns[edge%nx],v=rows[Math.floor(edge/nx)];
        const path=[points[edge]];
        for(const [distance,bend] of [[180,26],[405,135],[650,110],[875,-80],[1110,-138]]){
          const p=axis===0?at(u+sign*distance*scale,v+bend*sign):at(u+bend*sign,v+sign*distance*scale);
          if(!allowed(path.at(-1),p,false))break;
          path.push(p);
        }
        if(path.length<3)continue;
        const street=route('local',path,.068,8,{origin:height});
        street.district=name;
        street.outer=true;
        list.push(street);
        outskirts.push(street);
        const neighborhood=street.points.find(q=>q.s>245*scale);
        if(neighborhood)neighborhoodJunctions.push(neighborhood);
        const junction=street.points.find(q=>q.s>street.length*.52);
        if(junction)outerJunctions.push(junction);
        const end=axis===0?at(u+sign*555*scale,v-sign*330):at(u-sign*330,v+sign*555*scale);
        if(junction&&allowed([junction.x,junction.z],end,false)){
          const branch=route('local',[[junction.x,junction.z],end],.078,7,{origin:junction.y});
          branch.district=name;
          branch.outer=true;
          list.push(branch);
          outskirts.push(branch);
        }
        break;
      }
    }
  }
  outerJunctions.sort((a,b)=>Math.atan2(a.z-z,a.x-x)-Math.atan2(b.z-z,b.x-x));
  if(outerJunctions.length>=3)for(let i=0;i<outerJunctions.length;i++){
    const a=outerJunctions[i],b=outerJunctions[(i+1)%outerJunctions.length];
    const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    if(length<540||length>2600||Math.abs(a.y-b.y)>length*.062)continue;
    const mx=(a.x+b.x)/2,mz=(a.z+b.z)/2,rx=mx-x,rz=mz-z;
    const radius=Math.hypot(rx,rz);
    if(radius<420)continue;
    const mid=[mx+rx/radius*340,mz+rz/radius*340];
    const path=[[a.x,a.z],mid,[b.x,b.z]];
    if(!allowed(path[0],mid,false)||!allowed(mid,path[2],false))continue;
    const street=route('local',path,.069,8,{origin:a.y,destination:b.y});
    street.district=name;
    street.outer=true;
    list.push(street);
    outskirts.push(street);
  }
  neighborhoodJunctions.sort((a,b)=>Math.atan2(a.z-z,a.x-x)-Math.atan2(b.z-z,b.x-x));
  if(neighborhoodJunctions.length>=3)for(let i=0;i<neighborhoodJunctions.length;i++){
    const a=neighborhoodJunctions[i],b=neighborhoodJunctions[(i+1)%neighborhoodJunctions.length];
    const ar=Math.atan2(a.z-z,a.x-x),br=Math.atan2(b.z-z,b.x-x);
    const turn=(br-ar+Math.PI*2)%(Math.PI*2);
    if(turn>2.2)continue;
    const heading=ar+turn/2;
    const ux=Math.cos(heading-angle),vz=Math.sin(heading-angle);
    const rim=1/Math.max(Math.abs(ux)/(halfX+110),Math.abs(vz)/(halfZ+110));
    const mid=[x+Math.cos(heading)*rim,z+Math.sin(heading)*rim];
    const start=[a.x,a.z],end=[b.x,b.z];
    const length=Math.hypot(a.x-mid[0],a.z-mid[1])+Math.hypot(b.x-mid[0],b.z-mid[1]);
    if(Math.abs(a.y-b.y)>length*.06||!allowed(start,mid,false)||!allowed(mid,end,false))continue;
    const street=route('local',[start,mid,end],.065,10,{origin:a.y,destination:b.y});
    street.district=name;
    street.outer=true;
    street.neighborhood=true;
    list.push(street);
    outskirts.push(street);
  }
  return {name,x,z,height,extent:Math.max(halfX,halfZ),halfX,halfZ,coreX,coreZ,angle,step,radius,blocks,plan,at,outskirts,loop};
}

const gridSize=256;
export function createRoads(start){
  const main=route('western',trunk.map(expand),.053,15,{pins:[
    [-11280,-5560,14],[-19470,-4270,151],[-21700,-2820,52],
  ]});
  function branch(id,list,parent,junction,grade,width,options={}){
    const p=closest(parent.points,expand(junction));
    return route(id,[[p.x,p.z],...list.map(expand)],grade,width,{origin:p.y,...options});
  }
  const canyonStart=closest(main.points,expand([-17900,-5800]));
  const end=expand(canyonCrossing.at(-1));
  const endY=Math.max(55,terrain(...end).height)+.2;
  const canyon=branch('canyon',canyonCrossing,main,[-17900,-5800],.052,12,{
    destination:Math.max(endY,canyonStart.y-175),
    span:(_raw,t)=>between(canyonStart.y,Math.max(endY,canyonStart.y-175),t),
  });
  const ridge=branch('ridge',ridgeDrive,main,[-15100,-6080],.075,10);
  const east=branch('east',eastern,main,[-11350,-5560],.051,13,{pins:[[-10450,-10150,140]]});
  const coast=branch('coast',northCoast,east,[-5790,-10170],.047,11);
  const pacificRoad=branch('pacific',pacific,main,[-21100,-3600],.058,13,{pins:[[-22100,-7750,200]]});
  const northStart=closest(ridge.points,expand([-18650,-10400]));
  const northEnd=closest(east.points,expand([-10500,-10150]));
  const north=route('north',[[northStart.x,northStart.z],...northern.map(expand),[northEnd.x,northEnd.z]],.064,13,{origin:northStart.y,destination:northEnd.y});
  const junction=closest(north.points,[-25285,-19731]);
  const index=north.points.indexOf(junction),before=north.points[index-3],after=north.points[index+3];
  const angle=Math.atan2(after.z-before.z,after.x-before.x),c=Math.cos(angle),s=Math.sin(angle);
  const place=(u,v,rise)=>({x:junction.x+u*c-v*s,z:junction.z+u*s+v*c,y:junction.y+rise,angle});
  const parking={...place(0,48,2.5),w:56,d:33};
  const overlook={...place(0,91,3.5),w:64,d:24};
  const mountain={...place(0,166,9),angle:angle+Math.PI};
  const driveway=[junction,place(7,15,.35),place(4,31,1.7),parking];
  const approach=route('rushmore-access',driveway.map(p=>[p.x,p.z]),.085,7,{
    origin:junction.y,destination:parking.y,
    span:(_raw,t)=>between(junction.y,parking.y,t),
  });
  const rushmore={parking,overlook,mountain,junction,approach};
  const join=main.points[0];
  const bridge=route('bridge',[[start.x,start.z],[join.x,join.z]],.055,16,{
    origin:start.y,destination:join.y,
    span:(_raw,t)=>between(start.y,join.y,t)+28*Math.sin(Math.PI*t)**2,
  });
  const list=[bridge,main,canyon,ridge,east,coast,pacificRoad,north,approach];
  const districts=[];
  const grids=[
    ['Westport',main,[-21700,-2820], [220,-510], .21, 135, 2],
    ['Baycrest',pacificRoad,[-22100,-7750], [540,0], -.24, 124, 2],
    ['Solara',main,[-19470,-4270], [130,760], 0, 160, 3],
    ['Delta Haven',main,[-11280,-5560], [645,-490], .28, 110, 2],
    ['Lakefront',east,[-10450,-10150], [25,-460], .03, 128, 3],
    ['Iron Junction',east,[-7500,-10700], [-580,-160], .27, 105, 2],
    ['Union Capital',east,[-5570,-9600], [-1410,-60], .10, 130, 2],
    ['Harborline',coast,[-4420,-11280], [-695,-170], -.18, 115, 3],
  ];
  for(const [name,parent,ref,offset,angle,step,radius] of grids){
    const city=buildCityRoads(list,name,parent,ref,offset,angle,step,radius);
    if(city)districts.push(city);
  }
  const observatorySite={x:-34610,y:109,z:-4770,angle:.16,w:112,d:86};
  const westportRoads=list.filter(road=>road.district==='Westport');
  const observatoryJunction=closest(westportRoads.flatMap(road=>road.points),[-34662,-4183]);
  const observatoryEntry=observatorySite.y-.06;
  const observatoryApproach=route('observatory-access',[
    [observatoryJunction.x,observatoryJunction.z],[-34666,-4250],[-34631,-4350],
    [-34559,-4440],[-34541,-4540],[-34562,-4620],[-34600,-4690],[-34614,-4740],
  ],.075,8,{
    origin:observatoryJunction.y,destination:observatoryEntry,
    span:(_raw,t)=>between(observatoryJunction.y,observatoryEntry,t),
  });
  observatoryApproach.access=true;
  list.push(observatoryApproach);
  const observatory={site:observatorySite,approach:observatoryApproach,junction:observatoryJunction};
  const gateStart=closest(list.filter(road=>road.district==='Baycrest').flatMap(road=>[road.points[0],road.points.at(-1)]),goldenGate.start);
  if(Math.hypot(gateStart.x-goldenGate.start[0],gateStart.z-goldenGate.start[1])>6)
    throw new Error('Golden Gate approach lost its Baycrest street');
  const gateDeck=goldenGate.deck,gateFrom=gateStart.y;
  const gateRoad=route('golden-gate',[[gateStart.x,gateStart.z],gatePoint(goldenGate.end)],.05,16,{
    origin:gateFrom,destination:gateDeck,
    span:(_raw,t,p)=>{
      const s=t*goldenGate.end;
      const crown=s>goldenGate.anchorSouth&&s<goldenGate.anchorNorth
        ?2.4*Math.sin(Math.PI*(s-goldenGate.anchorSouth)/(goldenGate.anchorNorth-goldenGate.anchorSouth)):0;
      return between(gateFrom,gateDeck,smooth(0,240,s))+crown;
    },
  });
  gateRoad.access=true;
  gateRoad.suspension=[goldenGate.towerSouth-150,goldenGate.towerNorth+150];
  list.push(gateRoad);
  const [vx,vz]=gatePoint(goldenGate.end+44);
  const gate={...goldenGate,road:gateRoad,
    vista:{x:vx,z:vz,y:gateDeck+.05,angle:Math.atan2(goldenGate.dir[1],goldenGate.dir[0]),w:88,d:74}};
  const riverApproaches=new Map();
  for(const road of list){
    const key=road.district??road.id;
    for(const p of road.points){
      const water=terrain(p.x,p.z);
      if(water.water===undefined||water.zone==='sea'||p.y>=water.water+3.5)continue;
      if(!riverApproaches.has(key))riverApproaches.set(key,[]);
      riverApproaches.get(key).push({x:p.x,z:p.z,y:water.water+3.5});
    }
  }
  // A shared elevation profile keeps streets at the same height where they meet
  // on the bridge approaches. Existing dry routes and elevated decks stay higher.
  function clearRiver(road){
    const approaches=riverApproaches.get(road.district??road.id);
    if(!approaches)return;
    for(const p of road.points)for(const a of approaches)
      p.y=Math.max(p.y,a.y-Math.hypot(p.x-a.x,p.z-a.z)*.04);
  }
  for(const road of list)clearRiver(road);
  const grid=new Map();
  function indexRoad(road){
    const p=road.points;
    for(let i=1;i<p.length;i++){
      const a=p[i-1],b=p[i],pad=420;
      const q={a,b,road,dx:b.x-a.x,dz:b.z-a.z};
      for(let x=Math.floor((Math.min(a.x,b.x)-pad)/gridSize);x<=Math.floor((Math.max(a.x,b.x)+pad)/gridSize);x++)
        for(let z=Math.floor((Math.min(a.z,b.z)-pad)/gridSize);z<=Math.floor((Math.max(a.z,b.z)+pad)/gridSize);z++){
          const key=x*100003+z;
          if(!grid.has(key))grid.set(key,[]);
          grid.get(key).push(q);
        }
    }
  }
  for(const road of list)indexRoad(road);
  function addBlockStreet(city,points,purpose){
    const height=city.height,profile={origin:height,destination:height,span:()=>height};
    const street=route('local',points,.04,6.5,profile);
    street.district=city.name;
    street.blockStreet=true;
    street.purpose=purpose;
    clearRiver(street);
    list.push(street);indexRoad(street);
  }
  function finishCityStreets(){
    for(const road of list){
      const junctions=[];
      for(let i=1;i<road.points.length;i++){
        const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dz=b.z-a.z;
        const bucket=grid.get(Math.floor(a.x/gridSize)*100003+Math.floor(a.z/gridSize))??[];
        for(const q of bucket){
          if(q.road===road)continue;
          if(Math.max(a.x,b.x)<Math.min(q.a.x,q.b.x)-.05||Math.min(a.x,b.x)>Math.max(q.a.x,q.b.x)+.05||
             Math.max(a.z,b.z)<Math.min(q.a.z,q.b.z)-.05||Math.min(a.z,b.z)>Math.max(q.a.z,q.b.z)+.05)continue;
          const cross=dx*q.dz-dz*q.dx,sine=Math.abs(cross)/(b.d*q.b.d);
          if(!(sine>.28))continue;
          const x=q.a.x-a.x,z=q.a.z-a.z;
          const u=(x*q.dz-z*q.dx)/cross,v=(x*dz-z*dx)/cross;
          if(u<-.004||u>1.004||v<-.004||v>1.004||
             Math.abs(between(a.y,b.y,u)-between(q.a.y,q.b.y,v))>1.05)continue;
          const s=between(a.s,b.s,Math.max(0,Math.min(1,u)));
          const half=q.road.width/2/sine+.7;
          junctions.push([Math.max(0,s-half),Math.min(road.length,s+half)]);
        }
      }
      const merged=[];
      for(const interval of junctions.sort((a,b)=>a[0]-b[0])){
        const last=merged.at(-1);
        if(last&&interval[0]<=last[1]+.5)last[1]=Math.max(last[1],interval[1]);
        else merged.push(interval);
      }
      road.junctions=merged;
      if(!road.district)continue;
      road.streetRuns=[];
      let start=0;
      for(const [lo,hi] of merged){
        if(lo-start>2)road.streetRuns.push({start,end:lo,crossStart:start>0,crossEnd:true});
        start=hi;
      }
      if(road.length-start>2)road.streetRuns.push({start,end:road.length,crossStart:start>0,crossEnd:false});
    }
  }
  function nearest(x,z,radius=140,paved=false,heightLimit=null,extraWidth=0,fromY=null){
    const bucket=grid.get(Math.floor(x/gridSize)*100003+Math.floor(z/gridSize));
    if(!bucket)return null;
    let best=radius*radius,result=null,onCurrentDeck=false;
    for(const {a,b,dx,dz,road} of bucket){
      const projection=((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz);
      if(projection < -1e-7 || projection > 1+1e-7)continue;
      const t=Math.min(1,Math.max(0,projection));
      const distance=(x-a.x-t*dx)**2+(z-a.z-t*dz)**2;
      if(paved&&distance>(road.width*.5+.08+extraWidth)**2)continue;
      const y=between(a.y,b.y,t);
      if(heightLimit!==null){
        if(distance>radius*radius||y>heightLimit)continue;
        const current=fromY!==null&&Math.abs(y-fromY)<=.35;
        if(result&&(onCurrentDeck&&!current||onCurrentDeck===current&&
          (y<result.y-.08||Math.abs(y-result.y)<=.08&&distance>best)))continue;
        onCurrentDeck=current;
      }else if(distance>best)continue;
      best=distance;
      result={road,y,distance:Math.sqrt(distance),s:between(a.s,b.s,t)};
    }
    return result;
  }
  function segmentsNear(x,z,radius){
    const nearby=new Set(),radiusSq=radius*radius;
    for(let i=Math.floor((x-radius)/gridSize);i<=Math.floor((x+radius)/gridSize);i++)
      for(let j=Math.floor((z-radius)/gridSize);j<=Math.floor((z+radius)/gridSize);j++)
        for(const segment of grid.get(i*100003+j)??[]){
          if(nearby.has(segment))continue;
          const {a,dx,dz}=segment;
          const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
          if((x-a.x-t*dx)**2+(z-a.z-t*dz)**2<radiusSq)nearby.add(segment);
        }
    return [...nearby].map(({a,b,road})=>[a.x,a.z,b.x,b.z,road.width]);
  }
  return {list,nearest,districts,segmentsNear,addBlockStreet,finishCityStreets,rushmore,observatory,gate};
}
