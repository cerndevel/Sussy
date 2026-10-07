'use strict';
// SUSSY server: authoritative game logic. One process hosts many rooms of up to ROOM_SIZE players.
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PAGE = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const PORT = +process.env.PORT || 3000;
const ROOM_SIZE = +process.env.ROOM_SIZE || 10;
const MAX_ROOMS = +process.env.MAX_ROOMS || 200;
const MIN_PLAYERS = +process.env.MIN_PLAYERS || 8; // bots fill up to this many

/* ============================ tuning ============================ */
const SPEED = 170, BSPEED = 138, KRANGE = 72, KCD = 25000, SAB_CD = 30000, REACTOR_MS = 45000;
const INTRO_MS = 4600, ALERT_MS = 2400, DISC_MS = 14000, VOTE_MS = 30000, RESULT_MS = 5500, EJECT_MS = 6500, END_MS = 10000;
const ROUND_MS = 8 * 60 * 1000, COLORS = 12, CULL = 640;
const MIN_TIME = { scan: 5000, download: 6000, wires: 2500, asteroids: 4000, numbers: 3500, align: 2500, card: 1800, fuel: 3500, shields: 3000, lights: 1800 };
const BOTNAMES = ['Nova', 'Pip', 'Kai', 'Zed', 'Lux', 'Mo', 'Rue', 'Bo', 'Ned', 'Ivy', 'Dax', 'Sol', 'Tess', 'Juno', 'Finn', 'Cleo', 'Orbit', 'Blip'];

/* ============================ map ============================ */
const TS = 40, GW = 76, GH = 48;
const ROOMS = [
  { n: 'Medbay', x: 4, y: 4, w: 12, h: 10 }, { n: 'Cafeteria', x: 26, y: 2, w: 22, h: 14 }, { n: 'Weapons', x: 60, y: 4, w: 12, h: 10 },
  { n: 'Reactor', x: 2, y: 21, w: 12, h: 12 }, { n: 'Admin', x: 30, y: 22, w: 14, h: 9 }, { n: 'Navigation', x: 62, y: 21, w: 12, h: 12 },
  { n: 'Engine', x: 4, y: 36, w: 12, h: 9 }, { n: 'Electrical', x: 20, y: 35, w: 11, h: 10 }, { n: 'Storage', x: 34, y: 35, w: 13, h: 10 },
  { n: 'Shields', x: 60, y: 36, w: 12, h: 9 }];
const HALLS = [[16, 7, 10, 3], [48, 7, 12, 3], [8, 14, 3, 7], [65, 14, 3, 7], [36, 16, 3, 6], [8, 33, 3, 3], [65, 33, 3, 3], [16, 39, 4, 3], [31, 39, 3, 3], [47, 39, 13, 3], [40, 31, 3, 4], [14, 25, 16, 3], [44, 25, 18, 3]];
const DECOR = [
  [30, 4, 3, 3, 'table'], [41, 4, 3, 3, 'table'], [30, 10, 3, 3, 'table'], [41, 10, 3, 3, 'table'], [36, 7, 2, 2, 'button'],
  [5, 10, 2, 3, 'bed'], [12, 10, 2, 3, 'bed'], [4, 5, 1, 3, 'cabinet'],
  [61, 6, 2, 2, 'turret'], [69, 6, 2, 2, 'turret'], [69, 21, 3, 1, 'helm'],
  [5, 25, 3, 4, 'core'], [35, 25, 4, 3, 'holo'], [5, 41, 3, 3, 'engine'], [12, 41, 3, 3, 'engine'],
  [22, 42, 2, 2, 'crate'], [27, 42, 2, 2, 'crate'],
  [36, 36, 2, 2, 'crate'], [44, 36, 2, 2, 'crate'], [36, 42, 3, 2, 'crate'], [43, 42, 3, 2, 'crate'],
  [63, 37, 2, 2, 'gen'], [69, 37, 2, 2, 'gen'], [61, 42, 2, 2, 'crate'], [69, 42, 2, 2, 'crate']];
const ST = [
  { n: 'Submit Scan', r: 'Medbay', k: 'scan', x: 8, y: 4, w: 2, h: 2, d: 'n' },
  { n: 'Download Data', r: 'Cafeteria', k: 'download', x: 28, y: 2, w: 2, h: 1, d: 'n' },
  { n: 'Fix Wiring', r: 'Cafeteria', k: 'wires', x: 47, y: 11, w: 1, h: 2, d: 'e' },
  { n: 'Clear Asteroids', r: 'Weapons', k: 'asteroids', x: 65, y: 4, w: 2, h: 1, d: 'n' },
  { n: 'Download Data', r: 'Weapons', k: 'download', x: 71, y: 10, w: 1, h: 2, d: 'e' },
  { n: 'Stabilize Steering', r: 'Navigation', k: 'align', x: 73, y: 26, w: 1, h: 2, d: 'e' },
  { n: 'Fix Wiring', r: 'Navigation', k: 'wires', x: 73, y: 22, w: 1, h: 2, d: 'e' },
  { n: 'Unlock Manifolds', r: 'Reactor', k: 'numbers', x: 3, y: 21, w: 2, h: 1, d: 'n' },
  { n: 'Swipe Card', r: 'Admin', k: 'card', x: 43, y: 23, w: 1, h: 2, d: 'e' },
  { n: 'Upload Data', r: 'Admin', k: 'download', x: 31, y: 30, w: 2, h: 1, d: 's' },
  { n: 'Align Engine Output', r: 'Engine', k: 'align', x: 4, y: 38, w: 1, h: 2, d: 'w' },
  { n: 'Refuel Engine', r: 'Engine', k: 'fuel', x: 10, y: 44, w: 2, h: 1, d: 's' },
  { n: 'Fix Wiring', r: 'Electrical', k: 'wires', x: 21, y: 35, w: 2, h: 1, d: 'n' },
  { n: 'Calibrate Distributor', r: 'Electrical', k: 'numbers', x: 30, y: 36, w: 1, h: 2, d: 'e' },
  { n: 'Fuel Engines', r: 'Storage', k: 'fuel', x: 40, y: 44, w: 2, h: 1, d: 's' },
  { n: 'Fix Wiring', r: 'Storage', k: 'wires', x: 34, y: 37, w: 1, h: 2, d: 'w' },
  { n: 'Prime Shields', r: 'Shields', k: 'shields', x: 66, y: 44, w: 2, h: 1, d: 's' }];
