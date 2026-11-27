// Bigg Toss client: input, prediction for the local player, rendering, HUD.

import { drawAvatar, drawBust, star, OUT } from './avatar.js';
import { House, drawEye } from './house.js';
import { sfx, initAudio, setMuted } from './audio.js';

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const q = Array.isArray(r) ? r : [r, r, r, r];
    const [a, b, c, d] = q.length === 4 ? q : [q[0], q[0], q[0], q[0]];
    this.moveTo(x + a, y); this.arcTo(x + w, y, x + w, y + h, b); this.arcTo(x + w, y + h, x, y + h, c);
    this.arcTo(x, y + h, x, y, d); this.arcTo(x, y, x + w, y, a); this.closePath();
  };
}

const $ = (s) => document.querySelector(s);
const TAU = Math.PI * 2;
const SIGN = 'Bangers, Impact, "Arial Black", sans-serif';
const BODY = '"Baloo 2", system-ui, sans-serif';
const SPEED = 215, SWIM = 132, MAXHP = 5, SLAP_CD = 0.44;
const SLAP_WORDS = ['THAPPAD!', 'CHATAK!', 'SATAAK!', 'DHISHOOM!', 'TADAAK!', 'OYE HOYE!'];
const PUNCH_WORDS = ['PUNCH!', 'KNOCKOUT!', 'DHISHOOM!'];
const BLOCK_WORDS = ['BLOCKED!', 'NO ENTRY!', 'BHAI!', 'NICE TRY!'];
const BAG_RANGE = 78;   // keep in step with BAG_RANGE in server.py
const CARD_BG = ['#8a4fd0', '#16a6a0', '#ff9d3c', '#ffc928', '#2f7de1', '#ff7a59', '#ffc928', '#39d98a', '#8a4fd0', '#ff8fc0', '#2f7de1', '#ff9d3c', '#16a6a0', '#ff6fae', '#ffc928', '#e3476b', '#39c6e8', '#ffb03c'];
const SEAT_PROMPT = { sit: 'Sit', bed: 'Sleep (Bigg Boss is watching)', throne: 'Take the Teapot Throne (+TRP)', pod: 'Enter the Jeevandaan pod', conf: 'Confess to Bigg Boss', basket: 'Hop in the balloon' };
const AMBIENT = [
  'Bigg Boss chahte hain ki sabhi gharwale garden area mein ikattha hon.',
  'Yaad rahe: is ghar mein 104 cameras hain. Sab dikh raha hai.',
  'Room 2X ke pods mein baithkar khoya hua Jeevandaan wapas paayein.',
  'Teapot throne par baithne wale ko har second TRP milti hai.',
  'Din mein sona mana hai. Murga sab dekh raha hai.',
  'Hawa mein ho toh thappad nahi lagta. Jump karke bachiye!',
];
const CONFESS = [
  '{n}, sach bataiye: aaj kitne thappad maare?',
  'Bigg Boss ko aapka game thoda weak lag raha hai, {n}.',
  '{n}, ye baat is kamre se bahar nahi jaani chahiye. (104 cameras: "theek hai.")',
  'Aap nominated hain, {n}. Mazaak tha. Ya shayad nahi.',
  'Bigg Boss chahte hain ki aap teapot throne par kabza karein.',
];

const canvas = $('#game'), ctx = canvas.getContext('2d');
let world, data, cast, house, mini;
let me = -1, houseCode = '', joined = false, picked = -1, switching = false;
const ents = [], fx = [], keys = new Set();
const cam = { x: 1500, y: 1150, shake: 0, zoom: 1, vx: 0, vy: 0, vw: 0, vh: 0 };
const my = { kx: 0, ky: 0, stun: 0, ignoreSeat: 0, seatedAt: 0, nextSlap: 0, sendT: 0, lastSent: '', keepT: 0, room: '', joinT: 0, confT: 0, sayT: 0, wantSeat: -1 };
const stick = { x: 0, y: 0, id: null };
let T = 0, lastTs = 0, mapT = 0, ambientT = 40, boardText = [];
let taken = {};
const pick = (a) => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const params = new URLSearchParams(location.search);
let urlCode = (params.get('h') || '').toUpperCase();
if (!/^[A-Z0-9]{3,8}$/.test(urlCode)) urlCode = '';

function makeEnt(i) {
  return { i, L: cast[i] || data.host, x: 0, y: 0, tx: 0, ty: 0, f: 1, human: 0, nick: '', hp: MAXHP, lives: 2, trp: 0, seat: -1, slaps: 0,
    phase: i, walk: 0, moving: false, slapT: 0, hitT: 0, z: 0, vz: 0, base: 0, lift: 0, sortY: 0, cheek: 0, say: '', sayT: 0, koT: 0, swim: false, scale: 1 };
}
const nameOf = (e) => (e.human && e.nick ? `${e.nick} (${e.L.short})` : e.L.short);

// --------------------------------------------------------------- collision
// Walls (anything outside the rooms and doorways) always block. Furniture
// blocks too, unless it has a top surface and your feet are at least that
// high: alt = height of the feet above the floor (what you stand on + jump).
const STEP_UP = 3;
let solids = [];   // [{ r: [x, y, w, h], top, sy }] built from world.props at boot
function ptOk(x, y, alt) {
  let ok = false;
  for (const r of world.walk) if (x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]) { ok = true; break; }
  if (!ok) return false;
  for (const s of solids) { const r = s.r; if (x > r[0] && x < r[0] + r[2] && y > r[1] && y < r[1] + r[3] && (!s.top || s.top > alt + STEP_UP)) return false; }
  return true;
}
function blocked(x, y, alt = 0) {
  for (const [sx, sy] of world.samples) if (!ptOk(x + sx, y + sy, alt)) return true;
  return false;
}
// Height of the furniture under the feet box (0 = floor). Also leaves the
// draw-order key of that furniture in surfSort so we get drawn on top of it.
let surfSort = 0;
function surfaceAt(x, y) {
  let top = 0; surfSort = 0;
  for (const s of solids) {
    if (!s.top) continue;
    const r = s.r;
    for (const [sx, sy] of world.samples) {
      const px = x + sx, py = y + sy;
      if (px > r[0] && px < r[0] + r[2] && py > r[1] && py < r[1] + r[3]) { if (s.top > top) top = s.top; if (s.sy > surfSort) surfSort = s.sy; break; }
    }
  }
  return top;
}
// Keep e.base (what the feet rest on) in step with the position. The jump
// height is adjusted so the character does not pop when stepping on or off.
function syncBase(e) {
  const b = surfaceAt(e.x, e.y);
  if (b !== e.base) { e.z = Math.max(0, e.base + e.z - b); e.base = b; }
  e.lift = b; e.sortY = b ? Math.max(e.y, surfSort + 0.6) : e.y;
}
function wallFree(x1, y1, x2, y2) {   // straight line that never touches a wall
  const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 4));
  for (let i = 1; i <= n; i++) if (blocked(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n, 1e9)) return false;
  return true;
}
function unstick(e) {
  // nearest free spot, preferring ones on our side of the wall
  for (const sameSide of [true, false]) for (let r = 6; r <= 120; r += 6) for (let a = 0; a < TAU; a += Math.PI / 8) {
    const x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r;
    if (blocked(x, y) || (sameSide && !wallFree(e.x, e.y, x, y))) continue;
    e.x = x; e.y = y; return;
  }
}
function inWater(x, y) { const [wx, wy, ww, wh] = world.water; return x > wx + 6 && x < wx + ww - 6 && y > wy + 6 && y < wy + wh - 6; }
function roomAt(x, y) { for (const r of world.rooms) { const [rx, ry, rw, rh] = r.r; if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) return r; } return null; }
function rectDist(r, x, y) { return Math.hypot(Math.max(r[0] - x, 0, x - (r[0] + r[2])), Math.max(r[1] - y, 0, y - (r[1] + r[3]))); }
const volAt = (x, y) => (me < 0 ? 0 : clamp(1.15 - Math.hypot(x - ents[me].x, y - ents[me].y) / 900, 0, 1));

