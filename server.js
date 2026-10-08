/* =====================================================================
   MIAMI 멀티플레이 중계 서버
   ---------------------------------------------------------------------
   같은 방의 위치·전투 이벤트를 중계하고 10초 수명의 채팅을 처리한다.
   도시 물리·충돌·전투는 브라우저에서 돈다. 골프의 발판·차례·공·타수는 서버가 판정한다.

   왜 이렇게 만들었나
   - 도시 생성이 완전히 결정론적이라(같은 시드 = 같은 도시) 맵을 보낼 필요가 없다.
     좌표만 주고받으면 서로 같은 건물 앞에 서 있게 된다.
   - 서버가 물리를 돌리면 32종 차량 물리를 서버에도 옮겨야 하는데, 친구 몇 명이
     같이 타는 규모에 그 복잡도는 과하다. 대신 '남을 밀어낼 수는 없다'
     (남의 차는 내 화면에서 통과한다) — 이건 의도한 한계다.

   실행
     npm install && npm start          (로컬 : ws://localhost:8080)
     Render 에서는 PORT 를 환경변수로 준다.
   ===================================================================== */
import http from 'http';
import { WebSocketServer } from 'ws';
import { RoomChat } from './chat.js';
import { Sports } from './sports.js';
import { Friends, validUid } from './friends.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const PORT = process.env.PORT || 8080;

/* 배포된 서버가 어느 버전인지 확인하는 표시.
   https://<주소>/stats 를 열어 "pvp":true 가 보이면 PvP 서버가 돌고 있는 것이다.
   안 보이면 GitHub 의 server.js 가 아직 옛 파일이거나 Render 가 재배포를 안 한 것이다. */
const BUILD = 'ctune-1';                      // 2026-10-08 : 차 튜닝 중계 'ctune' (older: basketball-pads-1)
// const BUILD_OLD = 'basketball-pads-1';           // 2026-10-03 : compact binary snapshots (older builds: war-1)

/* 접속을 허용할 출처. 비워 두면 전부 허용(로컬 개발용).
   Render 대시보드에서 ALLOWED_ORIGINS 환경변수로 지정한다.
   예: https://smm2online.com,https://www.smm2online.com,http://localhost:8765 */
const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const LIMITS = {
  ROOMS: 50,            // 동시에 열 수 있는 방
  PER_ROOM: 120,        // 방 하나에 들어갈 수 있는 인원 (가까운 사람만 보내므로 크게 잡아도 된다)
  MSG_BYTES: 2048,      // 한 메시지 최대 크기
  RATE: 40,             // 초당 최대 메시지 수
  IDLE_MS: 25000,       // 이 시간 동안 조용하면 끊는다
  TICK_HZ: 15,          // 스냅샷 전송 주기
  NAME_MAX: 16,
  NEAR_M: 1000,         // 이 거리 안의 사람만 스냅샷에 넣는다 (클라이언트는 900 m 까지 그린다)
  FRIEND_EVERY: 15,     // 친구 위치는 15틱(=1초)에 한 번
};

/* ---------------------------------------------------------------------
   로그인 확인 — Firebase ID 토큰을 구글 공개키로 검사한다
   --------------------------------------------------------------------- */
const FB_PROJECT = process.env.FIREBASE_PROJECT_ID || 'smm2-505da';
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
async function verifyUid(token){
  /* 로컬 시험 전용 : MIAMI_TEST_AUTH=1 일 때만 'test:<uid>' 를 받는다. Render 에는 이 변수를 넣지 마세요. */
  if (process.env.MIAMI_TEST_AUTH === '1' && String(token).startsWith('test:')) { const u = String(token).slice(5); return validUid(u) ? u : null; }
  const { payload } = await jwtVerify(String(token || ''), JWKS, { issuer: 'https://securetoken.google.com/' + FB_PROJECT, audience: FB_PROJECT });
  return validUid(payload.sub) ? payload.sub : null;
}
const friends = new Friends();

/* ---------------------------------------------------------------------
   상태
   --------------------------------------------------------------------- */