ST.forEach((s, i) => s.id = i);
const PANELS = { lights: { x: 25, y: 35, w: 2, h: 1, d: 'n' }, ra: { x: 2, y: 26, w: 1, h: 2, d: 'w' }, rb: { x: 15, y: 43, w: 1, h: 1, d: 'e' } };
const VENTS = [[14, 12, 0], [3, 31, 0], [4, 43, 0], [70, 12, 1], [72, 30, 1], [70, 44, 1], [27, 14, 2], [31, 23, 2], [21, 43, 3], [46, 44, 3]];
const BTN = { x: 36, y: 7, w: 2, h: 2 };
const BTNC = { x: (BTN.x + BTN.w / 2) * TS, y: (BTN.y + BTN.h / 2) * TS };

const grid = new Uint8Array(GW * GH); // 0 wall/space, 1 floor, 2 solid prop
const fillR = (x, y, w, h, v) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j * GW + i] = v; };
ROOMS.forEach(r => fillR(r.x, r.y, r.w, r.h, 1));
HALLS.forEach(h => fillR(h[0], h[1], h[2], h[3], 1));
DECOR.forEach(d => fillR(d[0], d[1], d[2], d[3], 2));
ST.forEach(s => fillR(s.x, s.y, s.w, s.h, 2));
Object.values(PANELS).forEach(s => fillR(s.x, s.y, s.w, s.h, 2));
const ROWS = []; for (let y = 0; y < GH; y++) { let s = ''; for (let x = 0; x < GW; x++) s += '#.P'[grid[y * GW + x]]; ROWS.push(s); }
const tileAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= GW || ty >= GH) ? 0 : grid[ty * GW + tx];

const HB = 10; // server half-box (client uses 11 so honest clients never get rejected)
function blocked(x, y) {
  const x0 = Math.floor((x - HB) / TS), x1 = Math.floor((x + HB) / TS), y0 = Math.floor((y - HB) / TS), y1 = Math.floor((y + HB) / TS);
  return tileAt(x0, y0) !== 1 || tileAt(x1, y0) !== 1 || tileAt(x0, y1) !== 1 || tileAt(x1, y1) !== 1;
}
function los(ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 10);
  for (let i = 1; i < n; i++) { const t = i / n; if (tileAt(Math.floor((ax + (bx - ax) * t) / TS), Math.floor((ay + (by - ay) * t) / TS)) === 0) return false; }
  return true;
}
function clearLine(ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(d / 8));
  for (let i = 1; i <= n; i++) { const t = i / n; if (blocked(ax + (bx - ax) * t, ay + (by - ay) * t)) return false; }
  return true;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.random() * a.length | 0];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; };
function dRect(px, py, r) {
  const dx = Math.max(r.x * TS - px, 0, px - (r.x + r.w) * TS), dy = Math.max(r.y * TS - py, 0, py - (r.y + r.h) * TS);
  return Math.hypot(dx, dy);
}
const roomAt = (x, y) => { const tx = Math.floor(x / TS), ty = Math.floor(y / TS); for (const r of ROOMS) if (tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h) return r.n; return null; };
const ventPos = i => ({ x: (VENTS[i][0] + .5) * TS, y: (VENTS[i][1] + .5) * TS });

/* bot navigation: BFS distance fields over floor tiles (8-neighbour, no corner cutting) */
const NB8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function bfs(sources) {
  const f = new Int16Array(GW * GH).fill(-1), q = new Int32Array(GW * GH); let h = 0, t = 0;
  for (const s of sources) if (grid[s] === 1 && f[s] < 0) { f[s] = 0; q[t++] = s; }
  while (h < t) {
    const c = q[h++], cx = c % GW, cy = (c / GW) | 0, cv = f[c];
    for (const [dx, dy] of NB8) {
      const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const ni = ny * GW + nx; if (grid[ni] !== 1 || f[ni] >= 0) continue;
      if (dx && dy && (grid[cy * GW + nx] !== 1 || grid[ny * GW + cx] !== 1)) continue;
      f[ni] = cv + 1; q[t++] = ni;
    }
  }
  return f;
}
function rectSources(r) {
  const s = [];
  for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
    if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) continue;
    if (grid[y * GW + x] === 1) s.push(y * GW + x);
  }
  return s;
}
function bfsPoint(x, y) {
  let tx = Math.floor(x / TS), ty = Math.floor(y / TS);
  if (tileAt(tx, ty) !== 1) { let best = -1, bd = 1e9; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (tileAt(tx + i, ty + j) === 1 && i * i + j * j < bd) { bd = i * i + j * j; best = (ty + j) * GW + tx + i; } return bfs(best < 0 ? [] : [best]); }
  return bfs([ty * GW + tx]);
}
const STF = ST.map(s => bfs(rectSources(s)));
const PNF = { lights: bfs(rectSources(PANELS.lights)), ra: bfs(rectSources(PANELS.ra)), rb: bfs(rectSources(PANELS.rb)) };

/* sanity: every station reachable from spawn, vents on floor */
(function validate() {
  const f = bfsPoint(BTNC.x, BTNC.y + 100);
  ST.forEach((s, i) => { const ok = rectSources(s).some(i2 => f[i2] >= 0); if (!ok) console.error('UNREACHABLE station', s.n, s.r); });
  Object.entries(PANELS).forEach(([k, s]) => { if (!rectSources(s).some(i2 => f[i2] >= 0)) console.error('UNREACHABLE panel', k); });
  VENTS.forEach(v => { if (grid[v[1] * GW + v[0]] !== 1) console.error('BAD vent', v); });
  let floors = 0, reach = 0; for (let i = 0; i < GW * GH; i++) if (grid[i] === 1) { floors++; if (f[i] >= 0) reach++; }
  if (floors !== reach) console.error('disconnected floor tiles:', floors - reach);
})();

const MAPMSG = JSON.stringify({
  t: 'map', ts: TS, gw: GW, gh: GH, rows: ROWS, rooms: ROOMS, halls: HALLS, decor: DECOR, st: ST, panels: PANELS, vents: VENTS,
  btn: BTN, speed: SPEED, krange: KRANGE, hb: 11, colors: COLORS
});

