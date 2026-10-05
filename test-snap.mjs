// node test-snap.mjs — 압축 스냅샷이 JSON 스냅샷과 같은 값을 주는지, 얼마나 줄었는지 본다.
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import assert from 'assert';
import { WebSocket } from 'ws';
const src = readFileSync(new URL('../assets/cloud/mp.js', import.meta.url), 'utf8');
const fn = src.slice(src.indexOf('function unpackSnap'), src.indexOf('function connect(){'));
const unpackSnap = new Function(fn + ';return unpackSnap;')();
const PORT = 18000 + Math.floor(Math.random() * 900), srv = spawn(process.execPath, ['server.js'], { cwd: new URL('.', import.meta.url).pathname, env: { ...process.env, PORT, ALLOWED_ORIGINS: '' }, stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(900);
const open = (name, bin) => new Promise(res => { const ws = new WebSocket(`ws://localhost:${PORT}/?room=t&name=${name}${bin ? '&bin=1' : ''}`); ws.binaryType = 'arraybuffer';
  const c = { ws, id: 0, bytes: 0, snaps: 0, peers: new Map() };
  ws.on('message', (d, isBin) => { if (isBin){ c.bytes += d.byteLength; c.snaps++; const ab = d instanceof ArrayBuffer ? d : d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength);
      for (const a of unpackSnap(ab, id => c.peers.get(id) || null)) c.peers.set(a[0], { x:a[1],y:a[2],z:a[3],yaw:a[4],car:a[5],col:a[6],spd:a[7],f:a[8],w:a[9],hp:a[10],pitch:a[11],roll:a[12], raw:a });
    } else { const m = JSON.parse(d.toString()); if (m.t === 'welcome') c.id = m.id; if (m.t === 'snap'){ c.bytes += d.length; c.snaps++; for (const a of m.a) c.peers.set(a[0], { raw: a }); } } });
  ws.on('open', () => res(c)); });
const [oldC, newC, walker, driver] = [await open('old', false), await open('new', true), await open('walk', true), await open('drive', true)];
await wait(200);
let t = 0; const state = () => ({
  walk:  [-1422.337 + t*3.1, 567.84, -800.61 - t*2, 1.5707 + t*.01, 0, 65535, 6.4, 4|8, 17, 83, 0.6, 0],
  drive: [3120.5 - t*20, 12.25 + Math.sin(t), -250.75, -2.9, 1, 37, 141.3, 0, 3, 100, 0.123, -0.456] });
// observers stand at the origin: nobody is within 1 km, so move the test subjects next to them
const near = () => { const s = state(); s.walk[0] = 40 + t*3; s.walk[2] = 30; s.drive[0] = -60 - t*20 % 300; s.drive[2] = 90; return s; };
const sendNear = moving => { if (moving) t += 1/20; const s = near();
  walker.ws.send(JSON.stringify({ t: 's', s: s.walk })); driver.ws.send(JSON.stringify({ t: 's', s: s.drive }));
  oldC.ws.send(JSON.stringify({ t: 's', s: [0,0,0,0,0,0,0,0,0,100] })); newC.ws.send(JSON.stringify({ t: 's', s: [1,0,1,0,0,0,0,0,0,100] })); return s; };
const runNear = async (ms, moving) => { await wait(120); for (const c of [oldC, newC]){ c.bytes = 0; c.snaps = 0; } const end = Date.now() + ms; let s; while (Date.now() < end){ s = sendNear(moving); await wait(50); } await wait(150); return { json: oldC.bytes, bin: newC.bytes, n: newC.snaps, s }; };
try {
  const mv = await runNear(3000, true);
  const close = (a, b, e) => Math.abs(a - b) <= e;
  for (const [who, key] of [[walker, 'walk'], [driver, 'drive']]){
    const got = newC.peers.get(who.id), ref = oldC.peers.get(who.id).raw, want = mv.s[key];
    assert(got, key + ' seen by the binary client');
    // the binary values match what was sent, and the JSON an old client got
    assert(close(got.x, want[0], .006) && close(got.y, want[1], .006) && close(got.z, want[2], .006), key + ' position');
    assert(close(got.yaw, want[3], .001), key + ' yaw'); assert.equal(got.car, want[4]); assert(close(got.spd, want[6], .051));
    assert.equal(got.f, want[7]); assert.equal(got.w, want[8]); assert.equal(got.hp, want[9]);
    assert(close(got.pitch, want[10], .0002) && close(got.roll, want[11], .0002), key + ' pitch/roll');
    if (want[4]) assert.equal(got.col, want[5]);
    for (let i = 1; i <= 4; i++) assert(close(got.raw[i], ref[i], .011), key + ' matches JSON field ' + i);
    assert.equal(got.raw.length, ref.length, 'same array shape as JSON');
  }
  const idle = await runNear(3000, false);
  assert(idle.n >= 30, 'idle peers are still reported every tick (' + idle.n + ')');
  assert(newC.peers.get(walker.id).hp === 83, 'idle repeats keep the last values');
  // someone who joins late gets full entries straight away
  const late = await open('late', true); late.ws.send(JSON.stringify({ t: 's', s: [2,0,2,0,0,0,0,0,0,100] })); await runNear(600, false);
  assert(late.peers.get(walker.id)?.hp === 83 && late.peers.get(driver.id)?.car === 1, 'late joiner sees everyone');
  const stats = await (await fetch(`http://localhost:${PORT}/stats`)).json(); assert(stats.bin === true && stats.snapMB);
  console.log('PASS snapshots: moving', mv.json, '→', mv.bin, 'bytes (' + (mv.json / mv.bin).toFixed(1) + 'x) · standing', idle.json, '→', idle.bin, 'bytes (' + (idle.json / idle.bin).toFixed(1) + 'x)');
} finally { for (const c of [oldC, newC, walker, driver]) c.ws.close(); srv.kill(); }
process.exit(0);
