/* =====================================================================
   MIAMI 멀티플레이 중계 서버
   ---------------------------------------------------------------------
   하는 일은 하나다 : 같은 방에 있는 사람들의 위치를 서로에게 전달한다.
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

const PORT = process.env.PORT || 8080;

/* 배포된 서버가 어느 버전인지 확인하는 표시.
   https://<주소>/stats 를 열어 "pvp":true 가 보이면 PvP 서버가 돌고 있는 것이다.
   안 보이면 GitHub 의 server.js 가 아직 옛 파일이거나 Render 가 재배포를 안 한 것이다. */
const BUILD = 'pvp-2';

/* 접속을 허용할 출처. 비워 두면 전부 허용(로컬 개발용).
   Render 대시보드에서 ALLOWED_ORIGINS 환경변수로 지정한다.
   예: https://sexmoneymuder2.netlify.app,http://localhost:8765 */
const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const LIMITS = {
  ROOMS: 50,            // 동시에 열 수 있는 방
  PER_ROOM: 16,         // 방 하나에 들어갈 수 있는 인원
  MSG_BYTES: 2048,      // 한 메시지 최대 크기
  RATE: 40,             // 초당 최대 메시지 수
  IDLE_MS: 25000,       // 이 시간 동안 조용하면 끊는다
  TICK_HZ: 15,          // 스냅샷 전송 주기
  NAME_MAX: 16,
};

/* ---------------------------------------------------------------------
   상태
   --------------------------------------------------------------------- */
const rooms = new Map();   // roomId -> Map(id -> peer)
let nextId = 1;

const roomOf = (id) => {
  let r = rooms.get(id);
  if (!r){ r = new Map(); rooms.set(id, r); }
  return r;
};

const sanitizeName = (s) =>
  String(s == null ? '' : s).replace(/[
