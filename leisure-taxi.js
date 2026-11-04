// Fixed city destinations; fares/coordinates never come from the browser.
export const TAXI_FARE=500;
export const LEISURE_ROUTES=Object.freeze([
 {id:'fishing',name:'낚시',place:'BAYFRONT 부두',hint:'부두 길을 따라 상인에게 낚싯대를 구매하고 낚시를 시작해요.',color:'#45b5bf',x:-470,y:2,z:-905,yaw:0},
 {id:'golf',name:'골프',place:'BISCAYNE GOLF',hint:'클럽하우스 안의 라운드 발판에서 시작해요.',color:'#70b56e',x:-1292.26,y:3.44,z:2978.99,yaw:.852},
 {id:'hoops',name:'농구',place:'SUNCREST 야외 코트',hint:'공 거치대에서 공을 들고 슛을 던져 보세요.',color:'#e9a35b',x:-2889.739385221776,y:3.5045294134080975,z:-2503.70297880882,yaw:-2.113332840093639},
 {id:'pingpong',name:'탁구',place:'SUNCREST 탁구장',hint:'탁구대 옆 발판에서 상대와 경기를 시작해요.',color:'#669ee0',x:-2914.911768867433,y:3.5045294134080975,z:-2548.4170828655474,yaw:0.7315235316395627}
]);
export function taxiCommand(s,cmd,{now,observation,charge,fail}){
 const p=s.property,t=s.cityTaxi;
 if(cmd.type==='taxi.ride'){
  const route=LEISURE_ROUTES.find(r=>r.id===cmd.destination),o=observation;
  if(!route||typeof cmd.ride!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(cmd.ride))fail('taxi-route','택시 목적지를 확인해 주세요.');
  if(t?.id===cmd.ride){if(t.destination!==route.id)fail('taxi-intent','같은 택시 기록의 목적지를 바꿀 수 없어요.',409);return {spent:0,taxi:t,position:t.arrival};}
  if(t?.pending)fail('taxi-pending','이전 택시의 도착을 먼저 확인해 주세요.',409);
  if(t&&now-t.at<5000)fail('taxi-cooldown','도착 후 잠시 기다렸다 다시 불러 주세요.',409);
  if(s.flight?.pending||s.speedRace||s.heist?.active||s.work?.active?.expiresAt>now||s.fishing?.active?.expiresAt>now)fail('taxi-busy','진행 중인 활동을 먼저 마쳐 주세요.',409);
  if(!o||now-o.at>2500||!(o.hp>0)||o.car||(o.flags&18)||!Number.isFinite(o.speed)||Math.abs(o.speed)>1.5||![o.x,o.y,o.z].every(Number.isFinite)||o.y>20||o.y<0||o.x< -8500||o.z< -8500)fail('taxi-location','탈것에서 내려 건물 밖의 안전한 곳에서 불러 주세요.',409);
  const spent=charge(s,TAXI_FARE),arrival={x:route.x,y:route.y,z:route.z,yaw:route.yaw};
  s.cityTaxi={id:cmd.ride,destination:route.id,arrival,fare:TAXI_FARE,pending:true,at:now};
  return {spent,taxi:s.cityTaxi,position:arrival};
 }
 if(!t||t.id!==cmd.ride)fail('taxi-missing','택시 도착 기록을 찾을 수 없어요.',409);
 if(t.pending){const o=observation;
  if(!o||now-o.at>2500||o.car||!(o.hp>0)||Math.hypot(o.x-t.arrival.x,o.z-t.arrival.z)>12||Math.abs(o.y-t.arrival.y)>4)fail('taxi-arrival','목적지에서 연결을 확인하는 중이에요.',409);
  t.pending=false;t.arrivedAt=now;
 }
 return {spent:0,taxi:t};
}