// ------------------------------------------------------------------ network
let ws = null, wsOpen = false, retry = 0;
let wantJoin = false;
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => { wsOpen = true; retry = 0; if (joined || wantJoin) { wantJoin = false; sendJoin(); } else send({ t: 'peek', house: urlCode || null }); };
  ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } onMessage(m); };
  ws.onclose = () => {
    wsOpen = false;
    if (joined) toast('Connection lost. Reconnecting…', 4000);
    setTimeout(connect, Math.min(5000, 500 * 2 ** retry++));
  };
}
function send(o) { if (wsOpen) ws.send(JSON.stringify(o)); }
function sendJoin() { send({ t: 'join', c: cast[joined ? me : picked].id, house: houseCode || urlCode || null }); }
setInterval(() => { if (!joined) send({ t: 'peek', house: urlCode || null }); }, 8000);

function onMessage(m) {
  switch (m.t) {
    case 's': {
      const p = m.p;
      for (let i = 0; i < cast.length; i++) { const e = ents[i]; e.tx = p[i * 3]; e.ty = p[i * 3 + 1]; if (i !== me) e.tf = p[i * 3 + 2]; }
      if (m.h) hostAt(m.h);
      break;
    }
    case 'r': onRoster(m.e); break;
    case 'slap': onSlap(m); break;
    case 'jump': { const e = ents[m.i]; if (e && m.i !== me && e.z === 0) { e.vz = 430; sfx.jump(volAt(e.x, e.y) * 0.6); } break; }
    case 'say': { const e = ents[m.i]; if (e) say(e, quipFor(e, m.q), e.L.host ? 3.6 : undefined); break; }
    case 'bb': onBiggBoss(m); break;
    case 'tp': { const e = ents[me]; if (e) { e.x = m.x; e.y = m.y; e.koT = 0; my.kx = my.ky = 0; puff(e.x, e.y, '#fff'); sfx.pop(); } break; }
    case 'lobby': taken = m.taken || {}; refreshCards(); { const el = $('#live'); el.hidden = !m.online; el.textContent = `${m.online} playing right now`; } break;
    case 'taken': taken = m.taken || {}; refreshCards(); joined = false; toast('That housemate was just taken in this house. Pick another!'); showSelect(true); break;
    case 'full': toast('The house is full right now. Try again in a minute.'); showSelect(true); break;
    case 'welcome': onWelcome(m); break;
    case 'noswitch': $('#enter').disabled = picked < 0; toast(m.why === 'taken' ? 'Someone just took that housemate. Pick another!' : m.why === 'ko' ? 'Not in the middle of a knockout. Try again in a moment.' : 'Easy! Wait a few seconds between costume changes.'); break;
  }
}

function onWelcome(m) {
  const swapped = joined && me !== m.you;
  me = m.you; houseCode = m.house; joined = true; picked = me; endSwitch();
  m.p.forEach((v, k) => { const e = ents[(k / 3) | 0]; if (k % 3 === 0) e.x = e.tx = v; else if (k % 3 === 1) e.y = e.ty = v; else e.f = e.tf = v; });
  onRoster(m.r);
  if (m.h) hostAt(m.h, true);
  const e = ents[me]; e.x = m.x; e.y = m.y; e.seat = -1; e.koT = 0;
  if (blocked(e.x, e.y, 1e9)) unstick(e);   // only walls count: you may legitimately be up on furniture
  cam.x = e.x; cam.y = e.y - 40;
  my.joinT = T; my.room = '';
  history.replaceState(null, '', `?h=${houseCode}`);
  showSelect(false);
  buildHud(swapped);
  if (swapped) { puff(e.x, e.y, '#ffe14a'); sfx.life(0.7); }
}

// The host is not a contestant: the server sends him next to the cast arrays,
// and he only joins `ents` (for drawing, labels and speech) once it does.
function hostAt(h, snap) {
  if (!data.host) return;
  let e = ents[cast.length];
  if (!e) { e = makeEnt(cast.length); ents.push(e); snap = true; }
  e.tx = h[0]; e.ty = h[1]; e.tf = h[2];
  if (snap) { e.x = e.tx; e.y = e.ty; e.f = e.tf; }
}

function onRoster(list) {
  list.forEach((r, i) => {
    const e = ents[i], was = e.seat;
    e.human = r[0]; e.nick = r[1]; e.hp = r[2]; e.lives = r[3]; e.trp = r[4]; e.slaps = r[6];
    let seat = r[5];
    if (i === me && T < my.ignoreSeat) seat = was;
    if (seat !== was) {
      if (was >= 0 && seat < 0) { const s = world.seats[was]; e.x = s.ex; e.y = s.ey; }
      if (seat >= 0) { sfx.sit(volAt(world.seats[seat].x, world.seats[seat].y)); if (i === me) onSat(seat); }
      e.seat = seat;
    }
  });
  updateHud();
  if (switching) syncTaken();
}

function onSat(si) {
  my.seatedAt = T; my.kx = my.ky = 0;
  const k = world.seats[si].k;
  if (k === 'conf') { my.confT = T + 1; }
  if (k === 'bed') toast('Shhh… sona mana hai. The rooster is watching.');
  if (k === 'pod') toast(ents[me].lives < 2 ? 'Pressure pod engaged. Hold on for 6 seconds…' : 'You already have both lives. Tathas-two!');
}

function onSlap(m) {
  const a = ents[m.a]; if (!a) return;
  if (!(m.a === me && a.slapT > 0)) a.slapT = 0.001;
  const vol = volAt(a.x, a.y);
  if (m.v < 0) {
    if (m.b) onBagHit(a, m, vol); else { sfx.whoosh(vol); if (m.h) onHostBlock(a, m.a === me, vol); }
    return;
  }
  const v = ents[m.v];
  if (Math.abs(v.x - a.x) > 2) a.f = v.x > a.x ? 1 : -1;
  v.hitT = 0.8; v.cheek = 5;
  const hy = v.y - v.z - v.lift - 50 * v.L.h * v.scale;
  fx.push({ k: 'burst', x: v.x + m.nx * 6, y: hy - 22, text: pick(a.L.punch ? PUNCH_WORDS : SLAP_WORDS), t: 0, life: 0.8, rot: (Math.random() - 0.5) * 0.5 });
  for (let i = 0; i < 7; i++) { const an = Math.random() * TAU, sp = 90 + Math.random() * 150; fx.push({ k: 'star', x: v.x, y: hy, vx: Math.cos(an) * sp + m.nx * 120, vy: Math.sin(an) * sp - 90, t: 0, life: 0.55 + Math.random() * 0.3 }); }
  (a.L.punch ? sfx.punch : sfx.slap)(vol);
  if (!m.ko && Math.random() < 0.45) say(v, pick(data.ouch), 1.3);
  if (m.v === me) { my.kx = m.nx * 520; my.ky = m.ny * 520; my.stun = T + 0.7; cam.shake = 13; if (navigator.vibrate) navigator.vibrate(70); }
  if (m.a === me) { cam.shake = Math.max(cam.shake, 6); floater(v.x, hy - 46, m.ko === 2 ? '+60 TRP' : '+10 TRP', '#ffe14a'); }
  if (m.ko) {
    v.koT = 1.4; sfx.ko(vol);
    if (m.ko === 1) ticker(`${nameOf(v)} ne ek Jeevandaan kho diya. Tathas-two: ab sirf EK life bachi hai!`);
    else ticker(`${nameOf(v)}, aapka safar yahin samaapt hota hai. EVICTED by ${nameOf(a)}!`);
    if (m.v === me) flash(m.ko === 1 ? 'TATHAS-TWO!' : 'EVICTED!', m.ko === 1 ? 'You lost a Jeevandaan. Last life! The pods in Room 2X can restore it.' : 'Half your TRP is gone. Back in through the main gate.');
    else if (m.a === me) flash(m.ko === 2 ? 'EVICTION!' : 'JEEVANDAAN GONE!', m.ko === 2 ? `You sent ${v.L.short} out of the house. +50 TRP` : `${v.L.short} is on their last life.`);
  }
}

