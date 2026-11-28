// Dead Haerim 협동 서버 — 외부 라이브러리 없이 동작하는 WebSocket 중계 서버
// 방장(호스트)의 브라우저가 게임을 계산하고, 이 서버는 방 관리와 메시지 전달만 합니다.
'use strict';
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 10000;
const MAX_PLAYERS = 4;
const MAX_MSG = 256 * 1024;

const rooms = new Map();      // code -> { code, host, players: Map<id, client>, started }
let nextId = 1;

function makeCode(){
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let k = 0; k < 50; k++){
    let c = ''; for (let i = 0; i < 4; i++) c += A[crypto.randomInt(A.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}

// ---------- WebSocket 프레임 ----------
function encode(str){
  const p = Buffer.from(str, 'utf8'), n = p.length;
  let h;
  if (n < 126){ h = Buffer.alloc(2); h[1] = n; }
  else if (n < 65536){ h = Buffer.alloc(4); h[1] = 126; h.writeUInt16BE(n, 2); }
  else { h = Buffer.alloc(10); h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  h[0] = 0x81; return Buffer.concat([h, p]);
}
function ctrl(op, payload){ const p = payload || Buffer.alloc(0); return Buffer.concat([Buffer.from([0x80 | op, p.length]), p]); }

function attach(sock){
  const c = { id: nextId++, sock, buf: Buffer.alloc(0), room: null, name: 'Player', alive: true, frag: [] };
  sock.setNoDelay(true);
  sock.on('data', d => { c.buf = Buffer.concat([c.buf, d]); try { parse(c); } catch(e){ drop(c); } });
  sock.on('close', () => drop(c));
  sock.on('error', () => drop(c));
  c.pingT = setInterval(() => { if (!c.alive) return drop(c); c.alive = false; try { sock.write(ctrl(0x9)); } catch(e){} }, 25000);
  return c;
}
function parse(c){
  for (;;){
    const b = c.buf; if (b.length < 2) return;
    const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
    let len = b[1] & 0x7f, off = 2;
    if (len === 126){ if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127){ if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    if (len > MAX_MSG) return drop(c);
    const need = off + (masked ? 4 : 0) + len; if (b.length < need) return;
    let p = b.subarray(off + (masked ? 4 : 0), need);
    if (masked){ const m = b.subarray(off, off + 4); p = Buffer.from(p); for (let i = 0; i < p.length; i++) p[i] ^= m[i & 3]; }
    c.buf = b.subarray(need);
    c.alive = true;
    if (op === 0x8){ drop(c); return; }
    if (op === 0x9){ try { c.sock.write(ctrl(0xA, p)); } catch(e){} continue; }
    if (op === 0xA) continue;
    if (op === 0x1 || op === 0x0){
      c.frag.push(p);
      if (fin){ const s = Buffer.concat(c.frag).toString('utf8'); c.frag = []; onMsg(c, s); }
    }
  }
}
function send(c, obj){ try { c.sock.write(encode(typeof obj === 'string' ? obj : JSON.stringify(obj))); } catch(e){} }

// ---------- 방 ----------
function roomInfo(r){ return { t:'room', code:r.code, started:r.started, players:[...r.players.values()].map(p => ({ id:p.id, name:p.name, host:p.id === r.host })) }; }
function broadcastRoom(r){ const info = roomInfo(r); for (const p of r.players.values()) send(p, Object.assign({ you:p.id }, info)); }
function leave(c){
  const r = c.room; if (!r) return; c.room = null; r.players.delete(c.id);
  if (r.host === c.id || r.players.size === 0){
    for (const p of r.players.values()){ p.room = null; send(p, { t:'closed', m:'host-left' }); }
    rooms.delete(r.code); return;
  }
  for (const p of r.players.values()) send(p, { t:'left', id:c.id });
  broadcastRoom(r);
}
function drop(c){
  if (c.dead) return; c.dead = true; clearInterval(c.pingT);
  leave(c); try { c.sock.destroy(); } catch(e){}
}
function clean(s, n){ return String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n); }

function onMsg(c, s){
  let m; try { m = JSON.parse(s); } catch(e){ return; }
  if (!m || typeof m !== 'object') return;
  switch (m.t){
    case 'create': {
      leave(c); c.name = clean(m.name, 16) || 'Player';
      const code = makeCode(); if (!code) return send(c, { t:'err', m:'busy' });
      const r = { code, host:c.id, players:new Map([[c.id, c]]), started:false };
      rooms.set(code, r); c.room = r; broadcastRoom(r); break;
    }
    case 'join': {
      leave(c); c.name = clean(m.name, 16) || 'Player';
      const r = rooms.get(clean(m.code, 8).toUpperCase());
      if (!r) return send(c, { t:'err', m:'no-room' });
      if (r.players.size >= MAX_PLAYERS) return send(c, { t:'err', m:'full' });
      if (r.started) return send(c, { t:'err', m:'started' });
      r.players.set(c.id, c); c.room = r; broadcastRoom(r); break;
    }
    case 'leave': leave(c); send(c, { t:'closed', m:'left' }); break;
    case 'start': { const r = c.room; if (!r || r.host !== c.id) return; r.started = true; broadcastRoom(r); break; }
    case 'lobby': { const r = c.room; if (!r || r.host !== c.id) return; r.started = false; broadcastRoom(r); break; }
    case 'kick': { const r = c.room; if (!r || r.host !== c.id) return; const p = r.players.get(m.id); if (p && p !== c){ leave(p); send(p, { t:'closed', m:'kicked' }); } break; }
    case 'r': {           // 중계: to = 'all' | 'host' | 플레이어 id
      const r = c.room; if (!r) return;
      const out = JSON.stringify({ t:'m', f:c.id, d:m.d });
      if (m.to === 'host'){ const h = r.players.get(r.host); if (h && h !== c) send(h, out); }
      else if (typeof m.to === 'number'){ const p = r.players.get(m.to); if (p) send(p, out); }
      else for (const p of r.players.values()) if (p !== c) send(p, out);
      break;
    }
    case 'ping': send(c, { t:'pong', k:m.k }); break;
  }
}

// ---------- HTTP + 업그레이드 ----------
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type':'text/plain; charset=utf-8', 'Access-Control-Allow-Origin':'*' });
  res.end('Dead Haerim co-op server OK · rooms ' + rooms.size + '\n');
});
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket'){ sock.destroy(); return; }
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  const c = attach(sock); send(c, { t:'hello', id:c.id });
});
server.listen(PORT, () => console.log('Dead Haerim co-op server on :' + PORT));
