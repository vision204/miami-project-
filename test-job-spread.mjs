// node server/test-job-spread.mjs — 작업 시작 위치 분산 (2026-11-04 · Opus)
// 항공 화물 · 물류는 업무 번호마다 출발 지점이 갈리고, 브라우저 계획과 서버 계획이 같은 지점을 쓴다.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {missionPlan} from './economy-missions.js';
import {airJobRoute,freightBay,AIR_ROUTE_COUNT} from './economy-job-routes.js';
import * as client from '../assets/cloud/jobs-routes.js';
import {freightPlan} from '../assets/cloud/logistics-routes.js';
assert.equal(fs.readFileSync(new URL('./economy-job-routes.js',import.meta.url),'utf8'),fs.readFileSync(new URL('../assets/cloud/jobs-routes.js',import.meta.url),'utf8'),'server/client routes identical');
const catalog=JSON.parse(fs.readFileSync(new URL('./economy-catalog.json',import.meta.url)));
const ids=Array.from({length:240},(_,i)=>'qa-run-'+i.toString(36)+'-spread');
const starts=new Set(),routes=new Set();
for(const id of ids){const s=missionPlan('air',{run:id},catalog,{x:0,z:0}),c=client.airJobRoute(id);
 assert.equal(s.goals.length,c.length);s.goals.forEach((g,k)=>{assert.equal(g.x,c[k].x);assert.equal(g.z,c[k].z);});
 assert(s.goals[0].stop&&s.goals.at(-1).stop&&s.length>15000&&s.length<30000);starts.add(s.goals[0].x+','+s.goals[0].z);routes.add(s.goals.at(-1).x+','+s.goals.at(-1).z+'|'+s.goals[1].x);}
assert.equal(routes.size,AIR_ROUTE_COUNT);assert(starts.size>=40,'air starts spread '+starts.size);
assert.equal(missionPlan('air',{run:ids[0]},catalog,{x:0,z:0}).goals[0].x,missionPlan('air',{run:ids[0]},catalog,{x:9,z:9}).goals[0].x,'same run → same plan');
const sites=catalog.freight,[A,B]=sites,g={player:{pos:{x:A.x,z:A.z}},streets:{nodes:catalog.roads.map(n=>({p:n.p,y:n.y,g:n.g,edges:[]}))},validGround:n=>n.g!==false,ground:()=>A.y};
g.streets.nodes.forEach((n,i)=>{n.edges=catalog.roads[i].edges.filter(e=>g.streets.nodes[e.to]).map(e=>({na:n,nb:g.streets.nodes[e.to],len:e.len,w:e.w}));});
const bays=new Set();
for(const id of ids.slice(0,24)){const s=missionPlan('freight',{run:id,from:A.id,to:B.id},catalog,{x:0,z:0}),c=freightPlan(g,sites,{run:id,from:A.id,to:B.id});
 for(const k of [0,1]){assert(Math.abs(s.goals[k].x-c.goals[k].x)<1e-6&&Math.abs(s.goals[k].z-c.goals[k].z)<1e-6,'freight goal '+k+' matches');}
 bays.add(s.goals[0].x.toFixed(2)+','+s.goals[0].z.toFixed(2));}
assert.equal(bays.size,4,'four loading bays');
console.log('PASS job spread: '+AIR_ROUTE_COUNT+' air routes · '+starts.size+' distinct air starts · 4 freight bays · client/server identical plans');