const rooms = new Map();   // roomId -> Map(id -> peer)
const chat = new RoomChat((roomId, message) => { const room=rooms.get(roomId); if(room)broadcast(room,message); });
setInterval(() => chat.tick(), 50).unref();
const sports = new Sports(rooms,send,broadcast);
setInterval(()=>sports.tick(),100).unref();
let nextId = 1;

const roomOf = (id) => {
  let r = rooms.get(id);
  if (!r){ r = new Map(); rooms.set(id, r); }
  return r;
};

const sanitizeName = (s) =>
  String(s == null ? '' : s).replace(/[\x00-\x1f<>]/g, '').trim().slice(0, LIMITS.NAME_MAX)
  || '플레이어';

const sanitizeRoom = (s) =>
  (String(s == null ? '' : s).match(/[A-Za-z0-9_-]{1,24}/) || ['lobby'])[0];

const num = (v, lo, hi) => {
  const n = +v;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0;
};

/* ---------------------------------------------------------------------
   HTTP (Render 헬스체크 + 상태 확인용)
   --------------------------------------------------------------------- */
const server = http.createServer((req, res) => {
  if (req.url === '/healthz'){ res.writeHead(200); res.end('ok'); return; }
  if (req.url === '/stats'){
    const body = JSON.stringify({
      /* build/pvp 는 '지금 돌고 있는 서버가 새 버전인지' 확인하는 표시다.
         브라우저로 /stats 를 열어서 pvp:true 가 보이면 PvP 서버가 맞다. */
      build: BUILD, basketball: true, golf: true, sportsPads: true, sp: true, war: true, pvp: true, chat: true, friends: true, rank: true, bin: true, ctune: true, nearM: LIMITS.NEAR_M,
      /* 스냅샷으로 나간 양 (서버가 켜진 뒤 누적). json 은 옛 화면에 보낸 양이다. */
      snapMB: { bin: +(OUT.bin / 1048576).toFixed(2), json: +(OUT.json / 1048576).toFixed(2) },
      rooms: [...rooms].map(([id, r]) => ({ id, players: r.size })),
      total: [...rooms.values()].reduce((a, r) => a + r.size, 0),
      uptimeSec: Math.round(process.uptime()),
    });
    res.writeHead(200, { 'Content-Type': 'application/json',
                         'Access-Control-Allow-Origin': '*' });
    res.end(body);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('MIAMI multiplayer relay. 접속은 WebSocket 으로 하세요.\n');
});

const wss = new WebSocketServer({
  server,
  maxPayload: LIMITS.MSG_BYTES,
  verifyClient: (info, done) => {
    if (!ALLOWED.length) return done(true);
    const o = info.origin || '';
    done(ALLOWED.includes(o), 403, 'origin not allowed');
  },
});

/* ---------------------------------------------------------------------
   연결
   --------------------------------------------------------------------- */
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const roomId = sanitizeRoom(url.searchParams.get('room') || 'lobby');

  if (!rooms.has(roomId) && rooms.size >= LIMITS.ROOMS){
    ws.close(1013, 'too many rooms'); return;
  }
  const room = roomOf(roomId);
  if (room.size >= LIMITS.PER_ROOM){ ws.close(1013, 'room full'); return; }

  const peer = {
    id: nextId++,
    ws, roomId,
    name: sanitizeName(url.searchParams.get('name')),
    bin: url.searchParams.get('bin') === '1',   // 새 화면만 압축 스냅샷을 받는다 (옛 화면은 예전 JSON 그대로)
    known: new Map(),
    /* 0:x 1:y 2:z 3:yaw 4:차량탑승 5:색 6:속도
       7:flags(1앉기 2공중 4조준 8발사 16사망 32무적) 8:무기 9:체력 */
    s: [0, 0, 0, 0, 0, 0, 0, 0, 0, 100],
    look: null,                   // 캐릭터 외형 (팔레트 번호 배열)
    ctune: null,                  // 탄 차 튜닝 (숫자 배열, 튜닝 샵 2026-10-08)
    uid: null, friends: new Set(),  // 로그인 확인 뒤 채운다
    seen: Date.now(),
    count: 0, window: Date.now(),
  };
  const leader=[...room.values()][0];peer.ready=false;peer.waiting=!!leader&&!leader.ready;
  room.set(peer.id, peer);

  send(ws, { t: 'welcome', id: peer.id, room: roomId, hz: LIMITS.TICK_HZ, spawn: !leader?{random:true}:leader.ready?{anchor:leader.anchor||[leader.s[0],leader.s[2]]}:{wait:true} });
  send(ws, {t:'chat_state', messages:chat.snapshot(roomId), serverNow:Date.now()});
  /* 새로 들어온 사람에게 기존 인원의 이름을 먼저 알려준다.
     (예전에는 이걸 별도 connection 핸들러 + setTimeout 으로 했는데,
      두 명이 동시에 들어오면 join 이 중복으로 갔다) */
  for (const p of room.values())
    if (p.id !== peer.id){
      send(ws, { t: 'join', id: p.id, name: p.name });
      if (p.look) send(ws, { t: 'look', id: p.id, v: p.look });
      if (p.ctune) send(ws, { t: 'ctune', id: p.id, v: p.ctune });
    }
  broadcast(room, { t: 'join', id: peer.id, name: peer.name }, peer.id);

  ws.on('message', (buf) => {
    peer.seen = Date.now();
    /* 초당 메시지 수 제한 — 한 명이 서버를 독차지하지 못하게 */
    const now = Date.now();
    if (now - peer.window > 1000){ peer.window = now; peer.count = 0; }
    if (++peer.count > LIMITS.RATE) return;

    let m;
    try { m = JSON.parse(buf); } catch { return; }
    if (!m || typeof m !== 'object') return;

    if (m.t === 's' && Array.isArray(m.s) && m.s.length >= 5){
      peer.s = [
        num(m.s[0], -20000, 20000),   // x
        num(m.s[1], -500, 5000),      // y
        num(m.s[2], -20000, 20000),   // z
        num(m.s[3], -7, 7),           // yaw
        m.s[4] ? 1 : 0,               // 차량 탑승 여부
        num(m.s[5], 0, 65535) | 0,    // vehicle catalog index; 65535 = unknown
        num(m.s[6], 0, 600),          // 속도 (애니메이션용 · 전투기 시속 2000km = 556 m/s)
        num(m.s[7], 0, 255) | 0,      // 상태 플래그
        num(m.s[8], 0, 63) | 0,       // 무기 (0~63 — 총 26정, tools/arsenal.js)
        num(m.s[9], 0, 100) | 0,      // 체력
        num(m.s[10], -1.6, 1.6),     // optional aircraft pitch; old clients default to 0
        num(m.s[11], -3.2, 3.2),     // optional aircraft roll (a full barrel roll: ±π)
      ];
      if(sports.protected(peer)){peer.s[7]=(peer.s[7]&~(4|8|16|64))|32;peer.s[8]=0;peer.s[4]=0;peer.s[6]=0;}
      sports.basket.place(peer);
      if(!(peer.s[7]&128))peer.anchor=[peer.s[0],peer.s[2]];
      if(!peer.ready){peer.ready=true;for(const p of room.values())if(p.waiting){p.waiting=false;send(p.ws,{t:'spawn',spawn:{anchor:peer.anchor}});}}
    } else if (m.t === 'golf'){
      sports.receive(peer,m);
    } else if (m.t === 'basket'){
      sports.basket.receive(peer,m);
    } else if (m.t === 'warfx'){
      if(sports.protected(peer))return;
      // Cosmetic events only: retain existing hit validation, never apply damage here.
      const vec = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
      if (!peer.ready || (peer.s[7] & (16|128)) || !vec(m.o) || typeof m.id !== 'string' || !/^[a-zA-Z0-9_-]{1,32}$/.test(m.id)) return;
      if (Math.hypot(m.o[0]-peer.s[0],m.o[1]-peer.s[1],m.o[2]-peer.s[2])>6000) return;
      if (now-(peer.fxWindow||0)>1000){peer.fxWindow=now;peer.fxCount=0;}
      if ((peer.fxCount=(peer.fxCount||0)+1)>12) return;
      if(m.phase==='pose'){
        if(!Array.isArray(m.pose)||m.pose.length!==5||!m.pose.every(Number.isFinite)||!peer.s[4])return;
        const pose=[num(m.pose[0],-7,7),num(m.pose[1],-.2,1.1),num(m.pose[2],0,1),num(m.pose[3],0,1),num(m.pose[4],0,1)];
        broadcastNear(room,peer,{t:'warfx',from:peer.id,phase:'pose',id:'pose',o:m.o,pose});   // 포탑 자세는 보이는 거리의 사람에게만
      } else if(m.phase==='drone'){
        if(!vec(m.d)||Math.hypot(m.o[0]-peer.s[0],m.o[1]-peer.s[1],m.o[2]-peer.s[2])>2300)return;
        broadcast(room,{t:'warfx',from:peer.id,phase:'drone',id:'drone',o:m.o,d:m.d},peer.id);
      } else if (m.phase==='launch'){
        if (!vec(m.d) || !['missile','shell'].includes(m.kind)) return;
        const len=Math.hypot(...m.d);if(len<.5||len>1.5)return;
        const target=vec(m.target)&&m.target.every(v=>Math.abs(v)<22000)?m.target:null;
        broadcast(room,{t:'warfx',from:peer.id,phase:'launch',id:m.id,kind:m.kind,o:m.o,d:m.d.map(v=>v/len),target},peer.id);
      } else if(m.phase==='impact') broadcast(room,{t:'warfx',from:peer.id,phase:'impact',id:m.id,o:m.o},peer.id);
    } else if (m.t === 'sp'){
      /* 골프 · 농구 슛 대결 (sp-1) : 가벼운 전달만 한다. 판정은 각자 브라우저가 한다.
         보낸 사람 번호(id)는 서버가 붙이고, 값은 숫자 12개까지만 다시 만들어 보낸다. */
      if (!peer.ready || (peer.s[7] & 128)) return;
      if (now-(peer.spWindow||0)>1000){peer.spWindow=now;peer.spCount=0;}
      if ((peer.spCount=(peer.spCount||0)+1)>30) return;
      if (!['golf','hoop'].includes(m.g) || !['join','st','bye','sit','go','shot','sc'].includes(m.k) || !Array.isArray(m.d) || m.d.length>12) return;
      const d = m.d.map(v => Number.isFinite(v) ? Math.max(-1e13, Math.min(1e13, v)) : 0);
      broadcastNear(room, peer, { t:'sp', id:peer.id, g:m.g, k:m.k, d });
    } else if (m.t === 'pp'){
      /* 학교 탁구 (pp-1) : 경기 신호를 가까운 사람에게 전달만 한다. 판정은 브라우저가 한다(받는 쪽이 맞혔는지 스스로 정한다).
         값은 여기서 다시 만들어 보낸다 — 보낸 사람 번호(id)는 서버가 붙인다. */
      if (!peer.ready || (peer.s[7] & 128)) return;
      if (now-(peer.ppWindow||0)>1000){peer.ppWindow=now;peer.ppCount=0;}
      if ((peer.ppCount=(peer.ppCount||0)+1)>40) return;
      const k = m.k; if (!['sit','stand','pad','shot','point','end'].includes(k)) return;
      const out = sports.pp(peer,m); if(!out)return;
      const v3 = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) ? v.map(x => num(x,-25,25)) : null;
      if (k === 'pad') out.c = num(m.c,-1.2,1.2);
      else if (k === 'shot'){ out.p = v3(m.p); out.v = v3(m.v); if (!out.p || !out.v) return; out.n = num(m.n,0,500)|0; }
      if (k === 'shot' || k === 'point' || k === 'end'){
        if (Array.isArray(m.sc) && m.sc.length === 2 && m.sc.every(Number.isFinite)) out.sc = [num(m.sc[0],0,9)|0, num(m.sc[1],0,9)|0];
        else if (k === 'point') return;
      }
      if(k==='sit'||k==='stand')broadcast(room,out);else broadcastNear(room, peer, out);
    } else if (m.t === 'chat'){
      chat.receive(peer, m.text, message => send(ws,message));
    } else if (m.t === 'name'){
      peer.name = sanitizeName(m.name);
      broadcast(room, { t: 'join', id: peer.id, name: peer.name }, peer.id);
    } else if (m.t === 'hit'){
      /* PvP : 쏜 쪽이 '맞혔다'고 알리면 맞은 쪽에게 그대로 전달한다.
         실제로 피가 깎일지는 맞은 쪽이 정한다 (부활 직후 무적이면 무시).
         서버는 판정하지 않는다 — 물리·시야가 전부 브라우저에 있기 때문이다. */
      if(sports.protected(peer))return;
      const target = room.get(num(m.id, 0, 1e9) | 0);
      if (target && !sports.protected(target) && target.id !== peer.id && !(peer.s[7]&128) && !(target.s[7]&128))
        send(target.ws, { t: 'hurt', from: peer.id, dmg: num(m.dmg, 0, 200), w: num(m.w, 0, 63) | 0 });
    } else if (m.t === 'look' && Array.isArray(m.v)){
      /* 캐릭터 외형 : 팔레트 번호만 오간다. 값 범위를 자르고 그대로 중계한다. */
      peer.look = m.v.slice(0, 12).map(x => num(x, 0, 255) | 0);
      broadcast(room, { t: 'look', id: peer.id, v: peer.look }, peer.id);
    } else if (m.t === 'ctune' && Array.isArray(m.v)){
      /* 차 튜닝 (2026-10-08) : 색·휠·스포일러 같은 번호만 오간다. 값 범위를 자르고 그대로 중계한다. */
      peer.ctune = m.v.slice(0, 16).map(x => num(x, 0, 255) | 0);
      broadcast(room, { t: 'ctune', id: peer.id, v: peer.ctune }, peer.id);
    } else if (m.t === 'died'){
      /* 죽은 쪽이 스스로 알린다. 모두에게 알려 킬 로그를 띄운다. */
      if(sports.protected(peer))return;
      broadcast(room, { t: 'dead', id: peer.id, by: num(m.by, 0, 1e9) | 0 }, null);
    } else if (m.t === 'auth' && !peer.uid && !peer.authing){
      /* 로그인 토큰 확인 → 친구 기능 켜기. 실패해도 게임(가까운 사람 보기)은 그대로 된다. */
      peer.authing = true;
      verifyUid(m.token).then(uid => {
        peer.authing = false;
        if (!uid || !room.has(peer.id)) { send(ws, { t: 'authfail' }); return; }
        const r = friends.attach(peer, uid, m.friends);
        send(ws, { t: 'authok', code: peer.code, incoming: r.incoming, added: r.added });
      }).catch(() => { peer.authing = false; send(ws, { t: 'authfail' }); });
    } else if (m.t === 'freq'){
      /* 친구 요청 : 코드(어디 있든) 또는 근처 사람의 번호 */
      let target = null;
      if (m.code) target = friends.byCode(m.code);
      else { const o = room.get(num(m.id, 0, 1e9) | 0); if (o && Math.hypot(o.s[0]-peer.s[0], o.s[2]-peer.s[2]) <= LIMITS.NEAR_M) target = o; }
      const r = friends.request(peer, target);
      send(ws, { t: 'freq_res', ok: r.ok, msg: r.msg, added: r.added || null });
      for (const p of r.notify || []) send(p.ws, { t: r.added ? 'fadd' : 'freq_in', ...r.payload });
    } else if (m.t === 'fresp' && peer.uid){
      const r = friends.respond(peer, String(m.uid || ''), !!m.ok);
      send(ws, { t: 'freq_res', ok: r.ok, msg: r.msg });
      if (r.added) for (const p of friends.online.get(peer.uid) || []) send(p.ws, { t: 'fadd', ...r.added });
      for (const p of r.notify || []) send(p.ws, { t: 'fadd', ...r.payload });
    } else if (m.t === 'fdel' && peer.uid){
      const uid = String(m.uid || '');
      const r = friends.remove(peer, uid);
      for (const p of r.notify || []) send(p.ws, { t: 'fdel', uid: peer.uid });
    } else if (m.t === 'cash'){
      /* 서버 순위표 : 각자 자기 돈을 알린다 (조작은 막을 수 없다 — 표시용) */
      peer.cash = Math.floor(num(m.v, 0, 1e12));
    } else if (m.t === 'rank'){
      /* 지금 이 서버에 접속한 모든 사람(모든 방) — 돈 많은 순 */
      const all = [];
      for (const r of rooms.values()) for (const p of r.values())
        if (Number.isFinite(p.cash)) all.push({ id: p.id, name: p.name, cash: p.cash });
      all.sort((a, b) => b.cash - a.cash || a.id - b.id);
      const mine = all.findIndex(r => r.id === peer.id);
      send(ws, { t: 'rank', rows: all.slice(0, 20), me: peer.id, myRank: mine >= 0 ? mine + 1 : 0, total: all.length });
    } else if (m.t === 'ping'){
      send(ws, { t: 'pong', c: m.c });
    }
  });

  const drop = () => {
    if (!room.has(peer.id)) return;
    sports.drop(peer);
    room.delete(peer.id); friends.detach(peer);
    for(const p of room.values())if(p.waiting){p.waiting=false;send(p.ws,{t:"spawn",spawn:{random:true}});break;}
    broadcast(room, { t: 'bye', id: peer.id });
    if (!room.size) { rooms.delete(roomId); chat.drop(roomId); }
  };
  ws.on('close', drop);
  ws.on('error', drop);
});

