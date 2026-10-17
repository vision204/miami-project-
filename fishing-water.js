// Exact procedural geography extracted from current city; do not edit independently.
const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t,smooth=t=>t*t*(3-2*t),smoothstep=(a,b,v)=>smooth(clamp((v-a)/(b-a),0,1));
function vhash(ix, iz, s){
  let h = (ix|0)*1597334677 ^ (iz|0)*3812015801 ^ (s|0)*2246822519;
  h = Math.imul(h ^ (h>>>15), 2246822519);
  return ((h ^ (h>>>13)) >>> 0) / 4294967296;
}
function noise2(x, z, s=0){
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = smooth(xf), v = smooth(zf);
  const a = vhash(xi,   zi,   s), b = vhash(xi+1, zi,   s);
  const c = vhash(xi,   zi+1, s), d = vhash(xi+1, zi+1, s);
  return lerp(lerp(a,b,u), lerp(c,d,u), v);           // 0..1
}
function fbm(x, z, oct=4, s=0, lac=2.0, gain=0.5){
  let f=1, a=0.5, sum=0, norm=0;
  for (let i=0;i<oct;i++){ sum += a*noise2(x*f, z*f, s+i*17); norm += a; f*=lac; a*=gain; }
  return sum/norm;                                     // 0..1
}
const snoise = (x,z,s=0)=> noise2(x,z,s)*2-1;          // -1..1

const W = { minX:-9500, maxX:3500, minZ:-7500, maxZ:6500 };
W.sizeX = W.maxX - W.minX;   // 13,000 m
W.sizeZ = W.maxZ - W.minZ;   // 14,000 m

/* ---------- SDF 프리미티브 (양수 = 육지 내부) ---------- */
function sdSeg(px,pz, ax,az, bx,bz){
  const vx=bx-ax, vz=bz-az, wx=px-ax, wz=pz-az;
  const L2 = vx*vx+vz*vz || 1;
  const t = clamp((wx*vx+wz*vz)/L2, 0, 1);
  return Math.hypot(wx - vx*t, wz - vz*t);
}
function sdBoxW(x,z, x0,x1,z0,z1, amp=0, frq=0.002, s=1){
  const d = Math.min(x-x0, x1-x, z-z0, z1-z);
  return amp ? d + amp*snoise(x*frq, z*frq, s) : d;
}
function sdEll(x,z, cx,cz, a,b, rot=0, amp=0){
  let dx=x-cx, dz=z-cz;
  if (rot){ const c=Math.cos(-rot), s=Math.sin(-rot); const nx=dx*c-dz*s; dz=dx*s+dz*c; dx=nx; }
  const r = Math.hypot(dx/a, dz/b);
  return (1-r)*Math.min(a,b) + (amp ? amp*snoise(x*0.006, z*0.006, 9) : 0);
}

/* ---------- 본토 해안선 ---------- */
function mainlandShoreX(z){
  return -540 + 300*Math.sin(z*0.00042+0.4) + 125*Math.sin(z*0.0013+2.1)
             + 55*Math.sin(z*0.0037+0.9);
}
/* 섬 외곽선 : 방사형 반경을 저주파 사인 합성으로 변조 → 자연스러운 대형 섬
   (동쪽 해안은 기존 비스케인 만 해안선을 그대로 유지) */