// Nobody in reach, but the garden punching bag was: it swings, and combos pay.
function onBagHit(a, m, vol) {
  const bag = house.bag; if (!bag) return;
  const [bx, by] = world.bag, mine = m.a === me;
  a.f = m.b;
  bag.hit(m.b, m.n % 10 === 0 ? 1.5 : 1);
  sfx.punch(vol * 0.9);
  const hy = by - 62;
  if (m.n === 1 || m.n % 5 === 0) fx.push({ k: 'burst', x: bx + m.b * 10, y: hy - 30, text: m.n % 10 === 0 ? `${m.n} COMBO!` : m.n >= 5 ? `x${m.n}!` : pick(PUNCH_WORDS), t: 0, life: 0.8, rot: (Math.random() - 0.5) * 0.5 });
  for (let i = 0; i < 4; i++) { const an = Math.random() * TAU, sp = 70 + Math.random() * 110; fx.push({ k: 'star', x: bx, y: hy, vx: Math.cos(an) * sp + m.b * 110, vy: Math.sin(an) * sp - 70, t: 0, life: 0.4 + Math.random() * 0.25 }); }
  if (mine) {
    cam.shake = Math.max(cam.shake, m.g > 1 ? 9 : 4);
    floater(bx + m.b * 26, hy - 20, `+${m.g} TRP`, '#ffe14a');
    if (m.g > 1) { sfx.ding(0.7); if (navigator.vibrate) navigator.vibrate(40); }
  }
}

// A swing at the host never lands.
function onHostBlock(a, mine, vol) {
  const h = ents[cast.length]; if (!h) return;
  if (Math.abs(h.x - a.x) > 2) a.f = h.x > a.x ? 1 : -1;
  const hy = headY(h) + 34;
  fx.push({ k: 'burst', x: (a.x + h.x) / 2, y: hy - 8, text: pick(BLOCK_WORDS), t: 0, life: 0.8, rot: (Math.random() - 0.5) * 0.4 });
  fx.push({ k: 'ring', x: h.x, y: h.y, t: 0, life: 0.45 });
  sfx.ding(vol * 0.8);
  if (mine) { cam.shake = Math.max(cam.shake, 5); my.kx = -a.f * 260; toast('You cannot slap the host. Bhai is untouchable.'); }
}

function onBiggBoss(m) {
  const e = ents[m.i]; if (!e) return;
  if (m.k === 'switch') { const o = ents[m.o]; ticker(m.i === me ? `Naya roop! Ab aap ${e.L.name} ho. Jagah, lives aur TRP wahi.` : `${m.n || (o ? o.L.short : 'Koi')} ab ${e.L.short} ban gaye! Pehchaan kaun?`); return; }
  const mine = m.i === me, n = nameOf(e), vol = mine ? 1 : volAt(e.x, e.y);
  if (m.k === 'join') ticker(mine ? `Bigg Toss ke ghar mein swagat hai, ${n}! Thappad maaro, TRP kamao.` : `${n} ne ghar mein entry le li hai!`);
  else if (m.k === 'captain') { ticker(`${n} teapot throne par! Captain ko har second TRP milti hai.`); sfx.ding(Math.max(0.3, vol)); }
  else if (m.k === 'rooster') { sfx.rooster(vol); if (vol > 0.2) ticker(`Kukdoo-koo! ${n}, is ghar mein din mein sona mana hai. -5 TRP.`); if (mine) flash('KUKDOO-KOO!', 'Sona mana hai. -5 TRP'); }
  else if (m.k === 'regain') { ticker(`${n} ko mila Extra Jeevandaan. Tathas-two!`); sfx.life(Math.max(0.3, vol)); if (mine) flash('JEEVANDAAN!', 'Both lives restored. Tathas-two!'); }
}

function quipFor(e, q) {
  const own = e.L.quips;
  if (e.L.host) { const list = q >= 500 ? e.L.block : own; return list[q % list.length]; }
  if (q >= 500) return own[q % own.length];
  const all = own.concat(data.generic);
  return all[q % all.length];
}
function say(e, text, dur = 2.7) { e.say = text; e.sayT = dur; if (dur > 2 && volAt(e.x, e.y) > 0.4) sfx.pop(0.5); }

// ------------------------------------------------------------------ actions
function doSlap() {
  if (!joined) return;
  const e = ents[me];
  if (e.seat >= 0) { standUp(); return; }
  if (T < my.nextSlap || T < my.stun || e.koT > 0) return;
  my.nextSlap = T + SLAP_CD; e.slapT = 0.001;
  send({ t: 'slap' });
}
function doJump() {
  if (!joined) return;
  const e = ents[me];
  if (e.seat >= 0) { standUp(); return; }
  if (e.z > 0 || e.koT > 0 || T < my.stun) return;
  e.vz = 430; sfx.jump(); send({ t: 'jump' });
}
function nearSeat() {
  const e = ents[me]; let best = -1, bd = 1e9;
  const used = new Set(ents.filter((o) => o.seat >= 0).map((o) => o.seat));
  world.seats.forEach((s, i) => {
    if (used.has(i) || rectDist(s.t, e.x, e.y) > 30) return;
    const d = Math.hypot(s.x - e.x, s.y - e.y);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
function standUp() {
  const e = ents[me]; if (e.seat < 0) return;
  const s = world.seats[e.seat];
  e.seat = -1; e.x = s.ex; e.y = s.ey; my.ignoreSeat = T + 0.45;
  if (blocked(e.x, e.y, 1e9)) unstick(e);
  send({ t: 'stand' }); sfx.sit(0.6);
}
function doSit() {
  if (!joined) return;
  const e = ents[me];
  if (e.seat >= 0) { standUp(); return; }
  if (e.koT > 0 || T < my.stun) return;
  const si = nearSeat();
  if (si < 0) { toast('Walk up to a sofa, bed, stool, pod or the teapot throne to sit.'); return; }
  my.ignoreSeat = 0; send({ t: 'sit', s: si });
}
function doSay(k) {
  if (!joined || T < my.sayT) return;
  my.sayT = T + 1.3;
  const own = cast[me].quips;
  const q = k < own.length ? 500 + k : own.length + ((Math.random() * data.generic.length) | 0);
  send({ t: 'say', q });
}

// -------------------------------------------------------------------- input
addEventListener('keydown', (ev) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.code)) ev.preventDefault();
  if (ev.repeat) return;
  if (switching) { if (ev.code === 'Escape' || ev.code === 'KeyC') closeSwitch(); else if (ev.code === 'Enter' && picked >= 0) $('#enter').click(); return; }
  keys.add(ev.code);
  if (!joined) { if (ev.code === 'Enter' && picked >= 0) $('#enter').click(); return; }
  initAudio();
  if (ev.code === 'Space') doJump();
  else if (ev.code === 'KeyF' || ev.code === 'KeyJ' || ev.code === 'Enter') doSlap();
  else if (ev.code === 'KeyE') doSit();
  else if (ev.code === 'KeyM') toggleMute();
  else if (ev.code === 'KeyC') openSwitch();
  else if (/^Digit[1-4]$/.test(ev.code)) doSay(+ev.code[5] - 1);
});
addEventListener('keyup', (ev) => keys.delete(ev.code));
addEventListener('blur', () => keys.clear());
canvas.addEventListener('pointerdown', (ev) => { if (joined && ev.pointerType === 'mouse') { initAudio(); doSlap(); } });
addEventListener('contextmenu', (ev) => ev.preventDefault());

