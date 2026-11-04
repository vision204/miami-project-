class Heap{constructor(){this.a=[];}push(v){let i=this.a.length;this.a.push(v);while(i){const p=(i-1)>>1;if(this.a[p][0]<=v[0])break;this.a[i]=this.a[p];i=p;}this.a[i]=v;}pop(){const out=this.a[0],last=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let c=i*2+1;if(c+1<this.a.length&&this.a[c+1][0]<this.a[c][0])c++;if(this.a[c][0]>=last[0])break;this.a[i]=this.a[c];i=c;}this.a[i]=last;}return out;}}
const distance=(a,b)=>Math.hypot(a.p[0]-b.p[0],a.p[1]-b.p[1]);
export function nearestJobNode(nodes,x,z,valid=()=>true){let best=null,d=Infinity;for(const n of nodes){const v=Math.hypot(n.p[0]-x,n.p[1]-z);if(v<d&&n.edges.length&&valid(n)){d=v;best=n;}}return best;}
export function jobPath(start,end,minWidth=5){const heap=new Heap(),dist=new Map([[start,0]]),prev=new Map();heap.push([distance(start,end),start]);const visited=new Set();
 while(heap.a.length){const [,n]=heap.pop();if(visited.has(n))continue;visited.add(n);if(n===end){const path=[n];while(prev.has(path[0]))path.unshift(prev.get(path[0]));return path;}
  for(const e of n.edges){const q=e.na===n?e.nb:e.na;if(!q||e.w<minWidth)continue;const cost=dist.get(n)+e.len;if(cost>=(dist.get(q)??Infinity))continue;dist.set(q,cost);prev.set(q,n);heap.push([cost+distance(q,end),q]);}}
 throw Error('연결된 도로 경로를 찾지 못했습니다.');
}
export function pathLength(path){let d=0;for(let i=1;i<path.length;i++)d+=distance(path[i-1],path[i]);return d;}
export function routeGoals(path,type){
 // 배달·택시 : 경유지 없이 목적지 한 곳. 길은 경로선만 보고 직접 찾아가며, 도착해서 정차 후 F 로 바로 정산한다.
 if(type==='delivery'||type==='taxi'){const n=path[path.length-1];
  return [{x:n.p[0],y:n.y,z:n.p[1],label:type==='taxi'?'손님 목적지 — 정차 후 F':'배송지 — 정차 후 F',radius:Math.max(14,Math.min(26,...n.edges.map(e=>e.w))),stop:true,dropoff:type==='taxi'}];}
 const total=pathLength(path),goals=[];let traveled=0,last=0,nextStop=type==='taxi'?total/5:total/3,stop=0;
 const point=(n,label,extra={})=>({x:n.p[0],y:n.y,z:n.p[1],label,radius:Math.max(12,Math.min(24,...n.edges.map(e=>e.w))),...extra});
 goals.push(point(path[0],type==='taxi'?'승객 1 탑승':type==='race'?'출발선 — 정차 후 F':'화물 수령 — 정차 후 F',{stop:true,raceStart:type==='race',pickup:type==='taxi'}));
 for(let i=1;i<path.length;i++){
  traveled+=distance(path[i-1],path[i]);const end=i===path.length-1;
  const service=type!=='race'&&(traveled>=nextStop||end);
  const a=path[i-1],b=path[i],c=path[i+1];const turn=c&&((b.p[0]-a.p[0])*(c.p[0]-b.p[0])+(b.p[1]-a.p[1])*(c.p[1]-b.p[1]))/Math.max(.01,distance(a,b)*distance(b,c))<.88;
  if(service){stop++;const pickup=type==='taxi'&&stop%2===0&&!end;goals.push(point(b,type==='taxi'?(pickup?'다음 승객 탑승':'승객 하차'):'배송 '+stop,{stop:true,pickup,dropoff:type==='taxi'&&!pickup}));nextStop+=type==='taxi'?total/5:total/3;last=traveled;}
  else if(end||turn||traveled-last>(type==='race'?220:120)){goals.push(point(b,end?'결승선':type==='race'?'체크포인트':'안내 경유지'));last=traveled;}
 }
 return goals;
}
/* 2026-11-04 (Opus) : 여러 사람이 같은 곳에서 같은 길로 시작하지 않게 — 항공 화물은 출발 공항 · 활주로 · 항로 6가지, 물류는 상하차 베이 4곳.
   고르는 기준은 업무 번호(run id). 브라우저와 서버가 같은 번호로 같은 변형을 고른다(이 파일은 server/economy-job-routes.js 와 똑같다). */