function send(ws, obj){
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}
function broadcast(room, obj, exceptId){
  const msg = JSON.stringify(obj);
  for (const p of room.values())
    if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(msg);
}

/** 가까운 사람(스냅샷과 같은 범위)에게만 보낸다 */
function broadcastNear(room, from, obj){
  const msg = JSON.stringify(obj);
  for (const p of room.values()){
    if (p.id === from.id || p.ws.readyState !== 1) continue;
    const dx = p.s[0] - from.s[0], dz = p.s[2] - from.s[2];
    if (p.ready && dx*dx + dz*dz > NEAR2) continue;
    p.ws.send(msg);
  }
}

/* ---------------------------------------------------------------------
   압축 스냅샷 (2026-10-03)
   ---------------------------------------------------------------------
   전송량이 곧 Render 요금이라, 같은 내용을 JSON 글자 대신 바이트로 보낸다.
   화면에 보이는 값은 예전과 같거나 더 정밀하다 (위치 1cm, 방향 0.00025rad).

   프레임 : [1] 뒤에 사람마다
     u32  id*2 + full      full=0 이면 '지난 틱과 똑같다' — 뒤에 아무것도 없다 (4바이트)
     i24×3 x,y,z (cm) · i16 yaw×4000 · u8 flags · u8 무기 · u8 체력 · u16 속도×10 · u8 mode
     mode&1 = 차량(긴 형식) : u16 차종 · i16 pitch×10000 · i16 roll×10000
     아니면 (걷는 사람)      : i16 자세×10000
   받는 사람마다 '지난 틱에 무엇을 보냈는지' 기억한다. 지난 틱에 안 보낸 사람,
   값이 바뀐 사람, 2초가 지난 사람은 전체를 다시 보낸다. */