function setupTouch() {
  const el = $('#stick'), knob = el.firstElementChild;
  const move = (ev) => {
    const r = el.getBoundingClientRect(), max = r.width / 2 - 8;
    let dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2);
    const m = Math.hypot(dx, dy); if (m > max) { dx *= max / m; dy *= max / m; }
    knob.style.transform = `translate(${dx}px,${dy}px)`; stick.x = dx / max; stick.y = dy / max;
  };
  const end = (ev) => { if (ev.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; };
  el.addEventListener('pointerdown', (ev) => { initAudio(); stick.id = ev.pointerId; el.setPointerCapture(ev.pointerId); move(ev); });
  el.addEventListener('pointermove', (ev) => { if (ev.pointerId === stick.id) move(ev); });
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  const bind = (id, fn) => $(id).addEventListener('pointerdown', (ev) => { ev.preventDefault(); initAudio(); fn(); });
  bind('#tSlap', doSlap); bind('#tJump', doJump); bind('#tSit', doSit); bind('#tSay', () => doSay((Math.random() * 3) | 0));
}

// --------------------------------------------------------------- simulation
function moveMe(dt) {
  const e = ents[me];
  let ix = stick.x, iy = stick.y;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iy -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iy += 1;
  const mag = Math.hypot(ix, iy); if (mag > 1) { ix /= mag; iy /= mag; }
  const frozen = T < my.stun || e.koT > 0;
  if (e.seat >= 0) { if (mag > 0.6 && !frozen && T > my.seatedAt + 0.4) standUp(); e.moving = false; return; }
  let vx = my.kx, vy = my.ky;
  my.kx *= Math.exp(-dt * 9); my.ky *= Math.exp(-dt * 9);
  if (!frozen) {
    const sp = e.swim ? SWIM : SPEED; vx += ix * sp; vy += iy * sp;
    if (Math.abs(ix) > 0.15) e.f = ix > 0 ? 1 : -1;
  }
  syncBase(e);
  if (blocked(e.x, e.y, e.base + e.z)) { unstick(e); syncBase(e); }
  // Move in steps of at most 4 px so nothing can be skipped over, however
  // hard the slap or slow the frame.
  const mx = vx * dt, mv = vy * dt, steps = Math.max(1, Math.ceil(Math.max(Math.abs(mx), Math.abs(mv)) / 4));
  for (let k = 0; k < steps; k++) {
    const alt = e.base + e.z;
    let moved = false;
    const nx = e.x + mx / steps; if (!blocked(nx, e.y, alt)) { e.x = nx; moved = true; } else my.kx = 0;
    const ny = e.y + mv / steps; if (!blocked(e.x, ny, alt)) { e.y = ny; moved = true; } else my.ky = 0;
    if (moved) syncBase(e); else break;
  }
  e.moving = mag > 0.12 && !frozen;

  const r = roomAt(e.x, e.y);
  if (r && r.id !== my.room) { my.room = r.id; const tag = $('#roomtag'); tag.textContent = r.name; tag.classList.add('show'); clearTimeout(tag._t); tag._t = setTimeout(() => tag.classList.remove('show'), 1800); }

  // contextual prompt: a seat to take, or the punching bag to hit (-2)
  let si = nearSeat(); const pr = $('#prompt');
  if (si < 0 && e.seat < 0 && Math.hypot(world.bag[0] - e.x, (world.bag[1] - e.y) * 1.5) < BAG_RANGE) si = -2;
  if (si !== my.wantSeat) {
    my.wantSeat = si;
    pr.classList.toggle('show', si !== -1); $('#tSit').classList.toggle('hot', si >= 0);
    if (si >= 0) pr.innerHTML = `<kbd>E</kbd>${SEAT_PROMPT[world.seats[si].k]}`;
    else if (si === -2) pr.innerHTML = '<kbd>F</kbd>Punch the bag (+TRP)';
  }
}

function netTick(dt) {
  const e = ents[me];
  my.sendT -= dt; my.keepT -= dt;
  if (my.sendT > 0) return;
  const s = `${Math.round(e.x)},${Math.round(e.y)},${e.f}`;
  if (s !== my.lastSent || my.keepT <= 0) {
    my.lastSent = s; my.sendT = 1 / 12; my.keepT = 1;
    if (e.seat < 0) send({ t: 'p', x: Math.round(e.x), y: Math.round(e.y), f: e.f }); else send({ t: 'k' });
  }
}

function updateEnts(dt) {
  for (const e of ents) {
    const seat = e.seat >= 0 ? world.seats[e.seat] : null;
    if (seat) { e.x = seat.x; e.y = seat.y; if (seat.f) e.f = seat.f; e.moving = false; e.base = e.lift = 0; e.sortY = e.y; }
    else if (e.i !== me) {
      const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.hypot(dx, dy);
      if (d > 240) { e.x = e.tx; e.y = e.ty; e.koT = 0; if (joined) puff(e.x, e.y, '#fff'); }
      else { const k = Math.min(1, dt * 13); e.x += dx * k; e.y += dy * k; }
      e.moving = d > 2.4;
      if (e.tf && e.hitT <= 0) e.f = e.tf;
      // standing on furniture is a pure function of where the feet are
      e.base = surfaceAt(e.x, e.y); e.sortY = e.base ? Math.max(e.y, surfSort + 0.6) : e.y;
      e.lift += (e.base - e.lift) * Math.min(1, dt * 16);
    }
    e.walk += ((e.moving ? 1 : 0) - e.walk) * Math.min(1, dt * 12);
    if (e.moving) e.phase += dt * (e.swim ? 7 : 11.5);
    if (e.z > 0 || e.vz > 0) {
      e.z += e.vz * dt; e.vz -= 1500 * dt;
      if (e.z <= 0) { e.z = 0; e.vz = 0; if (inWater(e.x, e.y)) splash(e); else if (e.i === me) sfx.land(); }
    }
    if (e.slapT > 0) { e.slapT += dt / 0.34; if (e.slapT >= 1) e.slapT = 0; }
    e.hitT = Math.max(0, e.hitT - dt); e.cheek = Math.max(0, e.cheek - dt); e.sayT = Math.max(0, e.sayT - dt);
    e.koT = Math.max(0, e.koT - dt);
    const sw = !seat && e.z < 4 && inWater(e.x, e.y);
    if (sw && !e.swim && joined) splash(e);
    e.swim = sw;
    const m = mini, inMini = e.x > m[0] - 8 && e.x < m[0] + m[2] + 8 && e.y > m[1] - 6 && e.y < m[1] + m[3] + 16;
    e.scale += ((inMini ? 0.58 : 1) - e.scale) * Math.min(1, dt * 10);
  }
  // Bigg Boss talks to you in the confession room
  if (joined) {
    const e = ents[me];
    if (e.seat >= 0 && world.seats[e.seat].k === 'conf' && T > my.confT) { my.confT = T + 5.5; ticker('Bigg Boss: ' + pick(CONFESS).replace('{n}', e.nick || e.L.short)); sfx.ding(0.6); }
    ambientT -= dt;
    if (ambientT <= 0) { ambientT = 45 + Math.random() * 30; if (!tickQ.length) ticker(pick(AMBIENT)); }
  }
}