const ISLE = { cx:-2800, cz:-500, ax:4250, az:6300 };
function isleRadius(a){
  return 1.00
       + 0.135*Math.sin(a*2 + 0.75)
       + 0.090*Math.sin(a*3 - 1.15)
       + 0.055*Math.sin(a*5 + 2.05)
       + 0.032*Math.sin(a*7 + 0.35)
       + 0.020*Math.sin(a*11 - 0.8);
}
function sdIsleMain(x,z){
  const ux = (x-ISLE.cx)/ISLE.ax, uz = (z-ISLE.cz)/ISLE.az;
  const r = Math.hypot(ux,uz);
  if (r < 0.35) return 0.65*Math.min(ISLE.ax, ISLE.az);
  const a = Math.atan2(uz, ux);
  return (isleRadius(a) - r) * Math.min(ISLE.ax, ISLE.az);
}
function sdMainland(x,z){
  let d = mainlandShoreX(z) - x;              // 동쪽(만) 해안
  d = Math.min(d, sdIsleMain(x,z));           // 나머지는 섬 외곽선
  /* 빠른 건너뛰기 (결과 동일) : 만(−sdEll)은 d 보다 작아질 수 없으면, 반도(+sdEll)는 d 보다 커질 수 없으면 건너뛴다 */
  const ub = (cx,cz,a,b,amp) => (1-Math.hypot(x-cx,z-cz)/(a>b?a:b))*(a<b?a:b) + amp;
  // 큰 만 / 작은 만 (섬을 파고드는 수역)
  if (ub(-5350,2450,980,620,40) >= -d - 1e-6) d = Math.min(d, -sdEll(x,z, -5350, 2450, 980, 620, 0.5, 40));   // 남서 대형 만
  if (ub(-6150,-2550,620,420,30) >= -d - 1e-6) d = Math.min(d, -sdEll(x,z, -6150, -2550, 620, 420, -0.3, 30));  // 북서 만
  if (ub(-2900,4550,520,340,26) >= -d - 1e-6) d = Math.min(d, -sdEll(x,z, -2900, 4550, 520, 340, 0.2, 26));   // 남부 소만
  // 반도
  if (ub(-6950,500,780,430,40) >= d - 1e-6) d = Math.max(d, sdEll(x,z, -6950, 500, 780, 430, 0.25, 40));    // 서쪽 반도
  if (ub(-3550,-5250,700,520,40) >= d - 1e-6) d = Math.max(d, sdEll(x,z, -3550, -5250, 700, 520, -0.2, 40));   // 북쪽 반도
  // 저주파 = 만/곶(큰 리듬), 중주파 = 완만한 굴곡.
  // 고주파(파장 180m) 항을 제거해 해변이 톱니가 아니라 부드러운 곡선이 되게 한다.
  return d + 30*snoise(x*0.0011, z*0.0011, 11) + 9*snoise(x*0.0026, z*0.0026, 23);
}

/* =====================================================================
   내륙 호수 / 습지 (3개 : 맑은 호수 1 + 늪 2)
   - land SDF 에서 잘라내 실제 수면(대양 셰이더)을 노출시킨다.
   - swamp 는 별도의 탁한 수면 플레이트 + 갈대/고사목으로 덮어쓴다.
   ===================================================================== */
const LAKES = [
  { n:'Blue Lagoon',    kind:'clean', cx:-5300, cz:  600, ax:500, az:340, rot: 0.30, amp: 66, wy:0.45 },
  { n:'Cypress Slough', kind:'swamp', cx:-6300, cz:-1500, ax:540, az:360, rot:-0.35, amp:118, wy:0.60 },
  { n:'Black Creek',    kind:'swamp', cx:-6000, cz:-4000, ax:560, az:380, rot: 0.42, amp:124, wy:0.60 },
];
LAKES.forEach((k,i)=>{
  k.id = i;
  const m = Math.max(k.ax, k.az) + k.amp*1.5 + 260;
  k.bx0 = k.cx-m; k.bx1 = k.cx+m; k.bz0 = k.cz-m; k.bz1 = k.cz+m;
  k.oct = k.kind==='swamp' ? 3 : 2;
  k.ns  = 300 + i*37;
});
/** 호수 SDF (양수 = 수면 안쪽). 핫패스이므로 AABB 조기 탈출 + 결과 객체 재사용 */
const _lk = { d:-1e9, L:null };
function lakeAt(x, z){
  let d = -1e9, L = null;
  for (let i=0;i<LAKES.length;i++){
    const k = LAKES[i];
    if (x < k.bx0 || x > k.bx1 || z < k.bz0 || z > k.bz1) continue;
    // 늪은 가장자리를 크게 흔들어 불규칙하게, 맑은 호수는 완만하게
    const v = sdEll(x, z, k.cx, k.cz, k.ax, k.az, k.rot, 0)
            + k.amp * (fbm(x*0.00105, z*0.00105, k.oct, k.ns)*2 - 1)          // 큰 만입/돌출
            + k.amp * 0.40 * (fbm(x*0.0036, z*0.0036, 2, k.ns+9)*2 - 1);      // 잔굴곡
    if (v > d){ d = v; L = k; }
  }
  _lk.d = d; _lk.L = L;
  return _lk;
}
/** 늪 지대(수면 + 주변 습지)인지 */
function swampNear(x, z, pad=90){
  const lk = lakeAt(x,z);
  return (lk.L && lk.L.kind === 'swamp' && lk.d > -pad) ? { d:lk.d, L:lk.L } : null;
}