/* ============================ game room ============================ */
let roomCounter = 0;
class Room {
  constructor() {
    this.num = ++roomCounter; this.ps = {}; this.n = 0; this.phase = 'idle'; this.sub = ''; this.phEnd = 0; this.rd = 0; this.sp = 0;
    this.bodies = []; this.votes = {}; this.chat = []; this.mc = null; this.ej = null; this.win = null; this.why = '';
    this.sab = null; this.sabCd = 0; this.roundEnd = 0; this.playT0 = 0; this.last = Date.now(); this.lastKey = ''; this.lastMetaT = 0;
    this.dead = false; this.accuse = {};
  }
  list() { return Object.values(this.ps); }
  humans() { let n = 0; for (const k in this.ps) if (!this.ps[k].bot) n++; return n; }
  freeColor(want) {
    const used = new Set(this.list().map(p => p.ci));
    if (want >= 0 && want < COLORS && !used.has(want)) return want;
    const f = []; for (let i = 0; i < COLORS; i++) if (!used.has(i)) f.push(i);
    return f.length ? pick(f) : 0;
  }
  add(name, ws, bot, want) {
    const id = ++this.n;
    return this.ps[id] = {
      id, ws, name, ci: this.freeColor(want), bot, x: BTNC.x, y: BTNC.y + 110, alive: true, role: 'crew', tasks: [], done: [], kabs: 0, vent: -1, em: 1,
      credit: 70, lpt: Date.now(), ts: null, saw: null, goal: null, wait: 0, mode: 'work', lastRoom: 'Cafeteria', yk: '', lastChat: 0,
      chatAt: 0, chatN: 0, voteAt: 0, react: null, pf: null, pfT: 0, sx: 0, sy: 0, st: 0, hunt: null, huntT: 0
    };
  }
  /* ---------- lifecycle ---------- */
  join(ws, name, want) {
    const total = this.list().length;
    if (total >= ROOM_SIZE) { // make room: drop a living crew bot, else a dead one
      const bots = this.list().filter(p => p.bot && p.role !== 'imp');
      const b = bots.find(p => !p.alive) || bots[0];
      if (b) { delete this.ps[b.id]; if (this.phase === 'play') this.checkWin(); }
    }
    const p = this.add(name, ws, false, want);
    p.tasks = shuffle(ST.map(s => s.id)).slice(0, 5);
    this.ringPos(p, Math.random() * Math.PI * 2);
    if (this.phase === 'idle') this.newRound();
    return p;
  }
  leave(p) {
    const others = this.list().filter(q => !q.bot && q !== p).length;
    p.ws = null;
    if (!others) { delete this.ps[p.id]; this.dead = true; return; }
    if (this.phase === 'play' || this.phase === 'meeting' || this.phase === 'intro') {
      p.bot = true; p.goal = null; p.wait = 0; p.mode = 'work'; p.ts = null;
      if (this.sab && this.sab.k === 'reactor') { if (this.sab.ha === p.id) this.sab.ha = 0; if (this.sab.hb === p.id) this.sab.hb = 0; }
      if (this.phase === 'meeting') this.ensureBotMeet(p, Date.now());
    } else delete this.ps[p.id];
  }
  ringPos(p, a) { p.x = BTNC.x + Math.cos(a) * 105; p.y = BTNC.y + Math.sin(a) * 105; p.vent = -1; p.goal = null; p.wait = 0; p.credit = 70; p.lpt = Date.now(); }
  placeRing() { const L = this.list(); L.forEach((p, i) => this.ringPos(p, -Math.PI / 2 + i / L.length * Math.PI * 2)); }
  newRound() {
    const now = Date.now();
    for (const p of this.list()) if (p.bot) delete this.ps[p.id];
    if (!this.list().length) { this.phase = 'idle'; return; }
    const taken = new Set(this.list().map(p => p.name.toLowerCase()));
    const names = shuffle(BOTNAMES.filter(n => !taken.has(n.toLowerCase())));
    while (this.list().length < MIN_PLAYERS) this.add(names.pop() || 'Bot' + this.n, null, true, -1);
    const L = shuffle(this.list()), nImp = L.length >= 9 ? 2 : 1;
    L.forEach((p, i) => {
      p.role = i < nImp ? 'imp' : 'crew'; p.alive = true; p.done = []; p.tasks = shuffle(ST.map(s => s.id)).slice(0, p.role === 'imp' ? 4 : 5);
      p.kabs = 0; p.vent = -1; p.em = 1; p.saw = null; p.ts = null; p.mode = 'work'; p.goal = null; p.wait = 0; p.react = null; p.yk = '';
    });
    this.bodies = []; this.votes = {}; this.chat = []; this.mc = null; this.ej = null; this.sab = null; this.win = null; this.why = ''; this.accuse = {};
    this.rd++; this.sp++; this.phase = 'intro'; this.sub = ''; this.phEnd = now + INTRO_MS; this.placeRing();
  }
  startPlay(now) {
    this.phase = 'play'; this.playT0 = now; this.roundEnd = now + ROUND_MS; this.sabCd = now + 20000;
    this.list().forEach(p => { if (p.role === 'imp') p.kabs = now + 10000; p.wait = rnd(0, 1.5); p.yk = ''; });
  }
  end(w, why) {
    this.phase = 'end'; this.sub = ''; this.win = w; this.why = why || ''; this.phEnd = Date.now() + END_MS; this.sab = null;
    this.list().forEach(p => { p.vent = -1; p.yk = ''; });
  }
  totals() { let d = 0, t = 0; for (const p of this.list()) if (p.role === 'crew') { d += p.done.length; t += p.tasks.length; } return [d, t]; }
  winCheck() {
    const L = this.list(), imps = L.filter(p => p.role === 'imp' && p.alive).length, crew = L.filter(p => p.role === 'crew' && p.alive).length;
    if (imps === 0) return 'crew'; if (imps >= crew) return 'imp';
    const [d, t] = this.totals(); if (t > 0 && d >= t) return 'crew';
    return null;
  }
  checkWin() { if (this.phase !== 'play') return; const w = this.winCheck(); if (w) this.end(w, w === 'crew' ? (this.list().some(p => p.role === 'imp' && p.alive) ? 'tasks' : 'imps') : 'kills'); }
  event(k, x, y, extra, radius) {
    const m = JSON.stringify(Object.assign({ t: 'e', k, x: Math.round(x), y: Math.round(y) }, extra || {}));
    for (const p of this.list()) if (!p.bot && p.ws && p.ws.readyState === 1 && (!p.alive || Math.hypot(p.x - x, p.y - y) <= (radius || 700))) p.ws.send(m);
  }

