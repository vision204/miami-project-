// Same in-place superellipse as tools/penthouse.js; no client-provided privacy grant.
export const AURELIS_PRIVATE=Object.freeze({x:-1422,z:-805,base:2.7593553397260933,deck:542.5,first:118,count:6,fh:4.5,y0:16,h:554});
export function aurelisPrivateFloor(s){
 if(!Array.isArray(s)||s[4]||!s.slice(0,3).every(Number.isFinite))return null;
 const q=AURELIS_PRIVATE,level=Math.floor((s[1]-q.base-q.deck+.6)/q.fh);
 if(level<0||level>=q.count)return null;
 const t=(q.deck+level*q.fh-q.y0)/q.h,r=34*Math.sqrt(1.6)*(1-.34*t-.30*t*t);
 return Math.pow(Math.abs(s[0]-q.x)/r,2.44)+Math.pow(Math.abs(s[2]-q.z)/r,2.44)<=1?q.first+level:null;
}
export const aurelisPrivate=p=>aurelisPrivateFloor(p?.s)!==null;