/* ---------- 운하 / 하천 (본토를 파고드는 수로) ----------
   - 예전에는 직선 폴리라인이라 강이 직각으로 꺾여 보였다.
     리샘플 + 다중 사인 사행(meander) + 폭 변주로 자연 하천처럼 만든다.
   - Miami River 는 MIA 공항 부지를 관통하던 것을 남쪽으로 우회시켰다. */
const CANALS = [
  // Miami River : 다운타운 → 서쪽. 공항(z −1300..−120) 남쪽으로 흐른다.
  { open:true, w:64, mnd:44, p:[[-430,-140],[-1050,-180],[-1700,-100],[-2400,60],[-3150,190],[-3900,330],[-4700,470]] },
  { w:34, mnd:34, p:[[-470,-2620],[-1600,-2760],[-3000,-2900],[-4600,-3050]] },            // Little River
  // Miami Canal : 공항 북쪽을 지나 북서로
  { open:true, w:44, mnd:30, p:[[-1450,-950],[-2500,-1500],[-3600,-2050],[-5000,-2680],[-6600,-3320]] },
  { w:38, mnd:30, p:[[-980,1980],[-1900,1860],[-3000,1720],[-4400,1600]] },                // Coral Gables Wtwy
  { w:34, mnd:34, p:[[-1550,3450],[-3200,3350],[-5200,3260],[-7000,3200]] },               // Snapper Creek
  { off:true, w:30, mnd:26, p:[[-900,-4550],[-2600,-4700],[-4600,-4800]] },                // North canal — 2026-09-26 사용자 요청으로 없앰(자리는 그대로 두어 다른 운하의 사행 위상이 안 바뀐다)
  { w:30, mnd:26, p:[[-1400,5200],[-3600,5150],[-6000,5100]] },                            // South canal
  { w:26, mnd:0,  p:[[1560,-2320],[1980,-2300]] }, { w:26, mnd:0, p:[[1560,-2050],[1980,-2030]] }, // Beach finger canals
  { w:26, mnd:0,  p:[[1560,-1780],[1980,-1760]] },
];
/* 폴리라인을 촘촘히 리샘플한 뒤 법선 방향으로 사행시킨다 (결정론적) */
(function meanderCanals(){
  for (let ci=0; ci<CANALS.length; ci++){
    const c = CANALS[ci];
    const A = c.mnd || 0;
    // 40 m 간격 리샘플
    const pts = [[c.p[0][0], c.p[0][1]]];
    for (let i=1;i<c.p.length;i++){
      const [x0,z0]=c.p[i-1], [x1,z1]=c.p[i];
      const L=Math.hypot(x1-x0,z1-z0), n=Math.max(1,Math.round(L/40));
      for (let k=1;k<=n;k++) pts.push([lerp(x0,x1,k/n), lerp(z0,z1,k/n)]);
    }
    if (A > 0){
      // 누적 길이 → 위상. 3개 사인 합성 = 비주기 사행
      let acc = 0; const out = [];
      for (let i=0;i<pts.length;i++){
        if (i) acc += Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]);
        const i0 = Math.max(0,i-1), i1 = Math.min(pts.length-1,i+1);
        const tx = pts[i1][0]-pts[i0][0], tz = pts[i1][1]-pts[i0][1];
        const TL = Math.hypot(tx,tz) || 1;
        const nx = -tz/TL, nz = tx/TL;
        // 양 끝(접속부)은 흔들지 않는다
        const endFade = Math.min(1, i/4) * Math.min(1, (pts.length-1-i)/4);
        const off = A * endFade * (
            Math.sin(acc/560  + ci*1.7) * 1.00 +
            Math.sin(acc/233  + ci*2.9) * 0.46 +
            Math.sin(acc/97   + ci*0.7) * 0.18 );
        out.push([pts[i][0] + nx*off, pts[i][1] + nz*off]);
      }
      c.line = out;
    } else c.line = pts;
    // 폭 변주 (하류가 넓다)
    c.wAt = new Float32Array(c.line.length);
    for (let i=0;i<c.line.length;i++){
      const t = i/(c.line.length-1);
      c.wAt[i] = c.w * (1 - 0.34*t) * (0.90 + 0.20*noise2(c.line[i][0]*0.004, c.line[i][1]*0.004, 77));
    }
    c.p = c.line;       // sdPoly 가 쓰는 폴리라인 교체
  }
})();
/* 운하 세그먼트 공간 인덱스 (landSDF 핫패스라 균일 격자로 조기 탈출) */
const CANAL_GRID = (()=>{
  const CS2 = 220;
  const nx = Math.ceil(W.sizeX/CS2)+2, nz = Math.ceil(W.sizeZ/CS2)+2;
  const cells = new Array(nx*nz);
  const put = (ix,iz,e)=>{ if(ix<0||iz<0||ix>=nx||iz>=nz) return;
    (cells[iz*nx+ix] || (cells[iz*nx+ix]=[])).push(e); };
  for (const c of CANALS){
    if (c.off) continue;
    for (let i=0;i<c.line.length-1;i++){
      const a=c.line[i], b2=c.line[i+1];
      const hw = Math.max(c.wAt[i], c.wAt[i+1])*0.5 + 30;
      const x0=Math.min(a[0],b2[0])-hw, x1=Math.max(a[0],b2[0])+hw;
      const z0=Math.min(a[1],b2[1])-hw, z1=Math.max(a[1],b2[1])+hw;
      const e = [a[0],a[1],b2[0],b2[1], Math.max(c.wAt[i],c.wAt[i+1])*0.5];
      for (let ix=Math.floor((x0-W.minX)/CS2); ix<=Math.floor((x1-W.minX)/CS2); ix++)
        for (let iz=Math.floor((z0-W.minZ)/CS2); iz<=Math.floor((z1-W.minZ)/CS2); iz++) put(ix,iz,e);
    }
  }
  return { CS2, nx, nz, cells };
})();
function canalSDF(x, z){
  const g = CANAL_GRID;
  const ix = Math.floor((x-W.minX)/g.CS2), iz = Math.floor((z-W.minZ)/g.CS2);
  if (ix<0||iz<0||ix>=g.nx||iz>=g.nz) return 1e9;
  const arr = g.cells[iz*g.nx+ix];
  if (!arr) return 1e9;
  let best = 1e9;
  for (let k=0;k<arr.length;k++){
    const e = arr[k];
    const v = sdSeg(x,z, e[0],e[1], e[2],e[3]) - e[4];
    if (v < best) best = v;
  }
  return best;
}

