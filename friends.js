// Friends: verified Firebase uid per connection, friend requests/accepts, mutual-only location sharing.
/* 친구 관계
   - 누가 누구인지는 Firebase 로그인 토큰으로 확인한다(토큰 검사는 server.js).
   - 친구 목록 원본은 각자의 Firestore 문서(players/{uid}.friends)다. 접속할 때 클라이언트가 목록을 알려 준다.
   - 멀리 있는 위치는 '서로' 상대를 목록에 둔 경우에만 보낸다. 한쪽이 억지로 목록에 넣어도 상대가 수락하지 않았으면 안 보인다.
   - 요청·수락 대기는 서버 메모리에만 둔다(7일). 서버가 다시 시작되면 대기 중인 요청은 사라진다. */
import crypto from 'node:crypto';

const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 헷갈리는 0/O, 1/I 는 뺐다
export const FRIEND_LIMITS = { MAX: 200, PENDING_PER_TARGET: 50, REQ_PER_HOUR: 30, TTL_MS: 7 * 24 * 3600 * 1000 };
const UID_RE = /^[A-Za-z0-9_-]{6,128}$/;

/** uid → 6자리 친구 코드 (항상 같다) */
export function friendCode(uid){
  const h = crypto.createHash('sha256').update('miami-friend:' + uid).digest();
  let s = ''; for (let i = 0; i < 6; i++) s += ALPH[h[i] % 32]; return s;
}
export const validUid = (u) => typeof u === 'string' && UID_RE.test(u);

export class Friends {
  constructor(clock = Date.now){
    this.clock = clock;
    this.online = new Map();    // uid -> Set(peer)
    this.pending = new Map();   // 받는 uid -> Map(보낸 uid -> {name, code, at})
    this.accepted = new Map();  // 요청한 uid -> Map(수락한 uid -> {name, code, at}) : 요청한 쪽이 꺼져 있을 때 보관
  }
  /** 로그인 확인이 끝난 접속을 등록한다. 밀린 요청·수락을 돌려준다. */
  attach(peer, uid, list){
    peer.uid = uid; peer.code = friendCode(uid);
    peer.friends = new Set((Array.isArray(list) ? list : []).filter(validUid).slice(0, FRIEND_LIMITS.MAX));
    peer.reqTimes = [];
    let set = this.online.get(uid); if (!set){ set = new Set(); this.online.set(uid, set); } set.add(peer);
    this.expire();
    const incoming = [...(this.pending.get(uid) || new Map())].map(([from, v]) => ({ uid: from, name: v.name, code: v.code }));
    const added = [...(this.accepted.get(uid) || new Map())].map(([who, v]) => ({ uid: who, name: v.name, code: v.code }));
    for (const a of added) peer.friends.add(a.uid);
    this.accepted.delete(uid);
    return { incoming, added };
  }
  detach(peer){
    if (!peer.uid) return;
    const set = this.online.get(peer.uid);
    if (set){ set.delete(peer); if (!set.size) this.online.delete(peer.uid); }
  }
  /** 서로 친구인가 */
  mutual(a, b){ return !!(a.uid && b.uid && a.uid !== b.uid && a.friends?.has(b.uid) && b.friends?.has(a.uid)); }
  byCode(code){
    const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (const set of this.online.values()) for (const p of set) if (p.code === c) return p;
    return null;
  }
  expire(){
    const old = this.clock() - FRIEND_LIMITS.TTL_MS;
    for (const store of [this.pending, this.accepted])
      for (const [k, m] of store){ for (const [f, v] of m) if (v.at < old) m.delete(f); if (!m.size) store.delete(k); }
  }
  /** 요청 보내기. target 은 접속 중인 상대(peer). 돌려준 값의 msg 를 그대로 보여 준다. */
  request(from, target){
    if (!from.uid) return { ok: false, msg: '로그인이 확인되지 않았습니다. 다시 접속해 주세요.' };
    if (!target || !target.uid) return { ok: false, msg: '상대를 찾을 수 없습니다. 접속 중인 사람에게만 보낼 수 있어요.' };
    if (target.uid === from.uid) return { ok: false, msg: '나 자신은 친구로 추가할 수 없어요.' };
    if (this.mutual(from, target)) return { ok: false, msg: '이미 친구입니다.' };
    const now = this.clock();
    from.reqTimes = (from.reqTimes || []).filter(t => now - t < 3600e3);
    if (from.reqTimes.length >= FRIEND_LIMITS.REQ_PER_HOUR) return { ok: false, msg: '요청을 너무 많이 보냈어요. 잠시 뒤 다시 시도해 주세요.' };
    // 상대가 이미 나에게 요청했다면 → 바로 서로 친구
    const back = this.pending.get(from.uid);
    if (back?.has(target.uid)){ const r = this.respond(from, target.uid, true); return { ...r, msg: target.name + ' 님과 친구가 되었어요.' }; }
    let m = this.pending.get(target.uid); if (!m){ m = new Map(); this.pending.set(target.uid, m); }
    if (m.size >= FRIEND_LIMITS.PENDING_PER_TARGET && !m.has(from.uid)) return { ok: false, msg: '상대가 받은 요청이 너무 많아요.' };
    m.set(from.uid, { name: from.name, code: from.code, at: now });
    from.reqTimes.push(now);
    from.friends.add(target.uid);         // 내가 원한다는 표시. 상대가 수락해야 서로 보인다.
    return { ok: true, msg: target.name + ' 님에게 친구 요청을 보냈어요.', notify: [...(this.online.get(target.uid) || [])], payload: { uid: from.uid, name: from.name, code: from.code } };
  }
  /** 받은 요청에 답하기 */
  respond(peer, fromUid, accept){
    const m = this.pending.get(peer.uid), req = m?.get(fromUid);
    if (!req) return { ok: false, msg: '요청이 만료되었거나 없습니다.' };
    m.delete(fromUid); if (!m.size) this.pending.delete(peer.uid);
    if (!accept) return { ok: true, msg: '요청을 거절했어요.' };
    // 수락한 쪽의 모든 접속에 추가
    for (const p of this.online.get(peer.uid) || []) p.friends.add(fromUid);
    const other = [...(this.online.get(fromUid) || [])];
    const mine = { uid: peer.uid, name: peer.name, code: peer.code };
    if (other.length) for (const p of other) p.friends.add(peer.uid);
    else { let a = this.accepted.get(fromUid); if (!a){ a = new Map(); this.accepted.set(fromUid, a); } a.set(peer.uid, { name: peer.name, code: peer.code, at: this.clock() }); }
    return { ok: true, msg: req.name + ' 님과 친구가 되었어요.', added: { uid: fromUid, name: req.name, code: req.code }, notify: other, payload: mine };
  }
  /** 친구 끊기 : 양쪽 목록에서 뺀다 */
  remove(peer, uid){
    for (const p of this.online.get(peer.uid) || []) p.friends.delete(uid);
    const other = [...(this.online.get(uid) || [])];
    for (const p of other) p.friends.delete(peer.uid);
    this.pending.get(peer.uid)?.delete(uid); this.pending.get(uid)?.delete(peer.uid);
    return { notify: other };
  }
}
