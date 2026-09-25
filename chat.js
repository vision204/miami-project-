// Ephemeral room chat: text lives only in memory for ten seconds, never in logs/storage.
export const CHAT_TTL = 10000;
export class RoomChat {
  constructor(broadcast, clock = Date.now) {
    this.broadcast = broadcast; this.clock = clock; this.rooms = new Map(); this.serial = 0;
  }
  snapshot(room) {
    this.prune(room);
    return [...(this.rooms.get(room)?.values() || [])];
  }
  prune(room) {
    const entries = this.rooms.get(room); if (!entries) return;
    const ids = [], now = this.clock();
    for (const [id, message] of entries) if (message.expiresAt <= now) { entries.delete(id); ids.push(id); }
    if (!entries.size) this.rooms.delete(room);
    if (ids.length) this.broadcast(room, {t:'chat_delete', ids});
  }
  tick() { for (const room of this.rooms.keys()) this.prune(room); }
  drop(room) { this.rooms.delete(room); }
  receive(peer, raw, send) {
    const now = this.clock();
    if ((peer.chatUntil || 0) > now) { send({t:'chat_limit', until:peer.chatUntil, serverNow:now}); return; }
    if (typeof raw !== 'string') return;
    const text = raw.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 200);
    if (!text) return;
    peer.chatTimes = (peer.chatTimes || []).filter(t => t > now - CHAT_TTL);
    peer.chatTimes.push(now);
    const message = {id:++this.serial, from:peer.id, name:peer.name, text, expiresAt:now + CHAT_TTL};
    this.prune(peer.roomId);
    if (!this.rooms.has(peer.roomId)) this.rooms.set(peer.roomId, new Map());
    this.rooms.get(peer.roomId).set(message.id, message);
    this.broadcast(peer.roomId, {t:'chat', message, serverNow:now});
    if (peer.chatTimes.length >= 5) {
      peer.chatUntil = now + CHAT_TTL; peer.chatTimes = [];
      send({t:'chat_limit', until:peer.chatUntil, serverNow:now});
    }
  }
}