const OUT = { bin: 0, json: 0 };
const q = (v, k, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v * k)));
function packPeer(o){
  const s = o.s, long = !!s[4] || !!s[11], b = Buffer.allocUnsafe(long ? 23 : 19);
  b.writeIntLE(q(s[0], 100, -8388607, 8388607), 0, 3);
  b.writeIntLE(q(s[1], 100, -8388607, 8388607), 3, 3);
  b.writeIntLE(q(s[2], 100, -8388607, 8388607), 6, 3);
  b.writeInt16LE(q(s[3], 4000, -32767, 32767), 9);
  b.writeUInt8(s[7] & 255, 11); b.writeUInt8(s[8] & 255, 12); b.writeUInt8(s[9] & 255, 13);
  b.writeUInt16LE(q(s[6], 10, 0, 65535), 14);
  b.writeUInt8((s[4] ? 1 : 0) | (long ? 2 : 0), 16);
  if (long){
    b.writeUInt16LE(s[5] & 65535, 17);
    b.writeInt16LE(q(s[10] || 0, 10000, -32767, 32767), 19);
    b.writeInt16LE(q(s[11] || 0, 10000, -32767, 32767), 21);
  } else b.writeInt16LE(q(s[10] || 0, 10000, -32767, 32767), 17);
  if (!o.pack || !o.pack.equals(b)){ o.pack = b; o.ver = (o.ver || 0) + 1; }
}
const SNAP_HEAD = Buffer.from([1]), REFRESH_TICKS = 30;