// ----------------------------------------------------------------- effects
function puff(x, y, col) { for (let i = 0; i < 10; i++) { const a = Math.random() * TAU, s = 40 + Math.random() * 90; fx.push({ k: 'dot', x, y: y - 30, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.5, col, r: 7 }); } }
function splash(e) {
  const v = volAt(e.x, e.y); if (v > 0.05) sfx.splash(v);
  for (let i = 0; i < 12; i++) { const a = -Math.PI * Math.random(), s = 80 + Math.random() * 140; fx.push({ k: 'dot', x: e.x, y: e.y - 8, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, t: 0, life: 0.6, col: '#d9f6ff', r: 4.5, g: 520 }); }
  fx.push({ k: 'ring', x: e.x, y: e.y, t: 0, life: 0.7 });
}
function floater(x, y, text, col) { fx.push({ k: 'float', x, y, text, col, t: 0, life: 1.1 }); }

function drawFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const p = fx[i]; p.t += dt;
    if (p.t >= p.life) { fx.splice(i, 1); continue; }
    const k = p.t / p.life;
    if (p.k === 'dot' || p.k === 'star') {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || (p.k === 'star' ? 380 : 0)) * dt;
      ctx.globalAlpha = 1 - k * k;
      if (p.k === 'star') star(ctx, p.x, p.y, 7 * (1 - k * 0.4), '#ffe14a');
      else { ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - k * 0.5), 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    } else if (p.k === 'ring') {
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 12 + k * 40, 5 + k * 15, 0, 0, TAU); ctx.stroke();
    } else if (p.k === 'float') {
      ctx.globalAlpha = 1 - k * k; ctx.font = `400 24px ${SIGN}`; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
      ctx.lineWidth = 5; ctx.strokeStyle = OUT; ctx.strokeText(p.text, p.x, p.y - k * 46); ctx.fillStyle = p.col; ctx.fillText(p.text, p.x, p.y - k * 46);
      ctx.globalAlpha = 1;
    } else if (p.k === 'burst') {
      const pop = k < 0.18 ? k / 0.18 : 1, s = 0.5 + pop * 0.7 + (k < 0.3 ? Math.sin(k * 30) * 0.05 : 0);
      ctx.save(); ctx.translate(p.x, p.y - k * 14); ctx.rotate(p.rot); ctx.scale(s, s); ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.beginPath();
      for (let j = 0; j < 22; j++) { const a = (j * TAU) / 22, r = j % 2 ? 34 : 54 + (j % 4 ? 0 : 8); ctx.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 0.78); }
      ctx.closePath(); ctx.fillStyle = '#ffe14a'; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.font = `400 ${p.text.length > 8 ? 22 : 27}px ${SIGN}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5; ctx.strokeText(p.text, 0, 2); ctx.fillStyle = '#ff3d6e'; ctx.fillText(p.text, 0, 2);
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------- rendering
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
  cam.dpr = dpr; cam.zoom = clamp(Math.min(innerWidth / 1240, innerHeight / 730), 0.55, 1.6);
}

function drawEnt(e) {
  const L = e.L, seat = e.seat >= 0 ? world.seats[e.seat] : null, s = e.scale;
  ctx.save(); ctx.translate(e.x, e.y);
  if (seat && seat.k === 'bed') {
    drawAvatar(ctx, L, { sleep: 1, rot: seat.a, t: T });
    ctx.font = `400 ${15 + Math.sin(T * 3) * 2}px ${SIGN}`; ctx.fillStyle = '#fff'; ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.textAlign = 'center';
    const zx = 20 + Math.sin(T * 2) * 3, zy = -34 - ((T * 14) % 16);
    ctx.strokeText('Zzz', zx, zy); ctx.fillText('Zzz', zx, zy);
    ctx.restore(); return;
  }
  if (e.koT > 0) { // spin off into the sky
    const k = 1 - e.koT / 1.4;
    ctx.globalAlpha = clamp(1.2 - k * 1.2, 0, 1); ctx.translate(0, -k * k * 260 - 30); ctx.rotate(k * 16 * (e.f || 1)); ctx.translate(0, 30);
    drawAvatar(ctx, L, { t: T, f: e.f, hit: 1, cheek: 1 });
    ctx.restore(); return;
  }
  if (e.lift > 0.5) ctx.translate(0, -e.lift);   // standing on a bed, sofa or table
  if (e.swim) {
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2.5;
    const rp = (T * 1.4 + e.i * 0.3) % 1;
    ctx.beginPath(); ctx.ellipse(0, 0, 20 + rp * 12, 6 + rp * 4, 0, 0, TAU); ctx.globalAlpha = 1 - rp; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, 19, 6, 0, 0, TAU); ctx.stroke();
  } else {
    const sh = (1 - Math.min(0.6, e.z / 150)) * s;
    ctx.fillStyle = 'rgba(20,8,40,.26)'; ctx.beginPath(); ctx.ellipse(0, 1, 16 * sh * (L.w || 1), 5.5 * sh, 0, 0, TAU); ctx.fill();
  }
  ctx.translate(0, -e.z + (e.swim ? Math.sin(T * 3 + e.i) * 1.5 : 0)); ctx.scale(s, s);
  drawAvatar(ctx, L, {
    t: T, f: e.f, walk: e.walk, phase: e.phase, sit: !!seat, slap: e.slapT, hit: e.hitT / 0.8, z: e.z, swim: e.swim,
    talk: e.sayT > 0, crown: seat && seat.k === 'throne', cheek: e.cheek / 1.5,
  });
  ctx.restore();
}

function headY(e) {
  const seat = e.seat >= 0 ? world.seats[e.seat] : null;
  if (seat && seat.k === 'bed') return e.y - 40;
  return e.y - e.z - e.lift - (e.swim ? 54 : seat ? 76 : 84) * e.L.h * e.scale;
}

function drawHostTag(e, y) {
  ctx.font = `800 13.5px ${BODY}`;
  ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.strokeText(e.L.short, e.x, y);
  ctx.fillStyle = '#ffd24a'; ctx.fillText(e.L.short, e.x, y);
  ctx.font = `800 9.5px ${BODY}`;
  const w = ctx.measureText('HOST').width + 12;
  ctx.beginPath(); ctx.roundRect(e.x - w / 2, y - 28, w, 13, 6.5); ctx.fillStyle = '#ffd24a'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = OUT; ctx.fillText('HOST', e.x, y - 18);
}

function drawLabels() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  for (const e of ents) {
    if (e.koT > 0 || e.x < cam.vx - 60 || e.x > cam.vx + cam.vw + 60 || e.y < cam.vy - 20 || e.y > cam.vy + cam.vh + 120) continue;
    const y = headY(e) - 6, mine = e.i === me;
    if (e.L.host) { drawHostTag(e, y); continue; }
    const label = e.human ? (e.nick || e.L.short) : e.L.short;
    ctx.font = `${e.human ? 800 : 700} ${e.human ? 14 : 12.5}px ${BODY}`;
    ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.strokeText(label, e.x, y);
    ctx.fillStyle = mine ? '#ffe14a' : e.human ? '#7dffb0' : '#fff'; ctx.fillText(label, e.x, y);
    if (e.hp < MAXHP || e.lives < 2) {
      for (let i = 0; i < MAXHP; i++) { ctx.fillStyle = i < e.hp ? (e.lives < 2 ? '#ff3d5a' : '#39e67a') : 'rgba(0,0,0,.45)'; ctx.fillRect(e.x - 16 + i * 6.6, y + 3, 5.4, 4); }
      ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.strokeRect(e.x - 16.5, y + 2.5, 33, 5);
    }
    if (mine && T - my.joinT < 7) { const by = y - 20 - Math.abs(Math.sin(T * 5)) * 7; ctx.fillStyle = '#ffe14a'; ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(e.x - 9, by - 10); ctx.lineTo(e.x + 9, by - 10); ctx.lineTo(e.x, by + 2); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.font = `400 16px ${SIGN}`; ctx.strokeText('YOU', e.x, by - 15); ctx.fillText('YOU', e.x, by - 15); }
  }
  for (const e of ents) {
    if (e.sayT <= 0 || e.koT > 0) continue;
    const a = Math.min(1, e.sayT / 0.25), k = 0.85 + 0.15 * a;
    ctx.font = `700 13.5px ${BODY}`;
    const words = e.say.split(' '), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > 150 && cur) { lines.push(cur); cur = w; } else cur = t; }
    lines.push(cur);
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20, bh = lines.length * 16 + 12;
    const bx = clamp(e.x, cam.vx + bw / 2 + 4, cam.vx + cam.vw - bw / 2 - 4), by = headY(e) - 24 - (e.hp < MAXHP ? 4 : 0) - (e.L.host ? 16 : 0);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(bx, by); ctx.scale(k, k);
    ctx.beginPath(); ctx.roundRect(-bw / 2, -bh, bw, bh, 11); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke();
    const tx = clamp(e.x - bx, -bw / 2 + 14, bw / 2 - 14);
    ctx.beginPath(); ctx.moveTo(tx - 7, -1.5); ctx.lineTo(tx, 9); ctx.lineTo(tx + 7, -1.5); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(tx - 7, -1); ctx.lineTo(tx, 9); ctx.lineTo(tx + 7, -1); ctx.stroke();
    ctx.fillStyle = OUT; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, 0, -bh + 14 + i * 16));
    ctx.restore(); ctx.textBaseline = 'alphabetic';
  }
}

const drawList = [];
function render(dt) {
  const w = innerWidth, h = innerHeight, z = cam.zoom;
  const vw = w / z, vh = h / z;
  if (joined) { const e = ents[me]; const k = Math.min(1, dt * 7); cam.x += (e.x - cam.x) * k; cam.y += (e.y - 44 - cam.y) * k; }
  else { cam.x = 1320 + Math.cos(T * 0.09) * 760; cam.y = 900 + Math.sin(T * 0.13) * 420; }
  let vx = cam.x - vw / 2, vy = cam.y - vh / 2;
  const padR = joined && w > 760 ? 150 / z : 0;   // keep the east rooms clear of the HUD column
  vx = vw >= world.w ? (world.w - vw) / 2 : clamp(vx, 0, world.w - vw + padR);
  vy = vh >= world.h ? (world.h - vh) / 2 : clamp(vy, 0, world.h - vh);
  if (cam.shake > 0.3) { vx += (Math.random() - 0.5) * cam.shake; vy += (Math.random() - 0.5) * cam.shake; cam.shake *= Math.exp(-dt * 11); }
  cam.vx = vx; cam.vy = vy; cam.vw = vw; cam.vh = vh;

  ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
  ctx.fillStyle = '#150c22'; ctx.fillRect(0, 0, w, h);
  ctx.setTransform(cam.dpr * z, 0, 0, cam.dpr * z, -vx * cam.dpr * z, -vy * cam.dpr * z);
  house.drawFloor(ctx, vx, vy, vw, vh);
  const pe = joined ? ents[me] : null;
  house.drawLive(ctx, T, pe ? pe.x : cam.x, pe ? pe.y - 40 : cam.y, boardText);

  drawList.length = 0;
  for (const s of house.sprites) if (s.x < vx + vw && s.x + s.w > vx && s.y < vy + vh && s.y + s.h > vy) drawList.push(s);
  if (house.bag) { house.bag.update(dt); if (house.bag.visible(vx, vy, vw, vh)) drawList.push(house.bag); }
  if (joined) for (const e of ents) if (e.x > vx - 80 && e.x < vx + vw + 80 && e.y > vy - 40 && e.y < vy + vh + 130) drawList.push(e);
  drawList.sort((a, b) => (a.sortY ?? a.y) - (b.sortY ?? b.y));
  for (const d of drawList) {
    if (d.img) {
      let target = 1;
      if (d.fade && pe && pe.y < d.sortY && pe.x > d.x - 14 && pe.x < d.x + d.w + 14 && pe.y > d.y - 6 && pe.y - 84 < d.y + d.h) target = 0.32;
      d.a = (d.a ?? 1) + (target - (d.a ?? 1)) * Math.min(1, dt * 10);
      if (d.a < 0.99) ctx.globalAlpha = d.a;
      ctx.drawImage(d.img, d.x, d.y, d.w, d.h);
      ctx.globalAlpha = 1;
    } else if (d.draw) d.draw(ctx);
    else drawEnt(d);
  }
  drawFx(dt);
  if (joined) drawLabels();
}

function frame(ts) {
  const t = ts / 1000, dt = Math.min(0.05, t - (lastTs || t)); lastTs = t; T = t;
  if (joined) { moveMe(dt); netTick(dt); }
  updateEnts(dt);
  render(dt);
  if ((!joined || switching) && picked >= 0) drawCard(picked, true);
  if (joined && t > mapT) { mapT = t + 0.25; drawMinimap(); }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------- HUD
const tickQ = []; let tickBusy = false;
function ticker(text) { if (tickQ.length < 4) tickQ.push(text); if (!tickBusy) nextTick(); }
function nextTick() {
  const el = $('#ticker');
  if (!tickQ.length) { tickBusy = false; return; }
  tickBusy = true; el.querySelector('span').textContent = tickQ.shift(); el.classList.add('show');
  setTimeout(() => { el.classList.remove('show'); setTimeout(nextTick, 380); }, tickQ.length ? 2400 : 3600);
}
function flash(big, small) {
  const el = $('#flash'); el.textContent = big;
  if (small) { const s = document.createElement('small'); s.textContent = small; el.appendChild(s); }
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
let toastT = 0;
function toast(text, ms = 2600) { const el = $('#toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), ms); }

const HEART = (on) => `<svg viewBox="0 0 16 15"><path d="M8 14 1.6 7.6a3.7 3.7 0 0 1 5.2-5.2L8 3.6l1.2-1.2a3.7 3.7 0 0 1 5.2 5.2Z" fill="${on ? '#ff3d5a' : 'rgba(255,255,255,.15)'}" stroke="#2b1b3d" stroke-width="1.4"/></svg>`;
let hudKey = '';
function updateHud() {
  if (!joined) return;
  const e = ents[me];
  $('#lives').innerHTML = HEART(e.lives >= 1) + HEART(e.lives >= 2);
  $('#hp').innerHTML = Array.from({ length: MAXHP }, (_, i) => `<i class="${i < e.hp ? '' : 'off'}"></i>`).join('');
  $('#trp').textContent = e.trp;
  const sorted = ents.slice(0, cast.length).sort((a, b) => b.trp - a.trp || a.i - b.i);
  boardText = sorted.slice(0, 3).map((o, i) => `${i + 1}. ${o.human && o.nick ? o.nick : o.L.short}  ${o.trp}`);
  const rows = sorted.slice(0, 5); const myRank = sorted.indexOf(e);
  if (myRank >= 5) rows[4] = e;
  const key = rows.map((o) => `${o.i}:${o.trp}:${o.human}:${o.nick}`).join('|') + myRank;
  if (key === hudKey) return; hudKey = key;
  const board = $('#board'); board.textContent = '';
  const h3 = document.createElement('h3'); h3.textContent = 'TRP CHART'; const em = document.createElement('em'); em.textContent = `${ents.filter((o) => o.human).length} live`; h3.appendChild(em); board.appendChild(h3);
  for (const o of rows) {
    const d = document.createElement('div'); if (o === e) d.classList.add('me'); if (o.human) d.classList.add('hu');
    for (const v of [`${sorted.indexOf(o) + 1}.`, o.human && o.nick ? o.nick : o.L.short, o.trp]) { const s = document.createElement('span'); s.textContent = v; d.appendChild(s); }
    board.appendChild(d);
  }
}

function buildHud(swapped) {
  const e = ents[me], L = e.L;
  $('#hud').hidden = false;
  $('#chipName').textContent = e.nick || L.short;
  const c = $('#chipFace').getContext('2d'); c.clearRect(0, 0, 112, 112); drawBust(c, L, 56, 62, 2.05);
  const te = $('#tickEye').getContext('2d'); te.clearRect(0, 0, 88, 56); drawEye(te, 44, 28, 19);
  const q = $('#quips'); q.textContent = '';
  [L.quips[0], L.quips[1], 'Bigg Boss line', 'Bigg Boss line'].slice(0, 3).forEach((text, k) => {
    const b = document.createElement('button'); b.dataset.k = k + 1; b.textContent = k < 2 ? text : 'Random taunt';
    b.addEventListener('click', () => { initAudio(); doSay(k); b.blur(); }); q.appendChild(b);
  });
  updateHud();
  if (swapped) return;
  if (matchMedia('(pointer: coarse)').matches) toast('Left thumb moves. SLAP to slap. JUMP dodges slaps and hops onto furniture!', 4800);
  else toast('WASD to move · F or click to slap · Space jumps (dodge slaps, hop onto beds, sofas and tables) · E to sit', 5600);
}

function drawMinimap() {
  const cv = $('#minimap'); if (!cv.offsetParent) return;
  const c = cv.getContext('2d'), s = cv.width / world.w, oy = (cv.height - world.h * s) / 2;
  c.clearRect(0, 0, cv.width, cv.height); c.save(); c.translate(0, oy); c.scale(s, s);
  const col = { garden: '#5fae40', bath: '#8fded0', bed: '#b79cf5', living: '#ffd595', kitchen: '#ffe07a', conf: '#8a2148', r20: '#4a4458', r2x: '#3f7f8c' };
  for (const r of world.rooms) { c.fillStyle = col[r.id]; c.fillRect(...r.r); }
  for (const d of world.doors) { c.fillStyle = '#c9a26b'; c.fillRect(...d.r); }
  c.fillStyle = '#39c6e8'; c.beginPath(); c.roundRect(...world.water, 60); c.fill();
  for (const e of ents) { if (e.i === me) continue; c.fillStyle = e.L.host ? '#ffd24a' : e.human ? '#39ff9a' : '#fff'; c.strokeStyle = OUT; c.lineWidth = 8; c.beginPath(); c.arc(e.x, e.y, e.human || e.L.host ? 30 : 20, 0, TAU); c.fill(); c.stroke(); }
  const e = ents[me]; c.fillStyle = '#ff3d6e'; c.strokeStyle = '#fff'; c.lineWidth = 10; c.beginPath(); c.arc(e.x, e.y, 34, 0, TAU); c.fill(); c.stroke();
  c.restore();
}

let isMuted = localStorage.getItem('bt-mute') === '1';
function toggleMute() { isMuted = !isMuted; setMuted(isMuted); localStorage.setItem('bt-mute', isMuted ? '1' : '0'); $('#bMute').textContent = isMuted ? 'Sound off' : 'Sound on'; }

async function invite() {
  const url = `${location.origin}${location.pathname}?h=${houseCode}`;
  try { await navigator.clipboard.writeText(url); toast('Invite link copied. Send it to your gharwale!'); }
  catch (e) { prompt('Copy this invite link:', url); }
}

async function shareCard() {
  const e = ents[me], L = e.L, cv = document.createElement('canvas'); cv.width = cv.height = 1080;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 1080, 1080); g.addColorStop(0, '#3a1560'); g.addColorStop(1, '#b3123f'); c.fillStyle = g; c.fillRect(0, 0, 1080, 1080);
  c.fillStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < 16; i++) { c.beginPath(); c.moveTo(540, 640); c.arc(540, 640, 1200, (i * TAU) / 16, (i * TAU) / 16 + TAU / 32); c.fill(); }
  drawEye(c, 150, 120, 52);
  const text = (s, x, y, size, fill, font = SIGN, sw = 14) => { c.font = `${font === SIGN ? 400 : 800} ${size}px ${font}`; c.textAlign = 'center'; c.lineJoin = 'round'; c.lineWidth = sw; c.strokeStyle = OUT; c.strokeText(s, x, y); c.fillStyle = fill; c.fillText(s, x, y); };
  text('BIGG TOSS', 600, 165, 150, '#ffe14a', SIGN, 20);
  c.fillStyle = 'rgba(20,8,40,.3)'; c.beginPath(); c.ellipse(540, 742, 190, 40, 0, 0, TAU); c.fill();
  c.save(); c.translate(540, 740); c.scale(6.2, 6.2); drawAvatar(c, L, { t: 1, f: 1, slap: 0.45 }); c.restore();
  text(`${e.nick ? e.nick + ' as ' : ''}${L.name}`, 540, 850, 62, '#fff', SIGN, 12);
  text(`${e.slaps} THAPPAD · ${e.trp} TRP`, 540, 940, 84, '#ffe14a', SIGN, 16);
  text(`Come get slapped: ${location.host}`, 540, 1020, 38, '#fff', BODY, 8);
  const url = `${location.origin}${location.pathname}?h=${houseCode}`;
  const msg = `I landed ${e.slaps} thappad as ${L.name} in the Bigg Toss house. Come get slapped:`;
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  const file = new File([blob], 'bigg-toss.png', { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: msg, url }); return; }
  } catch (err) { if (err && err.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'bigg-toss.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  try { await navigator.clipboard.writeText(`${msg} ${url}`); toast('Score card downloaded and caption copied!'); } catch (err) { toast('Score card downloaded!'); }
}

// ----------------------------------------------------------- select screen
function drawCard(i, animated) {
  const cv = document.querySelector(`.card[data-i="${i}"] canvas`); if (!cv) return;
  const c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height);
  c.fillStyle = 'rgba(20,8,40,.22)'; c.beginPath(); c.ellipse(130, 240, 50, 8, 0, 0, TAU); c.fill();
  c.save(); c.translate(130, 240); c.scale(2.75, 2.75);
  const cyc = (T % 2.6) / 2.6;
  drawAvatar(c, cast[i], animated ? { t: T, f: 1, walk: cyc < 0.62 ? 1 : 0, phase: T * 9, slap: cyc > 0.7 ? (cyc - 0.7) / 0.3 : 0 } : { t: 1 + i, f: 1 });
  c.restore();
}
function buildCards() {
  const wrap = $('#cards');
  cast.forEach((L, i) => {
    const d = document.createElement('div'); d.className = 'card' + (i >= 16 ? ' wild' : ''); d.dataset.i = i; d.style.setProperty('--c1', CARD_BG[i % CARD_BG.length]);
    d.setAttribute('role', 'option'); d.tabIndex = 0;
    const cv = document.createElement('canvas'); cv.width = 260; cv.height = 248;
    const b = document.createElement('b'); b.textContent = L.name;
    const s = document.createElement('small'); s.textContent = L.tag;
    d.append(cv, b, s);
    const choose = () => {
      if (switching && i === me) { toast(`You are already ${L.short}. Pick someone else, or go back.`); return; }
      if (taken[i] !== undefined) { toast(`${L.short} is being played by ${taken[i] || 'someone'} right now. Pick another!`); return; }
      const old = picked; picked = i;
      document.querySelectorAll('.card.sel').forEach((el) => el.classList.remove('sel')); d.classList.add('sel');
      if (old >= 0) drawCard(old, false);
      $('#picked').innerHTML = ''; const pb = document.createElement('b'); pb.textContent = switching ? `Become ${L.name}` : `You are ${L.name}`; const ps = document.createElement('span'); ps.textContent = L.tag; $('#picked').append(pb, ps);
      $('#enter').disabled = false; initAudio(); sfx.pop();
    };
    d.addEventListener('click', choose);
    d.addEventListener('keydown', (ev) => { if (ev.code === 'Enter' || ev.code === 'Space') { ev.preventDefault(); ev.stopPropagation(); choose(); } });
    wrap.appendChild(d); drawCard(i, false);
  });
}
function refreshCards() {
  document.querySelectorAll('.card').forEach((d) => {
    const i = +d.dataset.i, you = switching && i === me, t = you || taken[i] !== undefined;
    d.classList.toggle('taken', t); d.classList.toggle('you', you);
    let badge = d.querySelector('.badge');
    if (t && !badge) { badge = document.createElement('span'); badge.className = 'badge'; d.appendChild(badge); }
    if (badge) { if (t) badge.textContent = you ? 'YOU' : `LIVE${taken[i] ? ': ' + taken[i] : ''}`; else badge.remove(); }
    if (t && picked === i && (!joined || switching)) { picked = -1; d.classList.remove('sel'); $('#enter').disabled = true; drawCard(i, false); }
  });
}
function showSelect(on) { $('#select').hidden = !on; if (on) $('#hud').hidden = true; }

// Mid-game costume change: reuse the select screen over the running game.
const PICK_HINT = ['Pick your housemate', 'Everyone else is played by the house until a friend joins.'];
function setPickedText(title, sub) { const el = $('#picked'); el.innerHTML = ''; const b = document.createElement('b'); b.textContent = title; const s = document.createElement('span'); s.textContent = sub; el.append(b, s); }
function clearPick() { const old = picked; picked = -1; document.querySelectorAll('.card.sel').forEach((el) => el.classList.remove('sel')); if (old >= 0) drawCard(old, false); $('#enter').disabled = true; }
function syncTaken() { taken = {}; ents.forEach((e, i) => { if (e.human && i !== me) taken[i] = e.nick || ''; }); refreshCards(); }
function openSwitch() {
  if (!joined || switching) return;
  if (ents[me].koT > 0) { toast('Not in the middle of a knockout. Try again in a moment.'); return; }
  switching = true; keys.clear(); stick.x = stick.y = 0; stick.id = null;
  clearPick(); $('#select').classList.add('switching'); $('#enter').textContent = 'SWITCH';
  setPickedText('Switch housemate', 'You keep your spot, lives and TRP. Your old housemate goes back to the house.');
  syncTaken(); showSelect(true); $('#select').scrollTop = 0;
}
function endSwitch() {
  if (!switching && !$('#select').classList.contains('switching')) return;
  switching = false; clearPick(); picked = me;
  $('#select').classList.remove('switching'); $('#enter').textContent = 'ENTER THE HOUSE';
  setPickedText(...PICK_HINT); taken = {}; refreshCards();
}
function closeSwitch() { if (!switching) return; endSwitch(); showSelect(false); $('#hud').hidden = false; }

// --------------------------------------------------------------------- boot
async function boot() {
  const [w, d] = await Promise.all([fetch('data/world.json').then((r) => r.json()), fetch('data/cast.json').then((r) => r.json())]);
  world = w; data = d; cast = d.cast;
  solids = world.props.filter((p) => p.s).map((p) => ({ r: p.r, top: p.top || 0, sy: p.k === 'ctable' ? p.r[1] + p.r[3] : p.r[1] + 1 }));
  cast.forEach((L, i) => { L.seed = i * 1.7; });
  if (data.host) data.host.seed = cast.length * 1.7;
  mini = world.doors.find((x) => x.mini).r;
  try { await Promise.race([Promise.all([document.fonts.load('30px Bangers'), document.fonts.load('700 14px "Baloo 2"')]), new Promise((r) => setTimeout(r, 2000))]); } catch (e) { /* fall back to system fonts */ }
  house = new House(world, cast);
  for (let i = 0; i < cast.length; i++) ents.push(makeEnt(i));
  buildCards();
  drawEye($('#logoEye').getContext('2d'), 110, 60, 42);
  setupTouch();
  setMuted(isMuted); $('#bMute').textContent = isMuted ? 'Sound off' : 'Sound on';
  $('#bMute').addEventListener('click', toggleMute);
  $('#bInvite').addEventListener('click', invite);
  $('#bShare').addEventListener('click', shareCard);
  $('#bSwitch').addEventListener('click', () => { initAudio(); openSwitch(); });
  $('#back').addEventListener('click', closeSwitch);
  $('#enter').addEventListener('click', () => {
    if (picked < 0) return;
    initAudio();
    if (switching) {
      if (!wsOpen) { toast('Reconnecting… try again in a second.'); return; }
      $('#enter').disabled = true; setTimeout(() => { if (switching) $('#enter').disabled = picked < 0; }, 2500);
      send({ t: 'switch', c: cast[picked].id }); return;
    }
    if (!wsOpen) { wantJoin = true; toast('Connecting to the house…'); return; }
    $('#enter').disabled = true; setTimeout(() => { if (!joined) $('#enter').disabled = picked < 0; }, 2500);
    sendJoin();
  });
  $('#private').addEventListener('click', (ev) => {
    ev.preventDefault();
    urlCode = Array.from({ length: 5 }, () => pick('ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.split(''))).join('');
    history.replaceState(null, '', `?h=${urlCode}`); taken = {}; refreshCards();
    toast(`Private house ${urlCode} created. Enter, then tap Invite to bring friends.`, 4200);
  });
  if (urlCode) toast(`You are invited to house ${urlCode}. Pick a housemate!`, 4000);
  resize(); addEventListener('resize', resize);
  connect();
  $('#curtain').classList.add('gone');
  requestAnimationFrame(frame);
}

boot().catch((err) => { console.error(err); $('#curtain p').textContent = 'Could not open the house. Is the server running?'; });

// Handy for debugging from the console.
window.__bt = { ents, cam, my, get me() { return me; }, get joined() { return joined; }, get house() { return house; } };