export function jobVariant(id,n,salt=0){let h=2166136261^salt;for(const ch of String(id||''))h=Math.imul(h^ch.charCodeAt(0),16777619);h^=h>>>13;h=Math.imul(h,1540483477);h^=h>>>15;return (h>>>0)%n;}
const AIR_POINT=(x,z,y,label,o={})=>({x,z,y,label,...o});
const AIR_UP=(x,z,y,label)=>AIR_POINT(x,z,y,label,{air:true,radius:140});
const AIR_LAND=(x,z,y,label)=>AIR_POINT(x,z,y,label,{air:true,radius:120});
const AIR_STOP=(x,z,label,radius)=>AIR_POINT(x,z,0,label,radius?{stop:true,radius}:{stop:true});
const AIR_ROUTES=[
 {jit:0,pts:[AIR_STOP(-4180,-1080,'MIA 화물 적재 — 정차 후 F'),AIR_UP(-6400,-1080,320,'서쪽 상승 구간'),AIR_UP(-6500,2600,450,'서부 화물 항로'),AIR_UP(-1000,3500,450,'남부 항로'),AIR_UP(600,-2500,500,'동부 항로'),AIR_UP(-4400,-4500,350,'OPA 접근 준비'),AIR_LAND(-4100,-3980,90,'활주로 정렬 · 감속/하강'),AIR_STOP(-2700,-3980,'OPA 활주로 착륙 · 정차 후 F',80)]},
 {jit:10,pts:[AIR_STOP(-4150,-875,'MIA 09L 화물 적재 — 정차 후 F'),AIR_UP(-1600,-875,300,'동쪽 상승 구간'),AIR_UP(1200,-1800,450,'해안 항로'),AIR_UP(1400,-4600,450,'북동 항로'),AIR_UP(-1500,-5200,420,'북부 항로'),AIR_UP(-5800,-4900,350,'OPA 접근 준비'),AIR_LAND(-4100,-3980,90,'활주로 정렬 · 감속/하강'),AIR_STOP(-2700,-3980,'OPA 활주로 착륙 · 정차 후 F',80)]},
 {jit:10,pts:[AIR_STOP(-4150,-510,'MIA 09C 화물 적재 — 정차 후 F'),AIR_UP(-6300,-510,320,'서쪽 상승 구간'),AIR_UP(-6800,3000,450,'서부 화물 항로'),AIR_UP(-2600,4000,450,'남부 항로'),AIR_UP(-200,1000,480,'도심 상공 항로'),AIR_UP(-5200,-2600,400,'OPA 접근 준비'),AIR_LAND(-4100,-3980,90,'활주로 정렬 · 감속/하강'),AIR_STOP(-2700,-3980,'OPA 활주로 착륙 · 정차 후 F',80)]},
 {jit:10,pts:[AIR_STOP(-4150,-350,'MIA 09R 화물 적재 — 정차 후 F'),AIR_UP(-1500,-350,320,'동쪽 상승 구간'),AIR_UP(800,2400,450,'남동 항로'),AIR_UP(-3500,3800,450,'남부 항로'),AIR_UP(-6800,1200,450,'서부 화물 항로'),AIR_UP(-6200,-3200,350,'OPA 접근 준비'),AIR_LAND(-4100,-3980,90,'활주로 정렬 · 감속/하강'),AIR_STOP(-2700,-3980,'OPA 활주로 착륙 · 정차 후 F',80)]},
 {jit:8,pts:[AIR_STOP(-3950,-3980,'OPA 화물 적재 — 정차 후 F'),AIR_UP(-1400,-3980,300,'동쪽 상승 구간'),AIR_UP(1000,-1600,450,'해안 항로'),AIR_UP(400,2600,450,'남동 항로'),AIR_UP(-4800,3400,450,'남부 항로'),AIR_UP(-6900,600,400,'MIA 접근 준비'),AIR_LAND(-5600,-875,110,'09L 활주로 정렬 · 감속/하강'),AIR_STOP(-3300,-875,'MIA 09L 착륙 · 정차 후 F',80)]},
 {jit:8,pts:[AIR_STOP(-3600,-3980,'OPA 동쪽 화물 적재 — 정차 후 F'),AIR_UP(-1200,-4900,350,'북동 상승 구간'),AIR_UP(1300,-900,480,'해안 항로'),AIR_UP(-1200,3300,450,'남부 항로'),AIR_UP(-6200,2200,420,'서부 화물 항로'),AIR_UP(-6900,-510,300,'MIA 접근 준비'),AIR_LAND(-5600,-510,110,'09C 활주로 정렬 · 감속/하강'),AIR_STOP(-3300,-510,'MIA 09C 착륙 · 정차 후 F',80)]},
];
export const AIR_JOB_ROUTE=AIR_ROUTES[0].pts;   // 예전 이름 (기본 항로)
export const AIR_ROUTE_COUNT=AIR_ROUTES.length;
/** 업무 번호마다 정해지는 항공 화물 항로 — 출발 지점은 활주로 폭 안에서 조금씩 옆으로 비켜 선다 */
export function airJobRoute(id){const R=AIR_ROUTES[jobVariant(id,AIR_ROUTES.length)],off=R.jit?(jobVariant(id,21,7)-10)/10*R.jit:0;return R.pts.map((p,k)=>k===0?{...p,z:p.z+off}:{...p});}
/** 물류창고 상하차 베이 (터미널 로컬 x · 적재 도크 앞 15 m) */
export const FREIGHT_BAYS=Object.freeze([-24,-8,8,24]);
export function freightBay(id,salt){return FREIGHT_BAYS[jobVariant(id,FREIGHT_BAYS.length,salt)];}

// 2026-10-18 : 배달 · 택시는 도로 길이로 거리를 맞춘다 (배달 약 1.25 km ≈ 밴으로 1분 · 택시 약 3.6 km ≈ 택시로 2.5분)
export const JOB_ROUTE_LENGTH=Object.freeze({delivery:1250,taxi:3600});
export function sizedJobPath(nodes,start,angle,target,valid,minWidth=7){let best=null;
 for(let k=0;k<6;k++){const a=angle+k*1.05;for(const f of [.72,.56,.88]){const b=nearestJobNode(nodes,start.p[0]+Math.cos(a)*target*f,start.p[1]+Math.sin(a)*target*f,valid);if(!b||b===start)continue;let p;try{p=jobPath(start,b,minWidth);}catch{continue;}
  const e=Math.abs(pathLength(p)-target)/target;if(!best||e<best.e)best={p,e};if(e<.12)return p;}}
 if(!best&&minWidth>5)return sizedJobPath(nodes,start,angle,target,valid,5);
 if(!best)throw Error('연결된 도로 경로를 찾지 못했습니다.');return best.p;}
