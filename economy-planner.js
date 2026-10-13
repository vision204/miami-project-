import {Worker} from 'node:worker_threads';import {randomUUID} from 'node:crypto';import {EconomyError} from './economy-engine.js';
// Road searches run away from the multiplayer relay's event loop.
export class EconomyPlanner {
 constructor(){this.worker=null;this.pending=new Map();}
 plan(type,selection,position,seed){
  if(this.pending.size>=4)return Promise.reject(new EconomyError('planner-busy','경로 준비가 밀려 있습니다. 잠시 후 다시 시도해 주세요.',429));
  if(!this.worker){const w=this.worker=new Worker(new URL('./economy-planner-worker.js',import.meta.url));w.unref();w.on('message',m=>{const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new EconomyError('invalid-route',m.error,409)):p.resolve(m.plan);});w.on('error',()=>this.fail());w.on('exit',()=>{if(this.worker===w)this.fail();});}
  return new Promise((resolve,reject)=>{const id=randomUUID(),timer=setTimeout(()=>{this.pending.delete(id);reject(new EconomyError('planner-timeout','경로 준비가 지연되었습니다.',503));this.worker?.terminate();},15000);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({id,type,selection,position,seed});});
 }
 fail(){this.worker=null;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new EconomyError('planner-unavailable','경로 준비를 다시 시도해 주세요.',503));}this.pending.clear();}
 close(){this.worker?.terminate();this.fail();}
}
