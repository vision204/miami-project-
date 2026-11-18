// SUNHORN 사냥 카탈로그 (2026-10-17 · Opus) — 이 파일은 server/hunting-catalog.js 와 글자 하나까지 같다.
// 서버가 동물 이름 · 무리 위치 · 개체 크기 · 보상을 이 표로 다시 계산한다. 화면이 보낸 금액은 쓰지 않는다.
export const HUNT_VERSION=1;
export const RESPAWN_MS=6*60*1000;          // 쓰러진 동물은 6분 뒤 다시 나타난다 (같은 동물 재지급 간격)
// id · 이름 · 보상 범위($) · 위험(공격함)
export const SPECIES=[
 {id:'elephant',name:'코끼리',min:30000,max:50000,danger:false},
 {id:'rhino',name:'코뿔소',min:20000,max:35000,danger:true},
 {id:'lion',name:'사자',min:4800,max:6000,danger:true},
 {id:'hippo',name:'하마',min:5000,max:6000,danger:true},
 {id:'giraffe',name:'기린',min:4500,max:5500,danger:false},
 {id:'buffalo',name:'버팔로',min:4500,max:5500,danger:true},
 {id:'cheetah',name:'치타',min:4000,max:4800,danger:true},
 {id:'zebra',name:'얼룩말',min:3200,max:3800,danger:false},
 {id:'wildebeest',name:'누',min:3200,max:3800,danger:false},
 {id:'hyena',name:'하이에나',min:3000,max:3400,danger:true},
 {id:'ostrich',name:'타조',min:600,max:700,danger:false},
 {id:'gazelle',name:'가젤',min:550,max:650,danger:false},
 {id:'warthog',name:'혹멧돼지',min:500,max:600,danger:false},
 {id:'alligator',name:'악어 (앨리게이터)',min:6000,max:6000,danger:false},
 {id:'crocodile',name:'악어 (크로커다일)',min:6000,max:6000,danger:false}];
// 무리 : [종, 중심 x, 중심 z, 마리 수, 돌아다니는 반지름 m] — SUNHORN ISLAND
export const HERDS=[["zebra",-5730,11750,8,320],["zebra",-3960,6910,7,300],["wildebeest",-770,10530,8,320],["wildebeest",-7340,8490,8,320],["gazelle",-2700,12890,6,260],["gazelle",-3510,9840,6,260],["warthog",-8240,11240,3,180],["warthog",-2310,8170,3,180],["warthog",-5620,9610,3,180],["ostrich",-7420,12970,4,240],["ostrich",-4540,13280,4,240],["giraffe",-5960,7260,4,300],["giraffe",-3920,11630,3,300],["elephant",-6840,10590,5,360],["elephant",-3870,8430,4,360],["lion",-6050,13240,4,240],["lion",-1990,9450,3,240],["cheetah",-1770,11710,2,260],["cheetah",-4750,10540,2,260],["hyena",-7710,9720,5,260],["hyena",-5460,8450,4,260],["buffalo",-7200,11850,6,300],["buffalo",-6600,9460,6,300],["rhino",-2840,11500,2,240],["rhino",-4630,9230,2,240],["hippo",-5650,10150,5,180]];
// 미국 대륙 맵 (2026-11-16) : 섬 도감(SPECIES)과 따로 둔다. 무리 표는 .dev/northwest-roads-20261110/nwwild.mjs 의 table() 결과와 같아야 한다.
export const NW_SPECIES=[
 {id:'grizzly',name:'회색곰',min:10000,max:15000,danger:true},
 {id:'bison',name:'들소',min:8000,max:12000,danger:true},
 {id:'elk',name:'엘크',min:4000,max:6000,danger:true},
 {id:'mustang',name:'야생마',min:3000,max:4500,danger:true},
 {id:'pronghorn',name:'가지뿔영양',min:1800,max:2600,danger:false},
 {id:'deer',name:'흰꼬리사슴',min:1500,max:2200,danger:false},
 {id:'coyote',name:'코요테',min:1500,max:2000,danger:true},
 {id:'cattle',name:'소',min:900,max:1400,danger:false},
 {id:'eagle',name:'흰머리수리',min:600,max:900,danger:false}];
