import {randomUUID} from 'node:crypto';
import {assetSlots} from './economy-engine.js';
export const FOUNDERS_KEY='robrembre-first-200-v1';
export const FOUNDERS_PATH='economyControl/robrembreFounders';
export const FOUNDERS_LIMIT=200;
// Trusted Auth metadata only. Never take registration dates or ranks from browser payloads.
export function appendFounders(previous,users){
 const entries=[...(previous?.entries||[])];const seen=new Set(entries.map(e=>e.uid));
 const candidates=users.filter(u=>!/^qa[-_]/i.test(u.uid)&&Number.isFinite(u.at)&&!seen.has(u.uid)).sort((a,b)=>a.at-b.at||a.uid.localeCompare(b.uid));
 for(const u of candidates){if(entries.length>=FOUNDERS_LIMIT)break;entries.push({uid:u.uid,at:u.at,rank:entries.length+1});seen.add(u.uid);}
 return {campaign:FOUNDERS_KEY,limit:FOUNDERS_LIMIT,entries};
}
export function awardFounder(account,uid,registry,catalog,{now=Date.now(),uuid=randomUUID}={}){
 const e=registry?.entries?.find(e=>e.uid===uid);if(registry?.campaign!==FOUNDERS_KEY||!e||!Number.isInteger(e.rank)||e.rank<1||e.rank>FOUNDERS_LIMIT||account.grants?.[FOUNDERS_KEY])return false;
 const existing=assetSlots(account.property).find(s=>s.r.k==='sv_sovrano');
 const k=catalog.vehicles.find(k=>k.id==='sv_sovrano');if(!k)throw Error('Founder vehicle absent from catalog');
 if(!existing){account.property.over??=[];account.property.over.push({a:uuid(),k:k.id,c:0x181e23,p:0,f:k.fuel?.capacity??null,gift:FOUNDERS_KEY});}
 account.grants??={};account.grants[FOUNDERS_KEY]={rank:e.rank,at:now,asset:existing?.r.a||account.property.over.at(-1).a,existing:!!existing};account.version++;account.updatedAt=now;return true;
}
export function createFounderRefresh(auth,db){
 let pending=null,last=0,known=new Set(),full=false;
 return async(uid)=>{if(pending)await pending;if(full||known.has(uid)&&Date.now()-last<60000)return;
  pending=(async()=>{const ref=db.doc(FOUNDERS_PATH),current=(await ref.get()).data();if(current?.entries?.length>=FOUNDERS_LIMIT){full=true;last=Date.now();return;}
   const users=[];let token;do{const page=await auth.listUsers(1000,token);token=page.pageToken;for(const u of page.users)users.push({uid:u.uid,at:Date.parse(u.metadata.creationTime)});}while(token);
   await db.runTransaction(async tx=>{const snap=await tx.get(ref),next=appendFounders(snap.data(),users);if(next.entries.length!==(snap.data()?.entries?.length||0))tx.set(ref,next);known=new Set(next.entries.map(e=>e.uid));full=next.entries.length>=FOUNDERS_LIMIT;});last=Date.now();
  })();try{await pending;}finally{pending=null;}
 };
}
