// Shared contract geometry. +X east, Y up, +Z south. No player property is used.
export const TIDE={id:'black-tide-v1',name:'블랙 타이드',reward:60000,y:2.73,
 start:[2190,-1510],terminal:[2460,-1550],vault:[2530,-1660],bonus:[2440,-1675],exit:[2190,-1435],car:[2410,-1510],
 decks:[[2190,-1460,20,120],[2300,-1510,240,20],[2490,-1610,200,220]],
 // x,z,width,depth,height,color; all authoritative bullet/movement blockers.
 walls:[[2390,-1620,2,180,3,0x314451],[2590,-1610,2,220,3,0x314451],[2490,-1720,200,2,3,0x314451],
 [2420,-1580,8,16,3,0x507874],[2560,-1550,30,8,3,0x785841],[2480,-1640,24,8,3,0x314d67],[2570,-1620,8,14,3,0x507874],
 [2450,-1610,30,8,3,0x324c60],[2510,-1570,24,8,3,0x9b6543],[2540,-1620,12,28,3,0x466973],[2430,-1660,12,24,3,0x9b6543],
 [2510,-1670,2,60,4,0x263a48],[2550,-1699,80,2,4,0x263a48],[2589,-1670,2,60,4,0x263a48],[2530,-1640,38,2,4,0x263a48],[2580,-1640,20,2,4,0x263a48]],
 guards:[[2420,-1555,0],[2520,-1540,3.14],[2460,-1590,1.57],[2560,-1590,3.14],[2410,-1630,0],[2480,-1670,1.57],[2555,-1655,3.14],[2575,-1685,3.14]]};
export const distance=(a,b)=>Math.hypot(a.x-b[0],a.z-b[1]);
export const contractFloor=(x,z,margin=0)=>TIDE.decks.some(([a,b,w,d])=>Math.abs(x-a)<=w/2+margin&&Math.abs(z-b)<=d/2+margin)?TIDE.y:null;
export function rayBox(o,d,box,max=Infinity){let near=0,far=max;const [x,z,w,l,h]=box,lo=[x-w/2,TIDE.y,z-l/2],hi=[x+w/2,TIDE.y+h,z+l/2];for(let i=0;i<3;i++){if(Math.abs(d[i])<1e-8){if(o[i]<lo[i]||o[i]>hi[i])return null;}else{let a=(lo[i]-o[i])/d[i],b=(hi[i]-o[i])/d[i];if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return null;}}return near;}
export function wallDistance(o,d,max){let n=max;for(const box of TIDE.walls){const t=rayBox(o,d,box,n);if(t!==null)n=t;}return n;}
export function visible(a,b){const v=b.map((n,i)=>n-a[i]),len=Math.hypot(...v);return len<.001||wallDistance(a,v.map(n=>n/len),len)>=len-.05;}
