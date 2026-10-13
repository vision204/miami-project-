import fs from 'node:fs';import {parentPort} from 'node:worker_threads';
import {missionPlan} from './economy-missions.js';
const catalog=JSON.parse(fs.readFileSync(new URL('./economy-catalog.json',import.meta.url),'utf8'));
parentPort.on('message',m=>{try{parentPort.postMessage({id:m.id,plan:missionPlan(m.type,m.selection,catalog,m.position,m.seed)});}catch{parentPort.postMessage({id:m.id,error:'업무 경로를 준비하지 못했습니다.'});}});