  /* ---------- player actions ---------- */
  onPos(p, x, y, now) {
    x = +x; y = +y; if (!(x > 0 && y > 0 && x < GW * TS && y < GH * TS)) return;
    const dt = Math.min(.3, (now - p.lpt) / 1000); p.lpt = now;
    p.credit = Math.min(70, p.credit + SPEED * 1.15 * dt);
    const d = Math.hypot(x - p.x, y - p.y); if (d > p.credit + 8) return;
    if (p.alive && blocked(x, y)) return;
    p.credit -= d; p.x = x; p.y = y;
  }
  doKill(k, now) {
    if (this.phase !== 'play' || !k.alive || k.role !== 'imp' || k.vent >= 0 || now < k.kabs) return false;
    let best = null, bd = KRANGE;
    for (const v of this.list()) if (v.alive && v.role === 'crew') { const d = dist(k, v); if (d < bd && los(k.x, k.y, v.x, v.y)) { bd = d; best = v; } }
    if (!best) return false;
    const v = best;
    v.alive = false; v.ts = null; v.vent = -1; v.goal = null; v.wait = 0; v.yk = '';
    this.bodies.push({ x: v.x, y: v.y, c: v.ci, id: v.id });
    for (const w of this.list()) if (w.bot && w.alive && w.role === 'crew' && w !== v && dist(w, k) < 280 && los(w.x, w.y, k.x, k.y)) w.saw = { killer: k.id, victim: v.id };
    this.event('kill', v.x, v.y, { v: v.id, k: k.id }, 520);
    k.x = v.x; k.y = v.y; k.kabs = now + KCD; k.yk = '';
    this.checkWin();
    return true;
  }
  callMeeting(p, kind, body) {
    if (this.phase !== 'play') return;
    const now = Date.now();
    this.phase = 'meeting'; this.sub = 'alert'; this.phEnd = now + ALERT_MS; this.votes = {}; this.chat = []; this.accuse = {};
    this.mc = { k: kind, by: p.id, room: body ? roomAt(body.x, body.y) : 'Cafeteria' };
    this.sab = null;
    for (const q of this.list()) { q.vent = -1; q.ts = null; q.goal = null; q.wait = 0; q.react = null; q.yk = ''; }
  }
  say(p, text) {
    this.chat.push([p.id, text]); if (this.chat.length > 24) this.chat.shift();
    const low = text.toLowerCase();
    if (/sus|vote|imp|kill|saw|vent|lying|liar|it was|him|her|them|eject/.test(low))
      for (const q of this.list()) if (q.alive && q.id !== p.id && low.includes(q.name.toLowerCase())) this.accuse[q.id] = (this.accuse[q.id] || 0) + 1;
  }
  endSab(now) { this.sab = null; this.sabCd = now + SAB_CD; for (const b of this.list()) b.react = null; this.list().forEach(p => { if (p.role === 'imp') p.yk = ''; }); }
  handle(p, d, now) {
    const t = d.t, ph = this.phase;
    if (t === 'pos') { if (ph === 'play' && p.vent < 0) this.onPos(p, d.x, d.y, now); return; }
    if (t === 'kill') { this.doKill(p, now); return; }
    if (t === 'report') {
      if (ph !== 'play' || !p.alive || p.vent >= 0) return;
      const b = this.bodies.find(o => dist(p, o) < 110 && los(p.x, p.y, o.x, o.y)); if (b) this.callMeeting(p, 'body', b); return;
    }
    if (t === 'emerg') {
      if (ph !== 'play' || !p.alive || p.vent >= 0 || p.em <= 0 || now < this.playT0 + 5000) return;
      if (this.sab && this.sab.k === 'reactor') return;
      if (dRect(p.x, p.y, BTN) > 64) return;
      p.em--; this.callMeeting(p, 'emergency', null); return;
    }
    if (t === 'tstart') { p.ts = { i: d.i, t: now }; return; }
    if (t === 'task') {
      if (ph !== 'play' || p.vent >= 0) return; const i = d.i | 0, s = ST[i];
      if (!s || !p.tasks.includes(i) || p.done.includes(i) || dRect(p.x, p.y, s) > 70) return;
      if (!p.ts || p.ts.i !== i || now - p.ts.t < MIN_TIME[s.k] - 150) return;
      p.done.push(i); p.ts = null; p.yk = ''; this.checkWin(); return;
    }
    if (t === 'sab') {
      if (ph !== 'play' || p.role !== 'imp' || !p.alive || this.sab || now < this.sabCd) return;
      if (d.k === 'lights') this.sab = { k: 'lights', t0: now };
      else if (d.k === 'reactor') { this.sab = { k: 'reactor', t0: now, until: now + REACTOR_MS, ha: 0, hb: 0, fix: 0 }; this.assignResponders(); }
      else return;
      this.list().forEach(q => { if (q.role === 'imp') q.yk = ''; }); return;
    }
    if (t === 'fix') {
      if (this.sab && this.sab.k === 'lights' && p.alive && dRect(p.x, p.y, PANELS.lights) <= 70 && p.ts && p.ts.i === 'L' && now - p.ts.t >= MIN_TIME.lights - 150) this.endSab(now);
      return;
    }
    if (t === 'hold') {
      const s = this.sab; if (!s || s.k !== 'reactor') return;
      const w = d.k === 'a' ? 'ha' : 'hb', pan = d.k === 'a' ? PANELS.ra : PANELS.rb;
      if (d.v && p.alive && dRect(p.x, p.y, pan) <= 70) { if (!s[w] || s[w] === p.id) s[w] = p.id; } else if (s[w] === p.id) s[w] = 0;
      return;
    }
    if (t === 'vent') {
      if (ph !== 'play' || p.role !== 'imp' || !p.alive) return;
      if (d.a === 'in' && p.vent < 0) {
        let bi = -1, bd = 60; VENTS.forEach((v, i) => { const q = ventPos(i), dd = Math.hypot(q.x - p.x, q.y - p.y); if (dd < bd) { bd = dd; bi = i; } });
        if (bi >= 0) { p.vent = bi; const q = ventPos(bi); this.event('vent', p.x, p.y, null, 420); p.x = q.x; p.y = q.y; }
      } else if (d.a === 'out' && p.vent >= 0) { const q = ventPos(p.vent); p.vent = -1; p.x = q.x; p.y = q.y; p.lpt = now; p.credit = 70; this.event('vent', q.x, q.y, null, 420); }
      else if ((d.a === 'next' || d.a === 'prev') && p.vent >= 0) {
        const g = VENTS[p.vent][2], grp = VENTS.map((v, i) => i).filter(i => VENTS[i][2] === g), at = grp.indexOf(p.vent);
        p.vent = grp[(at + (d.a === 'next' ? 1 : grp.length - 1)) % grp.length]; const q = ventPos(p.vent); p.x = q.x; p.y = q.y;
      }
      return;
    }
    if (t === 'vote') {
      if (ph !== 'meeting' || this.sub !== 'vote' || !p.alive || (p.id in this.votes)) return;
      const v = d.v === 'skip' ? 'skip' : (d.v | 0);
      if (v !== 'skip') { const q = this.ps[v]; if (!q || !q.alive) return; }
      this.votes[p.id] = v; this.afterVote(now); return;
    }
    if (t === 'chat') {
      if (ph !== 'meeting' || !p.alive || (this.sub !== 'discuss' && this.sub !== 'vote') || now - p.lastChat < 700) return;
      const s = String(d.m || '').replace(/[<>]/g, '').trim().slice(0, 80); if (!s) return;
      p.lastChat = now; this.say(p, s);
    }
  }
  afterVote(now) { if (this.list().filter(p => p.alive).every(p => p.id in this.votes)) this.phEnd = Math.min(this.phEnd, now + 1500); }

