import net from 'node:net';
export class ConnectionLimits{
 constructor({now=Date.now,perIP=240,total=600,perUID=4}={}){Object.assign(this,{now,perIP,total,perUID});this.clients=new Map();this.buckets=new Map();}
 ip(req){const raw=process.env.RENDER==='true'?String(req.headers['x-forwarded-for']||'').split(',').at(-1)?.trim():req.socket.remoteAddress;return net.isIP(raw||'')?raw:'unknown';}
 admit(req){const ip=this.ip(req),now=this.now();let b=this.buckets.get(ip);if(!b||now-b.at>60000)b={at:now,n:0};b.n++;this.buckets.set(ip,b);if(this.buckets.size>5000)for(const[k,v]of this.buckets)if(now-v.at>60000)this.buckets.delete(k);return b.n<=60&&this.clients.size<this.total&&[...this.clients.values()].filter(c=>c.ip===ip).length<this.perIP;}
 add(ws,req){this.clients.set(ws,{ip:this.ip(req),uid:null});}
 auth(ws,uid){const c=this.clients.get(ws);if(!c)return false;if(c.uid===uid)return true;if([...this.clients.values()].filter(c=>c.uid===uid).length>=this.perUID)return false;c.uid=uid;return true;}
 drop(ws){this.clients.delete(ws);}
}