/* ---------- 열린 강 (2026-09-26) ----------
   운하는 지형만 파고, 도시 블록(보로노이 셀)은 그 위를 그대로 덮고 있었다 → 강이 사라져 보였다.
   open:true 인 강은 블록을 강 띠(반폭 + CANAL_BANK)에서 잘라 낸다. 시드가 있는 쪽만 남긴다.
   잘린 강가 변은 '해안 변'으로 표시해 골목길이 생기지 않는다. 큰 도로(ave·hwy)는 원래대로 다리로 건넌다. */
const CANAL_BANK = 7;
CANALS.forEach(c=>{ if(!c.open) return; let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
  for(const p of c.line){ x0=Math.min(x0,p[0]); x1=Math.max(x1,p[0]); z0=Math.min(z0,p[1]); z1=Math.max(z1,p[1]); }
  c.bb=[x0-700,x1+700,z0-700,z1+700]; });
function canalNearest(c,x,z){
  const L=c.line;let best=1e18,bi=0,bt=0;
  for(let i=0;i<L.length-1;i++){const ax=L[i][0],az=L[i][1],dx=L[i+1][0]-ax,dz=L[i+1][1]-az,ll=dx*dx+dz*dz||1;
    let t=((x-ax)*dx+(z-az)*dz)/ll;t=t<0?0:t>1?1:t;const qx=ax+dx*t-x,qz=az+dz*t-z,d=qx*qx+qz*qz;if(d<best){best=d;bi=i;bt=t;}}
  const a=L[bi],b=L[bi+1],cr=(b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]);
  return {d:Math.sqrt(best),s:cr>=0?1:-1,end:(bi===0&&bt<=0)||(bi===L.length-2&&bt>=1),hw:lerp(c.wAt[bi],c.wAt[bi+1],bt)*0.5};
}
/** 블록 한 개에 대한 강가 필드 : 0 이상 = 남기는 땅 */
function canalKeepField(cs){
  return (x,z)=>{let f=1e9;for(const k of cs){const n=canalNearest(k.c,x,z);
    const g=(n.end?n.d:k.s*n.s*n.d)-n.hw-CANAL_BANK;if(g<f)f=g;}return f;};
}
/** 강 띠로 블록 폴리곤을 자른다. 안 겹치면 null. */
function canalClip(poly,clipped,tags,sx,sz){
  const cs=[];
  for(const c of CANALS){if(!c.open)continue;const b=c.bb;if(sx<b[0]||sx>b[1]||sz<b[2]||sz>b[3])continue;
    const n=canalNearest(c,sx,sz);if(n.d>650)continue;cs.push({c,s:n.s});}
  if(!cs.length)return null;
  const f=canalKeepField(cs);
  const Lp=[];
  for(let k=0;k<poly.length;k++){const a=poly[k],b=poly[(k+1)%poly.length],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/8));
    Lp.push({p:a,orig:true,cl:clipped[k],tag:tags[k]});
    for(let m=1;m<n;m++)Lp.push({p:[lerp(a[0],b[0],m/n),lerp(a[1],b[1],m/n)],orig:false,cl:false,tag:tags[k]});}
  for(const q of Lp)q.f=f(q.p[0],q.p[1]);
  if(Lp.every(q=>q.f>=0))return null;
  const cross=(A,B)=>{let lo=0,hi=1;const ain=A.f>=0;for(let it=0;it<14;it++){const m=(lo+hi)/2,v=f(lerp(A.p[0],B.p[0],m),lerp(A.p[1],B.p[1],m));if((v>=0)===ain)lo=m;else hi=m;}
    const t=ain?lo:hi;return [lerp(A.p[0],B.p[0],t),lerp(A.p[1],B.p[1],t)];};
  const out=[];
  for(let i=0;i<Lp.length;i++){const A=Lp[i],B=Lp[(i+1)%Lp.length];
    if(A.f>=0)out.push(A);
    if((A.f>=0)!==(B.f>=0))out.push({p:cross(A,B),bank:true,exit:A.f>=0,tag:A.tag});}
  if(out.length<3)return {poly:[],clipped:[],tags:[]};
  /* 강가를 따라가는 변 : 나간 점 → 다시 들어온 점 사이를 10 m 마다 강가로 밀어 붙인다 */
  const push=(x,z)=>{for(let it=0;it<10;it++){const v=f(x,z);if(v>=0)return [x,z];const e=2,gx=(f(x+e,z)-f(x-e,z))/(2*e),gz=(f(x,z+e)-f(x,z-e))/(2*e),g=Math.hypot(gx,gz);if(g<1e-6)break;x+=gx/g*(-v+.3);z+=gz/g*(-v+.3);}return [x,z];};
  const res=[];
  for(let i=0;i<out.length;i++){const A=out[i];
    if(A.orig||A.bank)res.push(A);
    const B=out[(i+1)%out.length];
    if(A.bank&&A.exit&&B.bank&&!B.exit){const L=Math.hypot(B.p[0]-A.p[0],B.p[1]-A.p[1]),n=Math.floor(L/10);
      for(let m=1;m<n;m++)res.push({p:push(lerp(A.p[0],B.p[0],m/n),lerp(A.p[1],B.p[1],m/n)),bank:true,tag:A.tag});}}
  if(res.length<3)return {poly:[],clipped:[],tags:[]};
  return {poly:res.map(q=>q.p),clipped:res.map(q=>!!(q.bank||q.cl)),tags:res.map(q=>q.tag)};
}

