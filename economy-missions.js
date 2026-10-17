import {nearestJobNode,jobPath,pathLength,routeGoals,AIR_JOB_ROUTE,JOB_ROUTE_LENGTH,sizedJobPath} from './economy-job-routes.js';
import {EconomyError} from './economy-engine.js';
const graphs=new WeakMap();
function graph(c){if(graphs.has(c))return graphs.get(c);const nodes=c.roads.map(n=>({p:n.p,y:n.y,g:n.g,edges:[]}));c.roads.forEach((n,i)=>{nodes[i].edges=n.edges.filter(e=>nodes[e.to]).map(e=>({na:nodes[i],nb:nodes[e.to],len:e.len,w:e.w}));});graphs.set(c,nodes);return nodes;}
export function missionPlan(type,selection,catalog,position,seed=0){
 if(type==='air'){const goals=AIR_JOB_ROUTE.map(g=>({...g,y:g.stop?3:g.y}));let length=0;goals.forEach((g,i)=>{if(i)length+=Math.hypot(g.x-goals[i-1].x,g.z-goals[i-1].z);});return {goals,length};}
 const nodes=graph(catalog),valid=n=>n.g!==false&&n.edges.some(e=>e.w>=7),at=n=>({x:n.p[0],y:n.y,z:n.p[1]});
 if(type==='freight'){
  const sites=catalog.freight,from=sites.find(s=>s.id===selection.from),to=sites.find(s=>s.id===selection.to&&s!==from);if(!from||!to)throw new EconomyError('invalid-route','물류 출발지와 도착지를 선택해 주세요.');
  const a=nearestJobNode(nodes,...from.entry,valid),b=nearestJobNode(nodes,...to.entry,valid);let path;try{path=jobPath(a,b,7);}catch{path=jobPath(a,b,5);}
  const point=s=>({x:s.x-15*Math.sin(s.rot),y:s.y,z:s.z+15*Math.cos(s.rot)}),pickup=point(from),drop=point(to),line=[{p:[pickup.x,pickup.z],y:pickup.y},...path,{p:[drop.x,drop.z],y:drop.y}];
  return {from:from.id,to:to.id,spawn:pickup,face:{x:from.entry[0],z:from.entry[1]},path:line.map(n=>({p:n.p,y:n.y})),length:pathLength(line),goals:[{...pickup,radius:8,stop:true,pickup:true,label:from.name+' · 화물 적재'},{...drop,radius:8,stop:true,dropoff:true,label:to.name+' · 화물 하역'}]};
 }
 const course=Number.isInteger(selection.course)?Math.max(0,Math.min(2,selection.course)):0,anchors=[[-450,-400],[700,1300],[-5400,-2300]],origin=type==='race'?anchors[course]:[position.x,position.z];
 const a=nearestJobNode(nodes,...origin,valid),angle=type==='race'?[.5,2.2,4.1][course]:(seed%62832)/10000;let path;if(JOB_ROUTE_LENGTH[type])path=sizedJobPath(nodes,a,angle,JOB_ROUTE_LENGTH[type],valid,7);else{const b=nearestJobNode(nodes,a.p[0]+Math.cos(angle)*1800,a.p[1]+Math.sin(angle)*1800,valid);path=jobPath(a,b,7);}
 if(type==='race')path=path.concat(jobPath(b,a,7).slice(1));return {goals:routeGoals(path,type),path:path.map(n=>({p:n.p,y:n.y})),length:pathLength(path),spawn:at(path[0]),face:at(path[1]||path[0])};
}

// Server observations, server clock and server-assigned checkpoints determine rewards.
// This is a movement sanity envelope, not server-authoritative vehicle physics.
export class MissionMonitor {
 constructor(fleet=[]){this.runs=new Map();this.fleet=fleet;}
 start(uid,active){if(this.runs.get(uid)?.id===active.id)return;this.runs.set(uid,{id:active.id,type:active.type,vehicleKind:active.vehicleKind,plan:active.plan,index:0,dwell:0,last:null,startedAt:active.startedAt,raceAt:null,finishedAt:null,invalid:false});}
 observe(uid,s,at=Date.now()){
  const r=this.runs.get(uid);if(!r||r.invalid||r.finishedAt||!Array.isArray(s))return;
  const p={x:s[0],y:s[1],z:s[2]};if(![p.x,p.y,p.z].every(Number.isFinite)||!s[4]||r.vehicleKind&&this.fleet[s[5]]!==r.vehicleKind)return;
  const dt=r.last?Math.min(1,(at-r.last.at)/1000):0,max=r.type==='air'?300:130;
  if(r.last&&Math.hypot(p.x-r.last.x,p.y-r.last.y,p.z-r.last.z)>max*Math.max(.01,(at-r.last.at)/1000)+30){r.invalid=true;return;}
  r.last={...p,at};const g=r.plan.goals[r.index];if(!g)return;
  if(Math.hypot(p.x-g.x,p.z-g.z)>(g.radius||18)+4||Math.abs(p.y-g.y)>(g.air?120:10)){r.dwell=0;return;}
  if(g.stop){if(Math.abs(s[6])>2){r.dwell=0;return;}r.dwell+=dt;if(r.dwell<1.2)return;}
  if(g.raceStart)r.raceAt=at;r.index++;r.dwell=0;if(r.index>=r.plan.goals.length)r.finishedAt=at;
 }
 proof(uid,id){const r=this.runs.get(uid);return r?.id===id?r:null;}
 clear(uid,id){if(this.runs.get(uid)?.id===id)this.runs.delete(uid);}
}