  /* ---------- tick ---------- */
  tick(now) {
    const dt = Math.min(.2, (now - this.last) / 1000); this.last = now;
    if (this.phase === 'idle') return;
    if (this.phase === 'intro') { if (now >= this.phEnd) this.startPlay(now); }
    else if (this.phase === 'play') this.playTick(now, dt);
    else if (this.phase === 'meeting') this.meetTick(now);
    else if (this.phase === 'end') { if (now >= this.phEnd) this.newRound(); }
    this.broadcast(now);
  }
  playTick(now, dt) {
    for (const p of this.list()) if (p.bot) this.botPlay(p, now, dt);
    if (this.phase !== 'play') return;
    const s = this.sab;
    if (s && s.k === 'reactor') {
      for (const [w, pan] of [['ha', PANELS.ra], ['hb', PANELS.rb]]) { const h = this.ps[s[w]]; if (s[w] && (!h || !h.alive || dRect(h.x, h.y, pan) > 90)) s[w] = 0; }
      if (s.ha && s.hb) { s.fix += dt; if (s.fix >= 1.5) this.endSab(now); } else s.fix = 0;
      if (this.sab && now >= s.until) { this.end('imp', 'reactor'); return; }
    }
    if (now >= this.roundEnd) { this.end('imp', 'time'); return; }
    this.checkWin();
  }
  meetTick(now) {
    const s = this.sub;
    if (s === 'alert') { if (now >= this.phEnd) { this.sub = 'discuss'; this.phEnd = now + DISC_MS; this.botPlan(now); } }
    else if (s === 'discuss') { this.botMeet(now); if (now >= this.phEnd) { this.sub = 'vote'; this.phEnd = now + VOTE_MS; for (const b of this.list()) if (b.bot) b.voteAt = now + rnd(2500, 18000); } }
    else if (s === 'vote') { this.botMeet(now); if (now >= this.phEnd) this.resolve(now); }
    else if (s === 'result') {
      if (now >= this.phEnd) {
        this.sub = 'eject'; this.phEnd = now + EJECT_MS;
        const e = this.ej; if (e && e.id != null) { const v = this.ps[e.id]; if (v) { v.alive = false; v.yk = ''; } }
        e.remain = this.list().filter(p => p.role === 'imp' && p.alive).length;
      }
    } else if (s === 'eject') { if (now >= this.phEnd) this.endMeeting(now); }
  }
  resolve(now) {
    const cnt = {};
    for (const k in this.votes) { const v = this.ps[k]; if (v && v.alive) { const t = this.votes[k]; cnt[t] = (cnt[t] || 0) + 1; } }
    let top = 0, tops = []; for (const t in cnt) { if (cnt[t] > top) { top = cnt[t]; tops = [t]; } else if (cnt[t] === top) tops.push(t); }
    let id = null, tie = false; if (tops.length === 1 && tops[0] !== 'skip') id = +tops[0]; else if (tops.length > 1) tie = true;
    const v = id != null ? this.ps[id] : null;
    this.ej = { id: v ? v.id : null, n: v ? v.name : '', c: v ? v.ci : 0, imp: v ? (v.role === 'imp' ? 1 : 0) : 0, tie: tie ? 1 : 0, remain: 0 };
    this.sub = 'result'; this.phEnd = now + RESULT_MS;
  }
  endMeeting(now) {
    const w = this.winCheck();
    if (w) { this.end(w, w === 'crew' ? 'imps' : 'kills'); return; }
    this.phase = 'play'; this.sub = ''; this.mc = null; this.ej = null; this.bodies = []; this.sp++; this.placeRing();
    this.sabCd = now + 15000;
    for (const p of this.list()) { p.saw = null; p.yk = ''; if (p.role === 'imp') p.kabs = now + 10000; p.goal = null; p.wait = 0; }
  }

