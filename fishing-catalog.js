import{W,landSDF,lakeAt}from'./fishing-water.js';
export const RODS=Object.freeze([
 {id:'starter',name:'기본 낚싯대',price:500,power:1,range:16,color:0xd1a96b,desc:'가볍게 시작하는 낚시 · 작은 어종에 적합'},
 {id:'reinforced',name:'강화 낚싯대',price:3000,power:1.7,range:20,color:0x6cc6c0,desc:'더 안정적인 장력 · 중형 어종에 적합'},
 {id:'offshore',name:'대물 낚싯대',price:12000,power:2.8,range:24,color:0xf0bc53,desc:'대형 어종을 위한 강한 릴 · 먼바다 추천'}
]);
export const ZONES=Object.freeze([
 {id:'harbor',name:'BAYFRONT · 항구와 운하',color:0x64b7b2},
 {id:'beach',name:'SUNSET HARBOR · 모래 해안',color:0xd3c482},
 {id:'rock',name:'CORAL SHORES · 바위 해안',color:0x879eaf},
 {id:'ocean',name:'먼바다',color:0x548cc7},
 {id:'lagoon',name:'Blue Lagoon · 맑은 호수',color:0x88b67a},
 {id:'cypress',name:'Cypress Slough · 갈대 늪',color:0xa2aa62},
 {id:'creek',name:'Black Creek · 깊은 늪',color:0xb68b63}
]);
// id, name, habitat, kg range, $/kg, encounter weight, body colour, silhouette.
const rows=[
 ['mullet','숭어','harbor',.25,2.5,95,36,0x8aaba1,'slim'],
 ['horse_mackerel','전갱이','harbor',.1,1.2,125,28,0x73aeb6,'slim'],
 ['mackerel','고등어','harbor',.2,1.8,140,20,0x428caa,'slim'],
 ['halfbeak','학꽁치','harbor',.06,.45,180,10,0xa8c3b2,'needle'],
 ['sardine','정어리','harbor',.04,.28,110,30,0x9dafcd,'slim'],
 ['bream','도미','beach',.35,5,155,30,0xcf8d8d,'deep'],
 ['yellow_bream','황돔','beach',.25,3.2,190,18,0xd7ba59,'deep'],
 ['gizzard_shad','전어','beach',.08,.5,130,30,0xa6b6c9,'deep'],
 ['filefish','쥐치','beach',.12,1.5,210,16,0xa7aa78,'deep'],
 ['flounder','넙치','beach',.4,6,260,12,0x8c896a,'flat'],
 ['rockfish','우럭','rock',.25,3.5,180,30,0x756f64,'deep'],
 ['black_rockfish','볼락','rock',.08,.8,220,28,0x8c735d,'deep'],
 ['scorpionfish','쏨뱅이','rock',.1,1.4,240,22,0xb8785b,'spiny'],
 ['grouper','능성어','rock',.7,10,360,8,0x83966f,'deep'],
 ['striped_bream','돌돔','rock',.4,5,320,12,0xb2bec1,'striped'],
 ['tuna','참치','ocean',5,45,260,14,0x416b9a,'torpedo'],
 ['swordfish','황새치','ocean',8,60,350,5,0x688ba9,'sword'],
 ['mahi','만새기','ocean',2,15,180,30,0x78c478,'torpedo'],
 ['yellowtail','방어','ocean',1.5,12,150,32,0x769fa3,'torpedo'],
 ['king_mackerel','꼬치삼치','ocean',2,20,210,19,0x7c9bac,'needle'],
 ['bass','큰입배스','lagoon',.2,5,100,30,0x719367,'deep'],
 ['bluegill','블루길','lagoon',.04,.65,80,32,0x779d9f,'deep'],
 ['carp','잉어','lagoon',.4,8,150,17,0xb6a471,'deep'],
 ['crucian','붕어','lagoon',.08,1.8,110,25,0xc1b584,'deep'],
 ['catfish','채널메기','lagoon',.4,10,190,10,0x849399,'catfish'],
 ['snakehead','가물치','cypress',.4,7,150,30,0x73805d,'slim'],
 ['peacock_bass','피콕배스','cypress',.25,4.5,190,10,0xadbd55,'striped'],
 ['tilapia','틸라피아','cypress',.15,2.5,105,50,0x8b9d91,'deep'],
 ['longnose_gar','롱노즈가','creek',.6,12,210,12,0x9a9e70,'needle'],
 ['bowfin','보우핀','creek',.4,6,180,70,0x68866b,'slim']
];
export const FISH=Object.freeze(rows.map(([id,name,zone,min,max,price,chance,color,shape],i)=>Object.freeze({id,name,zone,min,max,price,chance,color,shape,index:i,rarity:chance<=12?'희귀':chance<=22?'고급':'일반'})));
export const fishById=id=>FISH.find(f=>f.id===id);
export function zoneAt(x,z){
 if(!Number.isFinite(x)||!Number.isFinite(z)||x<W.minX+20||x>W.maxX-20||z<W.minZ+20||z>W.maxZ-20||landSDF(x,z)>-2)return null;
 const lk=lakeAt(x,z);if(lk.d>2)return lk.L.id===0?'lagoon':lk.L.id===1?'cypress':'creek';
 // The inner bay/canals, beach side, western rocky coast and open ocean are disjoint.
 if(landSDF(x,z)<-240&&(x>2250||x<-7400||z>4800||z<-6800))return'ocean';
 if(x<-5800)return'rock';if(x>1050)return'beach';return'harbor';
}
export const payout=(fish,grams)=>Math.floor(grams*fish.price/1000);
export function rollFish(zone,roll){const pool=FISH.filter(f=>f.zone===zone),total=pool.reduce((s,f)=>s+f.chance,0);let n=roll(total),fish=pool.at(-1);for(const f of pool){n-=f.chance;if(n<0){fish=f;break;}}const r=roll(1000000)/1000000,kg=fish.min+(fish.max-fish.min)*Math.pow(r,2.4),grams=Math.round(kg*1000),length=Math.round(Math.cbrt(kg)*(fish.shape==='needle'||fish.shape==='sword'?48:fish.shape==='flat'?29:34));return{fish:fish.id,grams,length,reward:payout(fish,grams)};}
export const DOCKS=Object.freeze([
 {id:'dock-bayfront',name:'BAYFRONT',from:[-620,-905],dir:[1,0]},
 {id:'dock-beach',name:'SUNSET HARBOR',from:[1640,-1560],dir:[-1,0]},
 {id:'dock-coral',name:'CORAL SHORES',from:[-7050,-2760],dir:[-1,0]}
].map(d=>{let t=0;for(;t<4000;t+=1.5)if(landSDF(d.from[0]+d.dir[0]*t,d.from[1]+d.dir[1]*t)<0)break;const shore=[d.from[0]+d.dir[0]*t,d.from[1]+d.dir[1]*t],nx=-d.dir[1],nz=d.dir[0];return{...d,shore,x:shore[0]+d.dir[0]*62+nx*8,z:shore[1]+d.dir[1]*62+nz*8,y:1.25,yaw:Math.atan2(d.dir[1],d.dir[0])};}));
