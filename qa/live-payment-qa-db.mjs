// In-memory only. No credentials, Firebase or network access.
import assert from 'node:assert/strict';
const clone=structuredClone;
export class DB{
 constructor(){this.map=new Map();this.tail=Promise.resolve();this.failCommit=null;}
 snap(p){const data=this.map.get(p);return {id:p.split('/').at(-1),exists:data!==undefined,ref:this.doc(p),data:()=>clone(data)};}
 doc(p){return {path:p,get:async()=>this.snap(p),set:async(d,opt)=>{const old=this.map.get(p)||{};this.map.set(p,clone(opt?.merge?{...old,...d}:d));},collection:n=>({doc:id=>this.doc(p+'/'+n+'/'+id)})};}
 collection(n){const db=this;function q(filters=[],order=null,limit=Infinity){return {where:(k,op,v)=>q([...filters,[k,op,v]],order,limit),orderBy:(k,d)=>q(filters,[k,d],limit),limit:l=>q(filters,order,l),get:async()=>{let rows=[...db.map].filter(([p,d])=>p.startsWith(n+'/')&&p.split('/').length===n.split('/').length+1&&filters.every(([k,op,v])=>op==='=='?d[k]===v:op==='<='?d[k]<=v:op==='>='?d[k]>=v:op==='<'?d[k]<v:false));if(order)rows.sort((a,b)=>(a[1][order[0]]<b[1][order[0]]?-1:a[1][order[0]]>b[1][order[0]]?1:0)*(order[1]==='desc'?-1:1));return {docs:rows.slice(0,limit).map(([p])=>db.snap(p))};}};}return q();}
 runTransaction(fn){const task=this.tail.then(async()=>{let writing=false;const writes=[];const out=await fn({get:async r=>{assert(!writing,'Firestore reads must precede all writes');return r.path?this.snap(r.path):r.get();},set:(r,d,opt)=>{writing=true;writes.push([r.path,d,opt]);},create:(r,d)=>{writing=true;assert(!this.map.has(r.path));writes.push([r.path,d]);}});if(this.failCommit?.(writes)){this.failCommit=null;throw Error('simulated storage failure');}const next=new Map(this.map);for(const[p,d,opt]of writes)next.set(p,clone(opt?.merge||opt?.mergeFields?{...next.get(p),...d}:d));this.map=next;return out;});this.tail=task.catch(()=>{});return task;}
}
