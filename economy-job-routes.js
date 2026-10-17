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
export const AIR_JOB_ROUTE=[
 {x:-4180,z:-1080,y:0,label:'MIA 화물 적재 — 정차 후 F',stop:true},
 {x:-6400,z:-1080,y:320,label:'서쪽 상승 구간',air:true,radius:140},
 {x:-6500,z:2600,y:450,label:'서부 화물 항로',air:true,radius:140},
 {x:-1000,z:3500,y:450,label:'남부 항로',air:true,radius:140},
 {x:600,z:-2500,y:500,label:'동부 항로',air:true,radius:140},
 {x:-4400,z:-4500,y:350,label:'OPA 접근 준비',air:true,radius:140},
 {x:-4100,z:-3980,y:90,label:'활주로 정렬 · 감속/하강',air:true,radius:120},
 {x:-2700,z:-3980,y:0,label:'OPA 활주로 착륙 · 정차 후 F',stop:true,radius:80},
];

// 2026-10-18 : 배달 · 택시는 도로 길이로 거리를 맞춘다 (배달 약 1.25 km ≈ 밴으로 1분 · 택시 약 3.6 km ≈ 택시로 2.5분)
export const JOB_ROUTE_LENGTH=Object.freeze({delivery:1250,taxi:3600});
export function sizedJobPath(nodes,start,angle,target,valid,minWidth=7){let best=null;
 for(let k=0;k<6;k++){const a=angle+k*1.05;for(const f of [.72,.56,.88]){const b=nearestJobNode(nodes,start.p[0]+Math.cos(a)*target*f,start.p[1]+Math.sin(a)*target*f,valid);if(!b||b===start)continue;let p;try{p=jobPath(start,b,minWidth);}catch{continue;}
  const e=Math.abs(pathLength(p)-target)/target;if(!best||e<best.e)best={p,e};if(e<.12)return p;}}
 if(!best&&minWidth>5)return sizedJobPath(nodes,start,angle,target,valid,5);
 if(!best)throw Error('연결된 도로 경로를 찾지 못했습니다.');return best.p;}