export const NW_HERDS=[["bison",-9364,-10081,10,300],["bison",-11152,-7161,10,300],["bison",-19774,-13879,10,300],["bison",-12091,-10507,10,300],["elk",-31472,-21306,6,280],["elk",-10855,-20242,6,280],["elk",-19146,-17339,6,280],["elk",-31705,-13504,6,280],["deer",-16546,-19886,4,220],["deer",-11173,-13823,4,220],["deer",-38916,-17349,4,220],["deer",-7681,-14520,4,220],["deer",-19479,-20865,4,220],["deer",-35428,-15848,4,220],["pronghorn",-20099,-11487,6,320],["pronghorn",-9712,-5538,6,320],["pronghorn",-10278,-10004,6,320],["coyote",-32801,-661,3,260],["coyote",-18918,-16141,3,260],["coyote",-37186,-8013,3,260],["coyote",-20018,-10518,3,260],["coyote",-20921,-13726,3,260],["grizzly",-30575,-16285,1,240],["grizzly",-15606,-20528,1,240],["grizzly",-29164,-12129,1,240],["grizzly",-19595,-19880,1,240],["mustang",-29595,-1916,7,320],["mustang",-34802,-9270,7,320],["mustang",-19673,-6796,7,320],["eagle",-13363,-20237,1,160],["eagle",-6930,-21389,1,160],["eagle",-22072,-16922,1,160],["eagle",-27354,-13437,1,160],["eagle",-31336,-11679,1,160],["eagle",-32273,-16703,1,160],["cattle",-35897,-7637,7,150],["cattle",-10923,-6651,7,150],["alligator",-15205,-11503,4,95],["alligator",-14532,-6160,4,95],["alligator",-15874,-12255,3,70],["alligator",-15528,-10462,3,70],["alligator",-14965,-5176,3,70]];
export const speciesById=id=>SPECIES.find(s=>s.id===id)||NW_SPECIES.find(s=>s.id===id)||null;
const hash=(a,b)=>{let h=Math.imul((a|0)+0x9e3779b9,0x85ebca6b)^Math.imul((b|0)+0x27d4eb2f,0xc2b2ae35);h^=h>>>15;h=Math.imul(h,0x2c1b3c6d);h^=h>>>12;return (h>>>0)/4294967296;};
/** 개체 크기 0..1 (모델 크기와 보상이 같이 커진다) */
export const animalSize=(herd,i)=>hash(herd*31+7,i*17+3);
/** 섬 동물 id : h<무리>.<번호>  ·  대륙 동물 : n<무리>.<번호>  ·  본섬 악어 : w.<야생동물 id> */
export const animalId=(herd,i)=>'h'+herd+'.'+i;
export function parseAnimal(id){if(typeof id!=='string'||id.length>100)return null;
 let m=/^h(\d{1,3})\.(\d{1,2})$/.exec(id);if(m){const herd=+m[1],i=+m[2],H=HERDS[herd];if(!H||i>=H[3])return null;const sp=speciesById(H[0]),size=animalSize(herd,i);return {id,herd,i,species:sp.id,x:H[1],z:H[2],r:H[4],size,price:Math.round((sp.min+(sp.max-sp.min)*size)/10)*10};}
 m=/^n(\d{1,3})\.(\d{1,2})$/.exec(id);if(m){const herd=+m[1],i=+m[2],H=NW_HERDS[herd];if(!H||i>=H[3])return null;const sp=speciesById(H[0]),size=animalSize(herd+1000,i);return {id,herd,i,nw:true,species:sp.id,x:H[1],z:H[2],r:H[4],size,price:Math.round((sp.min+(sp.max-sp.min)*size)/10)*10};}
 m=/^w\.((alligator|crocodile)[A-Za-z0-9:_.-]{0,80})$/.exec(id);if(m){const sp=speciesById(m[2]);return {id,herd:null,species:sp.id,size:.5,price:sp.min};}
 return null;}
