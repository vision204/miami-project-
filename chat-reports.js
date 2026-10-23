import {randomUUID,createHash} from 'node:crypto';
export const REPORT_REASONS={abuse:'욕설·괴롭힘',hate:'혐오·차별',sexual:'성적·불쾌한 내용',spam:'도배·광고',privacy:'개인정보 노출',other:'기타'};
const WINDOW=600000,RETAIN=90*86400000;
const fail=code=>{throw Object.assign(new Error(code),{code});};
export class FirestoreReports {
 constructor(backend){this.backend=backend;this.nextCleanup=0;}
 db(){return this.backend()?.db||fail('unavailable');}
 async admin(uid){const d=await this.db().doc('chatReportAdmins/'+uid).get();return d.exists&&d.data().enabled===true;}
 async submit(record){const db=this.db(),ref=db.doc('chatReports/'+record.id),limit=db.doc('chatReportLimits/'+record.reporter.uid);
  return db.runTransaction(async tx=>{const [old,rate]=await Promise.all([tx.get(ref),tx.get(limit)]);if(old.exists)return {id:old.id,duplicate:true};const times=(rate.data()?.times||[]).filter(t=>Number.isFinite(t)&&t>record.createdAt-WINDOW);if(times.length>=3)fail('rate');tx.create(ref,record);tx.set(limit,{times:[...times,record.createdAt],expiresAt:new Date(record.createdAt+86400000)});return {id:record.id,duplicate:false};});}
 async count(){const d=await this.db().collection('chatReports').where('status','==','new').count().get();return d.data().count;}
 async list(cursor){let q=this.db().collection('chatReports').orderBy('createdAt','desc').limit(30);if(cursor){const d=await this.db().doc('chatReports/'+cursor).get();if(!d.exists)fail('cursor');q=q.startAfter(d);}const d=await q.get();return {items:d.docs.map(s=>({id:s.id,...s.data(),expiresAt:undefined})),cursor:d.size===30?d.docs.at(-1).id:null};}
 async review(id,uid){const ref=this.db().doc('chatReports/'+id);await this.db().runTransaction(async tx=>{const d=await tx.get(ref);if(!d.exists)fail('missing');if(d.data().status==='reviewed')return;tx.update(ref,{status:'reviewed',reviewedAt:Date.now(),reviewedBy:uid});});}
 async cleanup(){if(Date.now()<this.nextCleanup)return;this.nextCleanup=Date.now()+600000;for(const name of ['chatReports','chatReportLimits']){const rows=await this.db().collection(name).where('expiresAt','<=',new Date()).limit(100).get();if(!rows.empty){const batch=this.db().batch();rows.docs.forEach(d=>batch.delete(d.ref));await batch.commit();}}}
}
export class ChatReports {
 constructor({chat,repo,send,peers,clock=Date.now}){Object.assign(this,{chat,repo,send,peers,clock});this.epoch=randomUUID();this.drafts=new Map();this.gates=new Map();this.roles=new Map();this.notifying=false;this.notifyAgain=false;}
 prune(){const now=this.clock();for(const[k,v]of this.drafts)if(v.expiresAt<=now)this.drafts.delete(k);for(const[k,v]of this.gates)if(v.until<=now)this.gates.delete(k);for(const[k,v]of this.roles)if(v.until<=now)this.roles.delete(k);}
 async isAdmin(uid){const cached=this.roles.get(uid);if(cached&&cached.until>this.clock())return cached.value;const value=await this.repo.admin(uid);this.roles.set(uid,{value,until:this.clock()+10000});return value;}
 gate(uid,op,ms){const key=uid+':'+op;if((this.gates.get(key)?.until||0)>this.clock())fail('busy');this.gates.set(key,{until:this.clock()+ms});}
 async notify(){if(this.notifying){this.notifyAgain=true;return;}this.notifying=true;try{do{this.notifyAgain=false;const n=await this.repo.count();for(const p of this.peers())if(p.uid&&p.reportSubscribed&&await this.isAdmin(p.uid))this.send(p.ws,{t:'chat_reports_notice',admin:true,unread:n});}while(this.notifyAgain);}catch{}finally{this.notifying=false;}}
 async handle(peer,m){const rid=typeof m.rid==='string'?m.rid.slice(0,64):'',reply=data=>this.send(peer.ws,{t:'chat_reports_result',rid,...data});
  if(!peer.uid){reply({error:'login'});return;}if(peer.reportBusy){reply({error:'busy'});return;}peer.reportBusy=true;
  try{this.prune();let out;
   if(m.op==='open'){
    this.gate(peer.uid,'open',1000);const message=this.chat.snapshot(peer.roomId).find(q=>q.id===m.id);if(!message)fail('expired');if(!message.senderUid)fail('unknown-sender');if(message.senderUid===peer.uid)fail('self');
    const owned=[...this.drafts].filter(([,d])=>d.uid===peer.uid);if(owned.length>=3)this.drafts.delete(owned[0][0]);if(this.drafts.size>=5000)fail('busy');
    const token=randomUUID(),id=createHash('sha256').update(this.epoch+':'+message.id+':'+peer.uid).digest('hex');this.drafts.set(token,{id,uid:peer.uid,room:peer.roomId,expiresAt:this.clock()+300000,message:{id:message.id,from:message.from,name:message.name,text:message.text,sentAt:message.sentAt,uid:message.senderUid}});out={token,expiresAt:this.clock()+300000};
   }else if(m.op==='submit'){
    const d=this.drafts.get(m.token);if(!d||d.expiresAt<=this.clock())fail('expired');if(d.uid!==peer.uid||d.room!==peer.roomId)fail('denied');if(!Object.hasOwn(REPORT_REASONS,m.reason))fail('reason');const detail=typeof m.detail==='string'?m.detail.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,500):'';if(m.reason==='other'&&!detail)fail('detail');
    const now=this.clock(),record={id:d.id,room:d.room,createdAt:now,expiresAt:new Date(now+RETAIN),status:'new',message:d.message,reporter:{uid:peer.uid,name:peer.name},reason:m.reason,detail};out=await this.repo.submit(record);void this.notify();
   }else if(m.op==='status'){
    this.gate(peer.uid,'status',3000);const admin=await this.isAdmin(peer.uid);peer.reportSubscribed=admin;out={admin,...(admin?{unread:await this.repo.count()}:{})};
   }else if(m.op==='list'||m.op==='review'){
    if(!await this.isAdmin(peer.uid))fail('denied');this.gate(peer.uid,m.op,500);
    if(m.op==='list'){const cursor=typeof m.cursor==='string'&&/^[a-f0-9]{64}$/.test(m.cursor)?m.cursor:null;out={admin:true,...await this.repo.list(cursor),unread:await this.repo.count()};}
    else{if(typeof m.id!=='string'||!/^[a-f0-9]{64}$/.test(m.id))fail('missing');await this.repo.review(m.id,peer.uid);out={reviewed:true};void this.notify();}
   }else fail('operation');reply({ok:true,...out});
  }catch(e){reply({error:['login','busy','expired','self','unknown-sender','denied','reason','detail','rate','missing','cursor','unavailable'].includes(e.code)?e.code:'unavailable'});}finally{peer.reportBusy=false;}
 }
}
