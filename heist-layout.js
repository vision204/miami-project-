// Shared contract geometry. +X east, Y up, +Z south. No player property is used.
// 2026-10-15 (Opus) : 옆 통로(측면 진입) · 부두 난간 · 진짜 엄폐 상자 · 증원 위치 추가. 움직임 판정은 벽을 조금 줄여서 모서리 오판을 막는다.
export const TIDE={id:'black-tide-v1',name:'블랙 타이드',reward:60000,y:2.73,
 start:[2190,-1510],terminal:[2460,-1550],vault:[2530,-1660],bonus:[2440,-1675],exit:[2190,-1435],car:[2410,-1510],
 // 걷는 바닥 : 집결 통로 · 다리 · 본 부두 · 옆 통로(남쪽으로 내려가 서쪽 벽의 문으로 들어간다)
 decks:[[2190,-1460,20,120],[2300,-1510,240,20],[2490,-1610,200,220],[2300,-1584,6,128],[2345,-1645,90,6]],
 // x,z,width,depth,height,color; all authoritative bullet/movement blockers.
 walls:[[2390,-1679,2,62,3,0x314451],[2390,-1586,2,112,3,0x314451],[2590,-1610,2,220,3,0x314451],[2490,-1720,200,2,3,0x314451],
 [2420,-1580,8,16,3,0x507874],[2560,-1550,30,8,3,0x785841],[2480,-1640,24,8,3,0x314d67],[2570,-1620,8,14,3,0x507874],
 [2450,-1610,30,8,3,0x324c60],[2510,-1570,24,8,3,0x9b6543],[2540,-1620,12,28,3,0x466973],[2430,-1660,12,24,3,0x9b6543],
 [2510,-1670,2,60,4,0x263a48],[2550,-1699,80,2,4,0x263a48],[2589,-1670,2,60,4,0x263a48],[2530,-1640,38,2,4,0x263a48],[2580,-1640,20,2,4,0x263a48],
 // 나무 상자 더미 — 이제 진짜 엄폐물 (총알 · 시야 · 이동을 막는다)
 [2440.9,-1540,3.2,1.4,1.6,0x9d774b],[2475.9,-1690,3.2,1.4,1.6,0x9d774b],[2565.9,-1605,3.2,1.4,1.6,0x9d774b],[2420.9,-1700,3.2,1.4,1.6,0x9d774b],
 [2470,-1525,1.4,3.2,1.6,0x9d774b],[2525,-1605,3.2,1.4,1.6,0x9d774b]],
 // 난간 (높이 1.1 m) : 떨어지지 않게 막는다. 이동만 막고 총알 · 시야는 통과한다.
 rails:[[2179.6,-1477,.4,86,1.1],[2200.4,-1467,.4,66,1.1],[2295,-1499.6,190,.4,1.1],[2238.5,-1520.4,117,.4,1.1],[2346.5,-1520.4,87,.4,1.1],
  [2296.6,-1584,.4,128,1.1],[2303.4,-1581,.4,122,1.1],[2343.5,-1648.4,93,.4,1.1],[2346.5,-1641.6,87,.4,1.1],
  [2490,-1499.6,200,.4,1.1],[2389.6,-1525,.4,10,1.1],[2389.6,-1715,.4,10,1.1]],
 guards:[[2420,-1555,0],[2520,-1540,3.14],[2460,-1590,1.57],[2560,-1590,3.14],[2410,-1630,0],[2480,-1670,1.57],[2555,-1655,3.14],[2575,-1685,3.14]],
 // 보석을 꺼내면 다리 입구에 한 번만 나오는 증원 2명
 reinforce:[[2404,-1515,3.14],[2404,-1505,3.14]]};
export const distance=(a,b)=>Math.hypot(a.x-b[0],a.z-b[1]);
export const contractFloor=(x,z,margin=0)=>TIDE.decks.some(([a,b,w,d])=>Math.abs(x-a)<=w/2+margin&&Math.abs(z-b)<=d/2+margin)?TIDE.y:null;
export function rayBox(o,d,box,max=Infinity,shrink=0){let near=0,far=max;const [x,z,w,l,h]=box,lo=[x-w/2+shrink,TIDE.y,z-l/2+shrink],hi=[x+w/2-shrink,TIDE.y+h,z+l/2-shrink];if(lo[0]>hi[0]||lo[2]>hi[2])return null;for(let i=0;i<3;i++){if(Math.abs(d[i])<1e-8){if(o[i]<lo[i]||o[i]>hi[i])return null;}else{let a=(lo[i]-o[i])/d[i],b=(hi[i]-o[i])/d[i];if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return null;}}return near;}
export function wallDistance(o,d,max,shrink=0){let n=max;for(const box of TIDE.walls){const t=rayBox(o,d,box,n,shrink);if(t!==null)n=t;}return n;}
export function visible(a,b,shrink=0){const v=b.map((n,i)=>n-a[i]),len=Math.hypot(...v);return len<.001||wallDistance(a,v.map(n=>n/len),len,shrink)>=len-.05;}
/** 이동 판정용 : 벽을 0.45 m 씩 줄여서 본다. 모서리를 스치는 정상 이동은 통과, 벽을 꿰뚫는 이동(벽 두께 2 m 이상)은 걸린다. */
export const passable=(a,b)=>visible(a,b,.45);
