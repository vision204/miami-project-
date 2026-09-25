/* =====================================================================
   MIAMI 멀티플레이 중계 서버
   ---------------------------------------------------------------------
   같은 방의 위치·전투 이벤트를 중계하고 10초 수명의 채팅을 처리한다.
   물리·충돌·전투는 각자 브라우저에서 돌고, 서버는 판정하지 않는다.

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
import { Friends, validUid } from './friends.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const PORT = process.env.PORT || 8080;

/* 배포된 서버가 어느 버전인지 확인하는 표시.
   https://<주소>/stats 를 열어 "pvp":true 가 보이면 PvP 서버가 돌고 있는 것이다.
   안 보이면 GitHub 의 server.js 가 아직 옛 파일이거나 Render 가 재배포를 안 한 것이다. */
const BUILD = 'friends-1';

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
      build: BUILD, pvp: true, chat: true, friends: true, nearM: LIMITS.NEAR_M,
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
    /* 0:x 1:y 2:z 3:yaw 4:차량탑승 5:색 6:속도
       7:flags(1앉기 2공중 4조준 8발사 16사망 32무적) 8:무기 9:체력 */
    s: [0, 0, 0, 0, 0, 0, 0, 0, 0, 100],
    look: null,                   // 캐릭터 외형 (팔레트 번호 배열)
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
        num(m.s[6], 0, 200),          // 속도 (애니메이션용)
        num(m.s[7], 0, 255) | 0,      // 상태 플래그
        num(m.s[8], 0, 15) | 0,       // 무기
        num(m.s[9], 0, 100) | 0,      // 체력
        num(m.s[10], -1.6, 1.6),     // optional aircraft pitch; old clients default to 0
        num(m.s[11], -1.6, 1.6),     // optional aircraft roll
      ];
      if(!(peer.s[7]&128))peer.anchor=[peer.s[0],peer.s[2]];
      if(!peer.ready){peer.ready=true;for(const p of room.values())if(p.waiting){p.waiting=false;send(p.ws,{t:'spawn',spawn:{anchor:peer.anchor}});}}
    } else if (m.t === 'chat'){
      chat.receive(peer, m.text, message => send(ws,message));
    } else if (m.t === 'name'){
      peer.name = sanitizeName(m.name);
      broadcast(room, { t: 'join', id: peer.id, name: peer.name }, peer.id);
    } else if (m.t === 'hit'){
      /* PvP : 쏜 쪽이 '맞혔다'고 알리면 맞은 쪽에게 그대로 전달한다.
         실제로 피가 깎일지는 맞은 쪽이 정한다 (부활 직후 무적이면 무시).
         서버는 판정하지 않는다 — 물리·시야가 전부 브라우저에 있기 때문이다. */
      const target = room.get(num(m.id, 0, 1e9) | 0);
      if (target && target.id !== peer.id && !(peer.s[7]&128) && !(target.s[7]&128))
        send(target.ws, { t: 'hurt', from: peer.id, dmg: num(m.dmg, 0, 200), w: num(m.w, 0, 15) | 0 });
    } else if (m.t === 'look' && Array.isArray(m.v)){
      /* 캐릭터 외형 : 팔레트 번호만 오간다. 값 범위를 자르고 그대로 중계한다. */
      peer.look = m.v.slice(0, 8).map(x => num(x, 0, 255) | 0);
      broadcast(room, { t: 'look', id: peer.id, v: peer.look }, peer.id);
    } else if (m.t === 'died'){
      /* 죽은 쪽이 스스로 알린다. 모두에게 알려 킬 로그를 띄운다. */
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
    } else if (m.t === 'ping'){
      send(ws, { t: 'pong', c: m.c });
    }
  });

  const drop = () => {
    if (!room.has(peer.id)) return;
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
    for (const me of all){
      if (me.ws.readyState !== 1) continue;
      const others = [];
      for (const o of all){
        if (o.id === me.id || !o.ready) continue;
        const dx = o.s[0] - me.s[0], dz = o.s[2] - me.s[2];
        if (me.ready && dx*dx + dz*dz > NEAR2) continue;
        others.push([o.id, ...o.s.map(v => Math.round(v * 100) / 100)]);
      }
      if (others.length) me.ws.send(JSON.stringify({ t: 'snap', a: others }));
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