  /* ---------- bots ---------- */
  assignResponders() {
    const crew = this.list().filter(p => p.bot && p.alive && p.role === 'crew').sort((a, b) => dist(a, ventPos(0)) - dist(b, ventPos(0)));
    const A = { x: (PANELS.ra.x + .5) * TS, y: (PANELS.ra.y + 1) * TS }, B = { x: (PANELS.rb.x + .5) * TS, y: (PANELS.rb.y + .5) * TS };
    const a = crew.slice().sort((p, q) => dist(p, A) - dist(q, A))[0];
    const b = crew.filter(p => p !== a).sort((p, q) => dist(p, B) - dist(q, B))[0];
    if (a) { a.react = 'ra'; a.reactAt = Date.now() + rnd(2500, 6000); a.goal = null; a.wait = 0; }
    if (b) { b.react = 'rb'; b.reactAt = Date.now() + rnd(3500, 8000); b.goal = null; b.wait = 0; }
  }
  setGoalFor(b, g) { b.goal = g; b.pf = null; }
  fieldFor(b, now) {
    const g = b.goal; if (!g) return null;
    if (g.k === 'st') return STF[g.i]; if (g.k === 'panel') return PNF[g.n];
    if (!b.pf || now - b.pfT > 650) { b.pf = bfsPoint(g.x, g.y); b.pfT = now; }
    return b.pf;
  }
  /* move toward goal; returns true when arrived */
  botMove(b, now, dt, speed) {
    const f = this.fieldFor(b, now); if (!f) return true;
    const tx = Math.floor(b.x / TS), ty = Math.floor(b.y / TS), idx = ty * GW + tx, v = f[idx];
    if (tx < 0 || ty < 0 || tx >= GW || ty >= GH || v < 0) { b.goal = null; return false; }
    if (v === 0) return true;
    let cx = tx, cy = ty, cv = v; const path = [];
    for (let s = 0; s < 7 && cv > 0; s++) {
      let bx = -1, by = -1, bv = cv;
      for (const [dx, dy] of NB8) {
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const nv = f[ny * GW + nx]; if (nv < 0 || nv >= bv) continue;
        if (dx && dy && (grid[cy * GW + nx] !== 1 || grid[ny * GW + cx] !== 1)) continue;
        bv = nv; bx = nx; by = ny;
      }
      if (bx < 0) break; cx = bx; cy = by; cv = bv; path.push([(cx + .5) * TS, (cy + .5) * TS]);
    }
    if (!path.length) return true;
    let tgt = path[0];
    for (let i = path.length - 1; i >= 0; i--) if (clearLine(b.x, b.y, path[i][0], path[i][1])) { tgt = path[i]; break; }
    const dx = tgt[0] - b.x, dy = tgt[1] - b.y, l = Math.hypot(dx, dy) || 1, st = Math.min(speed * dt, l);
    b.x += dx / l * st; b.y += dy / l * st;
    return false;
  }
  pickGoal(b) {
    const imp = b.role === 'imp';
    const pend = b.tasks.filter(i => !b.done.includes(i));
    if (!imp && pend.length && Math.random() < .88) return { k: 'st', i: pick(pend) };
    const tx = Math.floor(b.x / TS), ty = Math.floor(b.y / TS), here = ty * GW + tx;
    const far = ST.filter(s => STF[s.id][here] > 12); return { k: 'st', i: (far.length ? pick(far) : pick(ST)).id };
  }
  botPlay(b, now, dt) {
    const rn = roomAt(b.x, b.y); if (rn) b.lastRoom = rn;
    if (b.vent >= 0) return;
    const imp = b.role === 'imp';
    /* stuck detection */
    if (b.goal && b.wait <= 0) {
      b.st += dt; if (b.st > 1.6) { if (Math.hypot(b.x - b.sx, b.y - b.sy) < 6) { b.goal = null; } b.sx = b.x; b.sy = b.y; b.st = 0; }
    } else { b.sx = b.x; b.sy = b.y; b.st = 0; }
    /* crew: spot and report bodies */
    if (!imp && b.alive) {
      for (const o of this.bodies) {
        const d = dist(b, o);
        if (d < 340 && los(b.x, b.y, o.x, o.y)) {
          if (d < 95) { this.callMeeting(b, 'body', o); return; }
          if (!b.goal || b.goal.k !== 'pt') this.setGoalFor(b, { k: 'pt', x: o.x, y: o.y }); b.wait = 0; b.mode = 'report'; break;
        }
      }
    }
    /* crew: respond to sabotage */
    const sab = this.sab;
    if (!imp && b.alive && sab) {
      if (sab.k === 'reactor' && b.react && now >= b.reactAt) {
        if (!b.goal || b.goal.k !== 'panel') this.setGoalFor(b, { k: 'panel', n: b.react });
        if (this.botMove(b, now, dt, BSPEED)) { const w = b.react === 'ra' ? 'ha' : 'hb'; if (!sab[w] || sab[w] === b.id) sab[w] = b.id; }
        return;
      }
      if (sab.k === 'lights' && b.mode !== 'lights' && b.mode !== 'report' && Math.random() < .004) { b.mode = 'lights'; this.setGoalFor(b, { k: 'panel', n: 'lights' }); b.wait = 0; }
    }
    if (b.mode === 'lights') {
      if (!sab || sab.k !== 'lights') { b.mode = 'work'; b.goal = null; }
      else if (this.botMove(b, now, dt, BSPEED)) { b.wait += dt; if (b.wait > 2) { this.endSab(now); b.mode = 'work'; b.goal = null; b.wait = 0; } }
      return;
    }
    if (b.mode === 'report') { if (!b.goal) b.mode = 'work'; else { this.botMove(b, now, dt, BSPEED); return; } }
    /* imposter hunting */
    if (imp && b.alive) this.botImp(b, now, dt);
    if (b.mode === 'hunt' || b.mode === 'stalk') { if (b.mode === 'hunt') return; }
    /* working */
    if (b.wait > 0) {
      b.wait -= dt;
      if (b.wait <= 0 && b.goal && b.goal.k === 'st') {
        const i = b.goal.i; if (!b.done.includes(i) && b.tasks.includes(i)) { b.done.push(i); if (!imp) this.checkWin(); }
        b.goal = null;
      }
      return;
    }
    if (!b.goal) b.goal = this.pickGoal(b);
    if (this.botMove(b, now, dt, BSPEED)) {
      if (b.goal && b.goal.k === 'st') { const want = b.tasks.includes(b.goal.i) && !b.done.includes(b.goal.i); b.wait = want ? rnd(2.4, 4.8) : rnd(.8, 2); if (!want) { b.goal = null; } else b.wait = rnd(2.4, 4.8); }
      else b.goal = null;
    }
  }
  botImp(b, now, dt) {
    /* occasionally sabotage lights (humans see this as a real threat, bots fix it) */
    if (!this.sab && now >= this.sabCd && now - this.playT0 > 40000 && Math.random() < .0015) { this.sab = { k: 'lights', t0: now }; this.list().forEach(q => { if (q.role === 'imp') q.yk = ''; }); }
    if (b.mode === 'hunt') {
      const v = this.ps[b.hunt];
      if (!v || !v.alive || v.role !== 'crew' || now - b.huntT > 14000) { b.mode = 'work'; b.goal = null; return; }
      b.goal = { k: 'pt', x: v.x, y: v.y };
      const d = dist(b, v);
      if (d < KRANGE - 8 && los(b.x, b.y, v.x, v.y)) {
        const wit = this.list().filter(q => q.alive && q !== v && q !== b && q.role !== 'imp' && dist(q, b) < 300 && los(q.x, q.y, b.x, b.y)).length;
        if (!wit || now - b.huntT > 9000 || Math.random() < .02) {
          if (this.doKill(b, now)) { b.mode = 'work'; b.goal = null; b.fleeing = true; const far = ST.filter(s => STF[s.id][Math.floor(b.y / TS) * GW + Math.floor(b.x / TS)] > 14); b.goal = { k: 'st', i: (far.length ? pick(far) : pick(ST)).id }; b.wait = 0; return; }
        }
      }
      this.botMove(b, now, dt, BSPEED * 1.04);
      return;
    }
    if (now >= b.kabs && Math.random() < .06) {
      const crew = this.list().filter(q => q.alive && q.role === 'crew' && !q.bot === false || (q.alive && q.role === 'crew'));
      if (crew.length) { crew.sort((p, q) => dist(b, p) - dist(b, q)); const v = pick(crew.slice(0, 3)); b.mode = 'hunt'; b.hunt = v.id; b.huntT = now; b.wait = 0; }
    }
  }
  botPlan(now) {
    for (const b of this.list()) if (b.bot) this.ensureBotMeet(b, now, true);
  }
  ensureBotMeet(b, now, reset) {
    if (!b.alive) return;
    if (reset || !b.chatAt) { b.chatAt = now + rnd(1800, 9000); b.chatN = Math.random() < .5 ? 2 : 1; if (b.saw) { b.chatAt = now + rnd(900, 3200); b.chatN = 2; } }
    if (this.sub === 'vote') b.voteAt = now + rnd(1500, 9000); else b.voteAt = now + rnd(15000, 24000);
  }
  topAccused(exceptId) {
    let best = null, bc = 0;
    for (const q of this.list()) if (q.alive && q.id !== exceptId) { const c = this.accuse[q.id] || 0; if (c > bc) { bc = c; best = q; } }
    return best ? { p: best, c: bc } : null;
  }
  botLine(b) {
    const others = this.list().filter(q => q.alive && q.id !== b.id);
    const k = b.saw && this.ps[b.saw.killer], v = b.saw && this.ps[b.saw.victim];
    if (k) return pick([`${k.name} killed ${v ? v.name : 'them'}! I saw it!`, `it was ${k.name}!! saw them kill`, `vote ${k.name}, I saw the kill`]);
    const top = this.topAccused(b.id), room = b.lastRoom, br = this.mc && this.mc.room;
    if (b.role === 'imp') {
      const crew = others.filter(q => q.role === 'crew');
      if (this.accuse[b.id] >= 1 && Math.random() < .6) return pick(["it's not me!", 'why me? I was doing tasks', `I was in ${room}, ask anyone`]);
      return pick([`I was in ${room}`, `body was in ${br}? I was nowhere near`, crew.length ? `I think ${pick(crew).name} is sus` : 'skip?', 'where was everyone?', crew.length ? `${pick(crew).name} was acting weird` : 'idk']);
    }
    if (top && top.c >= 1 && Math.random() < .45) return pick([`I think it's ${top.p.name}`, `${top.p.name} is sus`, `sounds like ${top.p.name}`]);
    return pick([`I was in ${room}`, `doing tasks in ${room}`, `where was the body? ${br ? 'in ' + br + '?' : ''}`, 'anyone see anything?', "I didn't see anything", 'no idea honestly', others.length ? `${pick(others).name} where were you?` : 'hm']);
  }
  botMeet(now) {
    for (const b of this.list()) {
      if (!b.bot || !b.alive) continue;
      if (b.chatN > 0 && now >= b.chatAt) { this.say(b, this.botLine(b)); b.chatN--; b.chatAt = now + rnd(3500, 7000); }
      if (this.sub === 'vote' && !(b.id in this.votes) && now >= b.voteAt) this.botVote(b, now);
    }
  }
  botVote(b, now) {
    const alive = this.list().filter(q => q.alive && q.id !== b.id); let t = 'skip';
    if (b.role === 'crew') {
      const k = b.saw && this.ps[b.saw.killer];
      if (k && k.alive) t = k.id;
      else { const top = this.topAccused(b.id); if (top && Math.random() < .68) t = top.p.id; else if (alive.length && Math.random() < .3) t = pick(alive).id; }
    } else {
      const crew = alive.filter(q => q.role === 'crew'), top = this.topAccused(b.id);
      if (top && top.p.role === 'crew' && Math.random() < .7) t = top.p.id; else if (crew.length && Math.random() < .55) t = pick(crew).id;
    }
    this.votes[b.id] = t; this.afterVote(now);
  }