/* ---------- 작은 섬 블록 (2026-09-26) ----------
   보로노이 셀이 여러 섬에 걸쳐 있으면, 정점만 물 밖으로 밀려서 섬과 섬 사이 바다 위에
   초록 삼각형 땅(지면 패드)이 생겼다. 시드가 든 섬의 타원(해안 노이즈만큼 안쪽)으로 블록을 자른다.
   villa:true 인 섬은 모던 화이트 빌라 단지로 짓는다. 값은 sdIslands 의 UE 와 같다. */
const ISLAND_ESTATES = [
  {n:'Star',cx:700,cz:-1000,a:195,b:128,rot:.2,amp:10,villa:true},
  {n:'Palm',cx:1010,cz:-1185,a:128,b:88,rot:0,amp:8,villa:true},
  {n:'Hibiscus',cx:1235,cz:-1010,a:118,b:82,rot:0,amp:8,villa:true},
  ...[0,1,2,3,4].map(i=>({n:'Venetian '+(i+1),cx:60+i*278,cz:-1300+((i%2)?18:-18),a:108,b:60,rot:0,amp:7,villa:true})),
  {n:'Fisher',cx:1650,cz:-110,a:300,b:92,rot:0,amp:8,villa:true},
  {n:'Watson',cx:230,cz:-700,a:235,b:118,rot:0,amp:10,villa:false},
];
function islandAt(x,z){
  for(const I of ISLAND_ESTATES){const dx=x-I.cx,dz=z-I.cz,c=Math.cos(-I.rot),s=Math.sin(-I.rot);
    const lx=dx*c-dz*s,lz=dx*s+dz*c;if(Math.hypot(lx/I.a,lz/I.b)<1)return I;}
  return null;
}
function islandPoly(I,inset){
  const a=Math.max(10,I.a-inset),b=Math.max(10,I.b-inset),out=[],c=Math.cos(I.rot),s=Math.sin(I.rot);
  for(let k=0;k<40;k++){const t=k/40*TAU,lx=a*Math.cos(t),lz=b*Math.sin(t);out.push([I.cx+lx*c-lz*s,I.cz+lx*s+lz*c]);}
  return out;
}
/** 볼록 다각형(clip)으로 블록 폴리곤을 자른다 (Sutherland–Hodgman). 잘린 점은 해안 정점이 된다. */
function clipPolyConvex(poly,clipped,tags,clip){
  let L=poly.map((p,k)=>({p,cl:clipped[k],tag:tags[k]}));
  let ar=0;for(let k=0;k<clip.length;k++){const a=clip[k],b=clip[(k+1)%clip.length];ar+=a[0]*b[1]-b[0]*a[1];}
  const sg=ar>0?1:-1;
  for(let k=0;k<clip.length&&L.length;k++){const a=clip[k],b=clip[(k+1)%clip.length];
    const side=q=>sg*((b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0]));const out=[];
    for(let i=0;i<L.length;i++){const A=L[i],B=L[(i+1)%L.length],sa=side(A.p),sb=side(B.p);
      if(sa>=0)out.push(A);
      if((sa>=0)!==(sb>=0)){const t=sa/(sa-sb);out.push({p:[lerp(A.p[0],B.p[0],t),lerp(A.p[1],B.p[1],t)],cl:true,tag:A.tag});}}
    L=out;}
  return {poly:L.map(q=>q.p),clipped:L.map(q=>!!q.cl),tags:L.map(q=>q.tag)};
}
/* ---------- 섬 / 키 ---------- */
/** floor : 이 값보다 작은 섬은 볼 필요가 없다(landSDF 가 본토 값을 넘겨 준다). 결과는 max(floor, 섬들) 이라 landSDF 값은 똑같다. */
function sdIslands(x,z,floor=-1e9){
  let d = floor;
  const U = v => { if (v > d) d = v; };
  /* 빠른 건너뛰기 (결과는 똑같다) : 이 섬이 지금 d 보다 커질 수 없으면 비싼 노이즈 계산을 하지 않는다.
     sdEll ≤ (1 − 중심거리/긴반지름)·짧은반지름 + |amp|,  sdBoxW ≤ 상자 안쪽 거리 + |amp|  (snoise 는 −1..1) */
  /* 모든 섬 타원이 같은 노이즈 snoise(x·0.006, z·0.006, 9) 를 쓴다 → 한 번만 계산해 나눠 쓴다 (sdEll 과 같은 식) */
  let nz = null;
  const UE = (cx,cz,a,b,rot=0,amp=0) => { const mx=a>b?a:b,mn=a<b?a:b;
    if ((1-Math.hypot(x-cx,z-cz)/mx)*mn + Math.abs(amp) < d - 1e-6) return;
    let dx=x-cx, dz=z-cz;
    if (rot){ const c=Math.cos(-rot), s=Math.sin(-rot); const nx=dx*c-dz*s; dz=dx*s+dz*c; dx=nx; }
    const r = Math.hypot(dx/a, dz/b);
    U((1-r)*Math.min(a,b) + (amp ? amp*(nz ?? (nz = snoise(x*0.006, z*0.006, 9))) : 0)); };
  const UB = (x0,x1,z0,z1,amp=0,frq=0.002,sd=1) => { if (Math.min(x-x0,x1-x,z-z0,z1-z) + Math.abs(amp) < d - 1e-6) return; U(sdBoxW(x,z,x0,x1,z0,z1,amp,frq,sd)); };
  // Miami Beach barrier island (남단 -320 → 북단 -6800)
  UB( 1450, 2170, -4980, -320, 30, 0.0019, 3);   // South~Mid~North Beach
  UB( 1560, 2130, -6800, -4880, 26, 0.0022, 5);  // Sunny Isles (좁고 김)
  UE( 1650, -110, 300, 92, 0, 8);                 // Fisher Island
  UB( 480, 1350, -560, -330, 12, 0.004, 7);      // Port of Miami (Dodge Is.) — 서쪽 끝을 Watson 섬 동쪽으로 물렸다(예전 120 : 섬과 겹쳤다)
  UE( 1300, -455, 150, 95, 0, 6);                 // Terminal Island
  UE( 230, -700, 235, 118, 0, 10);                // Watson Island
  UE( 700, -1000, 195, 128, .2, 10);              // Star Island
  UE( 1010, -1185, 128, 88, 0, 8);                // Palm Island
  UE( 1235, -1010, 118, 82, 0, 8);                // Hibiscus Island
  for (let i=0;i<5;i++) UE( 60+i*278, -1300+((i%2)?18:-18), 108, 60, 0, 7); // Venetian chain
  UE( 1520, 620, 435, 250, .1, 16);               // Virginia Key
  UB( 1330, 1905, 1080, 2500, 24, 0.0026, 13);   // Key Biscayne
  UE( 1420, 2680, 210, 130, 0, 10);               // 남쪽 작은 키
  UE( 1150, 3450, 260, 150, .3, 12);
  UE( 900, 4400, 190, 120, 0, 10);
  // 만 안의 맹그로브 작은 섬
  UE( 420, 320, 62, 40, 0, 5);
  UE( 780, 1250, 74, 48, 0, 5);
  UE( 300, 2100, 90, 55, 0, 6);
  UE( 640, -2500, 80, 50, 0, 6);
  UE( 900, -3400, 110, 62, 0, 7);
  UE( 500, -5400, 130, 70, 0, 7);
  // 섬 바깥 바다의 부속 도서 (실루엣에 리듬을 준다)
  UE( -8050, -900, 300, 180, 0.4, 22);
  UE( -7750, 2600, 240, 150, -0.3, 18);
  UE( -5600, 5250, 330, 190, 0.2, 22);
  UE( -1400, 5900, 380, 220, -0.4, 26);
  UE( -6900,-4600, 280, 170, 0.1, 20);
  UE( -8400, 3600, 190, 130, 0, 16);
  UE(  -900,-6600, 300, 180, 0.3, 20);
  return d;
}
/** 육지 SDF (양수 = 육지, 값 = 대략 해안까지 거리) */
function landSDF(x,z){
  const dm = sdMainland(x,z);
  let d = sdIslands(x,z,dm);                 // = max(본토, 섬들) — 본토보다 낮은 섬은 건너뛴다
  if (d > 0){                              // 운하 절단 (육지 안쪽에서만)
    const s = canalSDF(x,z);
    if (s < d) d = s;
  }
  // Haulover / Bal Harbour inlet
  const cut1 = Math.abs(z + 4930) - 46;  if (x > 1400 && cut1 < d) d = Math.max(cut1, -400);
  // 내륙 호수/늪 절단 (육지 안쪽에서만 — 해안선 실루엣은 건드리지 않는다)
  if (d > 0){
    const lk = lakeAt(x,z);
    if (lk.d > 0) d = Math.min(d, -lk.d);
  }
  return d;
}

/* ---------- 지면 높이 (마이애미는 평지, 해변만 완만) ---------- */
function ridgeH(x,z){ return 2.4*fbm(x*0.00016, z*0.00016, 3, 31) - 0.3; }
function groundY(x,z, sdf){
  const d = sdf===undefined ? landSDF(x,z) : sdf;
  if (d <= 0) return 0;
  const base = 2.0 + Math.max(0, ridgeH(x,z));
  return base * smoothstep(0, 34, d);
}


export {W,LAKES,landSDF,lakeAt,groundY};