/* ---------------------------------------------------------------------
   스냅샷 전송 — 가까운 사람만 (관심 범위)
   ---------------------------------------------------------------------
   예전에는 방 전원의 위치를 모두에게 보냈다(16명 방 기준 1인 11.6 KB/s).
   이제 NEAR_M 안의 사람만 넣는다. 멀리 있는 친구는 1초에 한 번 x·z 만 따로 보낸다
   (지도 표시용). 보낼 사람이 없으면 스냅샷을 아예 보내지 않는다. */
let tickNo = 0;
const NEAR2 = LIMITS.NEAR_M * LIMITS.NEAR_M;
setInterval(() => {
  const now = Date.now(), friendTick = (++tickNo % LIMITS.FRIEND_EVERY) === 0;
  for (const [roomId, room] of rooms){
    for (const p of [...room.values()]){
      if (now - p.seen > LIMITS.IDLE_MS){ p.ws.close(1000, 'idle'); room.delete(p.id); friends.detach(p); }
    }
    if (!room.size){ rooms.delete(roomId); chat.drop(roomId); continue; }
    if (room.size < 2) continue;

    /* 각자에게 '나를 뺀, 가까운 사람' 목록을 보낸다 */
    const all = [...room.values()];
    if (all.some(p => p.bin)) for (const o of all) if (o.ready) packPeer(o);
    for (const me of all){
      if (me.ws.readyState !== 1) continue;
      if (me.bin){
        const parts = [SNAP_HEAD], known = new Map();
        for (const o of all){
          if (o.id === me.id || !o.ready) continue;
          const dx = o.s[0] - me.s[0], dz = o.s[2] - me.s[2];
          if (me.ready && dx*dx + dz*dz > NEAR2) continue;
          const k = me.known.get(o.id), full = !k || k.ver !== o.ver || tickNo - k.at >= REFRESH_TICKS;
          const head = Buffer.allocUnsafe(4); head.writeUInt32LE(o.id * 2 + (full ? 1 : 0), 0);
          parts.push(head); if (full) parts.push(o.pack);
          known.set(o.id, full ? { ver: o.ver, at: tickNo } : k);
        }
        me.known = known;
        if (parts.length > 1){ const buf = Buffer.concat(parts); OUT.bin += buf.length; me.ws.send(buf); }
        continue;
      }
      const others = [];
      for (const o of all){
        if (o.id === me.id || !o.ready) continue;
        const dx = o.s[0] - me.s[0], dz = o.s[2] - me.s[2];
        if (me.ready && dx*dx + dz*dz > NEAR2) continue;
        others.push([o.id, ...o.s.map(v => Math.round(v * 100) / 100)]);
      }
      if (others.length){ const msg = JSON.stringify({ t: 'snap', a: others }); OUT.json += msg.length; me.ws.send(msg); }
    }
  }
  /* 친구 위치 (1초에 한 번) : 서로 친구인 접속 중인 사람의 x·z. 방이 달라도 보낸다. */
  if (friendTick){
    for (const set of friends.online.values()) for (const me of set){
      if (me.ws.readyState !== 1 || (!me.friends.size && !me.frSent)) continue;
      const a = [];
      for (const uid of me.friends){
        for (const o of friends.online.get(uid) || []){
          if (!o.ready || !friends.mutual(me, o)) continue;
          a.push([o.uid, o.roomId === me.roomId ? o.id : 0, Math.round(o.s[0]), Math.round(o.s[2]), o.s[4], o.name]);
          break;
        }
      }
      if (a.length || me.frSent) me.ws.send(JSON.stringify({ t: 'fr', a }));   // 비었으면 한 번만 알린다
      me.frSent = a.length > 0;
    }
  }
}, Math.round(1000 / LIMITS.TICK_HZ));

server.listen(PORT, () => {
  console.log(`MIAMI relay listening on :${PORT}`);
  console.log(ALLOWED.length ? `허용 출처: ${ALLOWED.join(', ')}` : '출처 제한 없음 (개발 모드)');
});