  /* ---------- networking out ---------- */
  metaBase() {
    const ph = this.phase, sub = this.sub;
    return {
      ph, sub, rd: this.rd, sp: this.sp, rn: this.num,
      ps: this.list().map(p => ({ i: p.id, n: p.name, c: p.ci, a: p.alive ? 1 : 0, b: p.bot ? 1 : 0 })),
      bodies: this.bodies.map(b => ({ x: Math.round(b.x), y: Math.round(b.y), c: b.c, i: b.id })),
      tot: this.totals(),
      sab: this.sab ? { k: this.sab.k, h: this.sab.k === 'reactor' ? [this.sab.ha ? 1 : 0, this.sab.hb ? 1 : 0] : undefined } : null,
      mc: ph === 'meeting' ? this.mc : undefined,
      voted: ph === 'meeting' && sub === 'vote' ? Object.keys(this.votes).map(Number) : undefined,
      votes: ph === 'meeting' && (sub === 'result' || sub === 'eject') ? this.votes : undefined,
      chat: ph === 'meeting' ? this.chat : undefined,
      ej: ph === 'meeting' && (sub === 'result' || sub === 'eject') ? this.ej : undefined,
      win: ph === 'end' ? this.win : undefined, why: ph === 'end' ? this.why : undefined,
      imps: ph === 'end' ? this.list().filter(p => p.role === 'imp').map(p => p.id) : undefined
    };
  }
  sendYou(p, now) {
    const imp = p.role === 'imp';
    const imps = (imp || !p.alive || this.phase === 'end') ? this.list().filter(q => q.role === 'imp' && q.id !== p.id).map(q => q.id) : [];
    const key = JSON.stringify([p.role, p.tasks, p.done, imps, p.em, imp ? p.kabs : 0, imp ? this.sabCd : 0, p.vent, this.sp, p.alive]);
    if (key === p.yk) return; p.yk = key;
    p.ws.send(JSON.stringify({ t: 'y', role: p.role, tasks: p.tasks, done: p.done, imps, em: p.em, kc: imp ? Math.max(0, p.kabs - now) : 0, sc: imp ? Math.max(0, this.sabCd - now) : 0, v: p.vent }));
  }
  posMsg(r) {
    const ph = this.phase; if (ph === 'meeting' || ph === 'idle') return null;
    const full = ph !== 'play', arr = [];
    for (const p of this.list()) {
      if (p.id !== r.id && !full && r.alive) {
        if (!p.alive) continue; if (p.vent >= 0 && r.role !== 'imp') continue;
        if (Math.abs(p.x - r.x) > CULL || Math.abs(p.y - r.y) > CULL) continue;
      }
      arr.push(p.id, Math.round(p.x), Math.round(p.y), p.vent >= 0 ? 1 : 0);
    }
    return '{"t":"p","a":[' + arr.join(',') + ']}';
  }
  syncTo(p, now) { p.yk = ''; this.lastKey = ''; }
  broadcast(now) {
    const hs = this.list().filter(p => !p.bot && p.ws && p.ws.readyState === 1); if (!hs.length) return;
    const base = this.metaBase(), key = JSON.stringify(base); let metaStr = null;
    if (key !== this.lastKey || now - this.lastMetaT >= 1000) {
      this.lastKey = key; this.lastMetaT = now;
      metaStr = JSON.stringify(Object.assign({ t: 'm', mt: Math.max(0, this.phEnd - now), sl: this.sab && this.sab.k === 'reactor' ? Math.max(0, this.sab.until - now) : 0 }, base));
    }
    for (const r of hs) {
      if (r.ws.bufferedAmount > 3e5) continue;
      if (metaStr) r.ws.send(metaStr);
      this.sendYou(r, now);
      const pm = this.posMsg(r); if (pm) r.ws.send(pm);
    }
  }
}

/* ============================ http ============================ */
const CSP = "frame-ancestors 'self' https://twitter.com https://*.twitter.com https://x.com https://*.x.com";
const rooms = new Set();
const stats = () => { let h = 0; for (const r of rooms) h += r.humans(); return { players: h, rooms: rooms.size }; };
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/card.png') {
    const f = path.join(__dirname, 'card.png'); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public,max-age=3600' }); return fs.createReadStream(f).pipe(r);
  }
  if (u.pathname === '/health') { r.writeHead(200); return r.end('ok'); }
  if (u.pathname === '/stats') { r.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-cache' }); return r.end(JSON.stringify(stats())); }
  if (u.pathname === '/' || u.pathname === '/play') {
    const origin = (process.env.PUBLIC_URL || ((q.headers['x-forwarded-proto'] || 'http') + '://' + q.headers.host)).replace(/\/$/, '');
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP, 'cache-control': 'no-cache' });
    return r.end(PAGE.replace(/{{ORIGIN}}/g, origin));
  }
  r.writeHead(404); r.end();
});
const wss = new WebSocketServer({ server: srv, maxPayload: 1024, perMessageDeflate: false });

/* ============================ lobby manager ============================ */
function place() {
  let best = null;
  for (const r of rooms) { const h = r.humans(); if (h < ROOM_SIZE && (!best || h > best.humans())) best = r; }
  if (!best && rooms.size < MAX_ROOMS) { best = new Room(); rooms.add(best); }
  return best;
}
setInterval(() => {
  const now = Date.now();
  for (const r of rooms) { try { r.tick(now); } catch (e) { console.error('room tick error', e); } if (r.dead) rooms.delete(r); }
}, 66);
wss.on('connection', ws => {
  ws.isAlive = true; ws.on('pong', () => ws.isAlive = true);
  let p = null, room = null, cnt = 0, cntT = Date.now();
  ws.on('message', m => {
    const now = Date.now(); if (now - cntT > 1000) { cnt = 0; cntT = now; } if (++cnt > 90) return;
    let d; try { d = JSON.parse(m); } catch { return; } if (!d || typeof d !== 'object') return;
    try {
      if (d.t === 'join' && !p) {
        room = place(); if (!room) { ws.send('{"t":"full"}'); return ws.close(); }
        const name = String(d.name || 'anon').replace(/[<>&"]/g, '').trim().slice(0, 12) || 'anon';
        p = room.join(ws, name, d.c | 0);
        ws.send(MAPMSG); ws.send(JSON.stringify({ t: 'id', id: p.id, rn: room.num })); room.syncTo(p, now); return;
      }
      if (p && !room.dead) room.handle(p, d, now);
    } catch (e) { console.error('handler error', e); }
  });
  ws.on('close', () => { if (p && room) { room.leave(p); if (room.dead) rooms.delete(room); } });
  ws.on('error', () => { });
});
setInterval(() => wss.clients.forEach(w => { if (!w.isAlive) return w.terminate(); w.isAlive = false; w.ping(); }), 30000);
process.on('uncaughtException', e => console.error('uncaught', e));
srv.listen(PORT, () => console.log('SUSSY on :' + PORT));
