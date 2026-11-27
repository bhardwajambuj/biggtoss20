// The house: a pre-rendered floor/wall layer plus y-sorted prop sprites.
// Geometry comes from the server (world.py); this file is only the art.

import { OUT, shade, drawBust } from './avatar.js';

const TAU = Math.PI * 2;
const GOLD = '#f5c542';
const RIM = '#3a2a5c';
const SIGN = 'Bangers, Impact, "Arial Black", sans-serif';
const BODY = '"Baloo 2", system-ui, sans-serif';

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function box(c, x, y, w, h, r, fill, lw = 2.5, stroke = OUT) {
  c.beginPath(); c.roundRect(x, y, w, h, r);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (lw) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
function ell(c, x, y, rx, ry, fill, lw = 2.5, rot = 0, stroke = OUT) {
  c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (lw) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
function poly(c, pts, fill, lw = 2.5, stroke = OUT) {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (lw) { c.strokeStyle = stroke; c.lineWidth = lw; c.lineJoin = 'round'; c.stroke(); }
}
function line(c, pts, col, lw = 2.5) {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
}
function limb(c, x1, y1, x2, y2, w, col) { line(c, [x1, y1, x2, y2], OUT, w + 5); line(c, [x1, y1, x2, y2], col, w); }
function txt(c, s, x, y, size, fill, o = {}) {
  c.font = `${o.weight || 400} ${size}px ${o.font || SIGN}`;
  c.textAlign = o.align || 'center'; c.textBaseline = o.base || 'middle';
  if (o.stroke) { c.lineJoin = 'round'; c.lineWidth = o.sw || 5; c.strokeStyle = o.stroke; c.strokeText(s, x, y); }
  c.fillStyle = fill; c.fillText(s, x, y);
}

// The all-seeing eye. Our own design: a kaleidoscope iris around a gold core.
export function drawEye(c, x, y, r, lx = 0, ly = 0, lid = 1) {
  c.save(); c.translate(x, y);
  const almond = () => {
    c.beginPath(); c.moveTo(-r * 1.75, 0);
    c.quadraticCurveTo(0, -r * 1.35 * lid, r * 1.75, 0);
    c.quadraticCurveTo(0, r * 1.35 * lid, -r * 1.75, 0); c.closePath();
  };
  almond(); c.fillStyle = '#fff8ea'; c.fill();
  c.save(); c.clip();
  const ix = lx * r * 0.5, iy = ly * r * 0.28, ir = r * 0.84;
  const cols = ['#8a4fd0', '#2f7de1', '#e3173e', '#ff8a1f', '#16a6a0', '#b23fd6', '#2fb7e1', '#ff5a3c'];
  for (let i = 0; i < 16; i++) {
    c.beginPath(); c.moveTo(ix, iy); c.arc(ix, iy, ir, (i * TAU) / 16, ((i + 1) * TAU) / 16 + 0.03); c.closePath();
    c.fillStyle = shade(cols[i % 8], i % 2 ? 0.14 : -0.06); c.fill();
  }
  c.beginPath(); c.arc(ix, iy, ir, 0, TAU); c.strokeStyle = OUT; c.lineWidth = Math.max(1.4, r * 0.07); c.stroke();
  c.beginPath(); c.arc(ix, iy, r * 0.36, 0, TAU); c.fillStyle = GOLD; c.fill();
  c.beginPath(); c.arc(ix, iy, r * 0.2, 0, TAU); c.fillStyle = '#150c22'; c.fill();
  c.beginPath(); c.arc(ix - r * 0.24, iy - r * 0.3, r * 0.12, 0, TAU); c.fillStyle = 'rgba(255,255,255,.9)'; c.fill();
  c.restore();
  almond(); c.strokeStyle = GOLD; c.lineWidth = Math.max(2, r * 0.16); c.stroke();
  almond(); c.strokeStyle = OUT; c.lineWidth = Math.max(1, r * 0.04); c.stroke();
  c.restore();
}

function flower(c, x, y, r, col) {
  c.fillStyle = col;
  for (let i = 0; i < 5; i++) { const a = (i * TAU) / 5; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.52, 0, TAU); c.fill(); }
  c.fillStyle = '#ffe14a'; c.beginPath(); c.arc(x, y, r * 0.36, 0, TAU); c.fill();
}

function mushroom(c, x, y, s, col) {
  box(c, x - s * 0.22, y - s * 0.1, s * 0.44, s * 0.95, s * 0.2, '#fff3dc', 2);
  c.beginPath(); c.ellipse(x, y, s, s * 0.7, 0, Math.PI, TAU); c.closePath();
  c.fillStyle = col; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke();
  c.fillStyle = '#fff';
  for (const [dx, dy, r] of [[-0.5, -0.3, 0.16], [0.1, -0.45, 0.2], [0.55, -0.22, 0.13], [-0.15, -0.14, 0.1]]) { c.beginPath(); c.arc(x + dx * s, y + dy * s, r * s, 0, TAU); c.fill(); }
}

function camera(c, x, y, dir) {
  line(c, [x, y - 10, x, y], '#1a1029', 3);
  box(c, x - 10, y - 6, 20, 13, 3, '#2b2140', 2);
  ell(c, x + dir * 8, y + 0.5, 4.2, 4.2, '#39c6e8', 1.6);
}

const STYLE = {
  bath: { wall: '#ff8fc0' }, bed: { wall: '#6a45b8' }, living: { wall: '#17908f' }, kitchen: { wall: '#ef5f3e' },
  conf: { wall: '#3a1560' }, r20: { wall: '#3d2c14' }, r2x: { wall: '#27415f' },
};
const BEDS = ['#ff6fae', '#ffc928', '#39c6e8', '#8a4fd0', '#2fae5f', '#ff7a1a'];

// ------------------------------------------------------------ static layer
function floorPattern(c, id, x, y, w, h) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  const rnd = rng(id.length * 97 + x);
  switch (id) {
    case 'living': {
      c.fillStyle = '#fff1d6'; c.fillRect(x, y, w, h); c.fillStyle = '#ffd595';
      for (let j = 0; j * 20 <= h + 20; j += 2) for (let i = 0; i * 40 <= w + 40; i++) {
        const cx = x + i * 40, cy = y + j * 20;
        c.beginPath(); c.moveTo(cx, cy - 20); c.lineTo(cx + 20, cy); c.lineTo(cx, cy + 20); c.lineTo(cx - 20, cy); c.closePath(); c.fill();
      }
      // rug under the sofa set
      ell(c, 1570, 668, 215, 128, '#8a4fd0', 3); ell(c, 1570, 668, 190, 108, '#a56ee6', 0); ell(c, 1570, 668, 150, 80, '#8a4fd0', 0);
      c.strokeStyle = GOLD; c.lineWidth = 3; c.setLineDash([10, 9]); c.beginPath(); c.ellipse(1570, 668, 202, 118, 0, 0, TAU); c.stroke(); c.setLineDash([]);
      // spilt hot chocolate around the teapot throne
      ell(c, 1320, 772, 86, 22, '#7a4424', 0); ell(c, 1250, 768, 40, 12, '#7a4424', 0);
      break;
    }
    case 'bed': {
      c.fillStyle = '#d9c8f7'; c.fillRect(x, y, w, h); c.strokeStyle = '#c3acec'; c.lineWidth = 2;
      for (let j = 0; j * 26 < h; j++) {
        c.beginPath(); c.moveTo(x, y + j * 26); c.lineTo(x + w, y + j * 26); c.stroke();
        for (let i = (j % 2) * 55; i < w; i += 110) { c.beginPath(); c.moveTo(x + i, y + j * 26); c.lineTo(x + i, y + j * 26 + 26); c.stroke(); }
      }
      ell(c, 810, 730, 150, 70, '#ffe9a8', 3); ell(c, 810, 730, 122, 52, '#ffd76a', 0);
      break;
    }
    case 'kitchen': {
      for (let j = 0; j * 40 < h; j++) for (let i = 0; i * 40 < w; i++) { c.fillStyle = (i + j) % 2 ? '#ffe7a0' : '#fff8e2'; c.fillRect(x + i * 40, y + j * 40, 40, 40); }
      break;
    }
    case 'bath': {
      c.fillStyle = '#cdf4ec'; c.fillRect(x, y, w, h); c.strokeStyle = '#a9e3d7'; c.lineWidth = 2;
      for (let i = 0; i <= w; i += 32) { c.beginPath(); c.moveTo(x + i, y); c.lineTo(x + i, y + h); c.stroke(); }
      for (let j = 0; j <= h; j += 32) { c.beginPath(); c.moveTo(x, y + j); c.lineTo(x + w, y + j); c.stroke(); }
      box(c, 190, 746, 180, 76, 14, '#ff8fc0', 3); box(c, 200, 756, 160, 56, 10, '#ffb3d6', 0);
      break;
    }
    case 'conf': {
      c.fillStyle = '#6b1235'; c.fillRect(x, y, w, h);
      c.strokeStyle = GOLD; c.lineWidth = 3; c.strokeRect(x + 12, y + 12, w - 24, h - 24);
      c.fillStyle = 'rgba(245,197,66,.16)';
      for (let j = 0; j < 5; j++) for (let i = 0; i < 7; i++) { const cx = x + 34 + i * 32 + (j % 2) * 16, cy = y + 34 + j * 34; c.beginPath(); c.moveTo(cx, cy - 8); c.lineTo(cx + 8, cy); c.lineTo(cx, cy + 8); c.lineTo(cx - 8, cy); c.fill(); }
      break;
    }
    case 'r20': {
      c.fillStyle = '#17131f'; c.fillRect(x, y, w, h);
      c.strokeStyle = 'rgba(245,197,66,.3)'; c.lineWidth = 2;
      for (let i = -h; i < w; i += 36) { c.beginPath(); c.moveTo(x + i, y); c.lineTo(x + i + h, y + h); c.stroke(); c.beginPath(); c.moveTo(x + i + h, y); c.lineTo(x + i, y + h); c.stroke(); }
      txt(c, 'TATHAS-TWO', x + w / 2, y + h - 34, 30, 'rgba(245,197,66,.55)');
      break;
    }
    case 'r2x': {
      c.fillStyle = '#2f5a66'; c.fillRect(x, y, w, h); c.strokeStyle = '#25474f'; c.lineWidth = 3;
      for (let i = 0; i <= w; i += 92) { c.beginPath(); c.moveTo(x + i, y); c.lineTo(x + i, y + h); c.stroke(); }
      c.beginPath(); c.moveTo(x, y + h / 2); c.lineTo(x + w, y + h / 2); c.stroke();
      c.fillStyle = '#25474f'; for (let i = 8; i < w; i += 92) for (const yy of [8, h / 2 + 8]) { c.beginPath(); c.arc(x + i, y + yy, 3, 0, TAU); c.fill(); }
      // hazard apron around the pods
      c.save(); c.beginPath(); c.roundRect(2356, 216, 164, 54, 8); c.clip();
      for (let i = -60; i < 240; i += 24) { c.fillStyle = (i / 24) % 2 ? '#1a1029' : '#ffd23f'; c.beginPath(); c.moveTo(2356 + i, 216); c.lineTo(2356 + i + 12, 216); c.lineTo(2356 + i - 42, 270); c.lineTo(2356 + i - 54, 270); c.fill(); }
      c.restore();
      break;
    }
    case 'garden': {
      for (let i = 0; i * 96 < w; i++) { c.fillStyle = i % 2 ? '#74c94f' : '#69bd46'; c.fillRect(x + i * 96, y, 96, h); }
      c.strokeStyle = '#4f9e33'; c.lineWidth = 2; c.lineCap = 'round';
      for (let i = 0; i < 520; i++) { const tx = x + rnd() * w, ty = y + 10 + rnd() * (h - 16); c.beginPath(); c.moveTo(tx - 4, ty - 6); c.lineTo(tx, ty); c.lineTo(tx + 4, ty - 6); c.stroke(); }
      const fc = ['#ff6fae', '#fff', '#ffe14a', '#b78cf5'];
      for (let i = 0; i < 90; i++) flower(c, x + rnd() * w, y + 12 + rnd() * (h - 20), 4 + rnd() * 2.5, fc[i % 4]);
      break;
    }
  }
  c.restore();
}

function roofSign(c) {
  // "roof" of the bathroom/bedroom wing doubles as the title card
  for (let i = 0; i < 9; i++) { c.fillStyle = `rgba(138,79,208,${0.05 + i * 0.012})`; c.beginPath(); c.ellipse(560, 210, 520 - i * 40, 190 - i * 14, 0, 0, TAU); c.fill(); }
  drawEye(c, 250, 215, 70, 0.25, 0.1);
  txt(c, 'BIGG', 400, 118, 132, '#ffe14a', { align: 'left', stroke: OUT, sw: 15 });
  txt(c, 'TOSS', 452, 236, 132, '#ff3d6e', { align: 'left', stroke: OUT, sw: 15 });
  txt(c, 'SEASON', 930, 84, 84, '#fff', { stroke: OUT, sw: 12 });
  txt(c, '20', 930, 214, 190, '#ffe14a', { stroke: OUT, sw: 18 });
  txt(c, 'TATHAS-TWO · UNOFFICIAL PARODY', 290, 404, 21, 'rgba(255,255,255,.6)');
  // studio lighting rig over the rest of the roof
  c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 6;
  for (const y of [40, 250]) { c.beginPath(); c.moveTo(1120, y); c.lineTo(2600, y); c.stroke(); }
}

function drawStatic(c, world, cast) {
  const F = world.face, R = Object.fromEntries(world.rooms.map((r) => [r.id, r.r]));
  const rnd = rng(11);
  c.fillStyle = '#150c22'; c.fillRect(0, 0, world.w, world.h);
  c.fillStyle = 'rgba(255,255,255,.06)';
  for (let i = 0; i < 700; i++) c.fillRect(rnd() * world.w, rnd() * world.h, 2, 2);
  roofSign(c);

  // wall tops (union outline: stroke everything, then refill)
  const inner = world.rooms.filter((r) => r.id !== 'garden');
  for (const pass of [1, 0]) for (const r of inner) { const [x, y, w, h] = r.r; box(c, x - 14, y - F - 14, w + 28, h + F + 28, 6, RIM, pass ? 6 : 0); }
  // garden hedge base
  const [gx, gy, gw, gh] = R.garden;
  box(c, gx - 22, gy - 74, gw + 44, gh + 96, 10, '#256b33', 4);

  // wall faces
  for (const r of inner) {
    const [x, y, w] = r.r, col = STYLE[r.id].wall;
    const g = c.createLinearGradient(0, y - F, 0, y); g.addColorStop(0, shade(col, -0.32)); g.addColorStop(1, col);
    c.fillStyle = g; c.fillRect(x, y - F, w, F);
    c.save(); c.beginPath(); c.rect(x, y - F, w, F); c.clip();
    if (r.id === 'living' || r.id === 'kitchen') { c.fillStyle = 'rgba(255,255,255,.07)'; for (let i = 0; i < w; i += 28) c.fillRect(x + i, y - F, 14, F); }
    if (r.id === 'bath') { c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 1.5; for (let i = 0; i < w; i += 22) { c.beginPath(); c.moveTo(x + i, y - F); c.lineTo(x + i, y); c.stroke(); } for (let j = 0; j < F; j += 22) { c.beginPath(); c.moveTo(x, y - F + j); c.lineTo(x + w, y - F + j); c.stroke(); } }
    if (r.id === 'conf') { c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 2; for (let i = -F; i < w + F; i += 26) { c.beginPath(); c.moveTo(x + i, y - F); c.lineTo(x + i + F, y); c.stroke(); c.beginPath(); c.moveTo(x + i + F, y - F); c.lineTo(x + i, y); c.stroke(); } }
    if (r.id === 'r2x') { c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 2; for (let i = 0; i < w; i += 58) { c.beginPath(); c.moveTo(x + i, y - F); c.lineTo(x + i, y); c.stroke(); } }
    if (r.id === 'bed') { c.fillStyle = 'rgba(255,255,255,.5)'; for (let i = 0; i < 60; i++) c.fillRect(x + rnd() * w, y - F + rnd() * 60, 2, 2); }
    c.restore();
    c.fillStyle = shade(col, 0.3); c.fillRect(x, y - F, w, 6);
    c.fillStyle = shade(col, -0.45); c.fillRect(x, y - 9, w, 9);
    c.strokeStyle = OUT; c.lineWidth = 2.5; c.strokeRect(x, y - F, w, F);
  }

  // floors
  for (const r of world.rooms) {
    const [x, y, w, h] = r.r;
    floorPattern(c, r.id, x, y, w, h);
    if (r.id !== 'garden') { const g = c.createLinearGradient(0, y, 0, y + 22); g.addColorStop(0, 'rgba(20,8,40,.28)'); g.addColorStop(1, 'rgba(20,8,40,0)'); c.fillStyle = g; c.fillRect(x, y, w, 22); }
    c.strokeStyle = OUT; c.lineWidth = 2.5; c.strokeRect(x, y, w, h);
  }

  // glass facade between the house and the garden
  const fy = 1014, fh = 76;
  const gg = c.createLinearGradient(0, fy, 0, fy + fh); gg.addColorStop(0, '#9be3f2'); gg.addColorStop(1, '#3f9fc4');
  c.fillStyle = gg; c.fillRect(gx - 14, fy, gw + 28, fh);
  c.save(); c.beginPath(); c.rect(gx - 14, fy, gw + 28, fh); c.clip();
  c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 9;
  for (let i = 0; i < gw + 80; i += 150) { c.beginPath(); c.moveTo(gx + i, fy + fh); c.lineTo(gx + i + 50, fy); c.stroke(); c.lineWidth = 3; c.beginPath(); c.moveTo(gx + i + 22, fy + fh); c.lineTo(gx + i + 72, fy); c.stroke(); c.lineWidth = 9; }
  c.fillStyle = OUT; for (let i = 0; i <= gw + 28; i += 92) c.fillRect(gx - 14 + i - 2, fy, 4, fh);
  c.restore();
  c.fillStyle = GOLD; c.fillRect(gx - 14, fy, gw + 28, 8); c.fillStyle = '#2b1b3d'; c.fillRect(gx - 14, fy + fh - 6, gw + 28, 6);
  c.strokeStyle = OUT; c.lineWidth = 2.5; c.strokeRect(gx - 14, fy, gw + 28, fh);

  // garden details
  // chequered Wonderland path from the gate to the ringmaster
  for (let j = 0; j < 25; j++) for (let i = 0; i < 4; i++) { c.fillStyle = (i + j) % 2 ? '#2b1b3d' : '#fff7e6'; c.fillRect(1650 + i * 25, 1130 + j * 25 - 15, 25, 25); }
  c.strokeStyle = OUT; c.lineWidth = 2.5; c.strokeRect(1650, 1115, 100, 625);
  // chess lawn
  for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) { c.fillStyle = (i + j) % 2 ? 'rgba(43,27,61,.75)' : 'rgba(255,247,230,.85)'; c.fillRect(980 + i * 42, 1500 + j * 42, 42, 42); }
  c.strokeRect(980, 1500, 252, 168);
  ell(c, 912, 1306, 70, 30, '#e8553a', 3); ell(c, 912, 1306, 52, 20, '#ff8a6a', 0);
  // shark pool
  const [wx, wy, ww, wh] = world.water;
  box(c, wx - 16, wy - 16, ww + 32, wh + 32, 74, '#f6ecd6', 3);
  const wg = c.createLinearGradient(0, wy, 0, wy + wh); wg.addColorStop(0, '#4fd4f0'); wg.addColorStop(1, '#1b9fd6');
  box(c, wx, wy, ww, wh, 60, wg, 3);
  c.save(); c.beginPath(); c.roundRect(wx, wy, ww, wh, 60); c.clip();
  c.strokeStyle = 'rgba(255,255,255,.16)'; c.lineWidth = 2;
  for (let i = 0; i < ww; i += 40) { c.beginPath(); c.moveTo(wx + i, wy); c.lineTo(wx + i, wy + wh); c.stroke(); }
  for (let j = 0; j < wh; j += 40) { c.beginPath(); c.moveTo(wx, wy + j); c.lineTo(wx + ww, wy + j); c.stroke(); }
  c.fillStyle = '#fff'; // shark teeth along the rim
  for (let i = 70; i < ww - 60; i += 26) { c.beginPath(); c.moveTo(wx + i, wy); c.lineTo(wx + i + 13, wy + 16); c.lineTo(wx + i + 26, wy); c.fill(); c.beginPath(); c.moveTo(wx + i, wy + wh); c.lineTo(wx + i + 13, wy + wh - 16); c.lineTo(wx + i + 26, wy + wh); c.fill(); }
  c.restore();
  // fallen flowers under the tap
  const fc = ['#ff6fae', '#fff', '#ffe14a', '#b78cf5', '#ff8a1f'];
  for (let i = 0; i < 26; i++) flower(c, 1905 + rnd() * 70, 1312 + rnd() * 44, 6 + rnd() * 3, fc[i % 5]);
  // hedges + roses
  const bush = (x, y) => { ell(c, x, y, 17, 15, '#2f8f3a', 2.5); };
  for (let x = gx - 8; x <= gx + gw + 8; x += 26) bush(x, gy + gh + 10);
  for (let y = gy + 8; y <= gy + gh; y += 26) { bush(gx - 9, y); bush(gx + gw + 9, y); }
  for (let i = 0; i < 70; i++) { const s = i % 3; const px = s === 0 ? gx + rnd() * gw : s === 1 ? gx - 9 : gx + gw + 9; const py = s === 0 ? gy + gh + 8 : gy + rnd() * gh; ell(c, px + rnd() * 6, py + rnd() * 6 - 3, 4, 4, i % 2 ? '#e3173e' : '#fff', 1.2); }
  // main gate
  box(c, 1630, gy + gh - 8, 140, 34, 8, '#3b2a6b', 3); box(c, 1640, gy + gh - 2, 58, 24, 4, '#6a45b8', 2); box(c, 1702, gy + gh - 2, 58, 24, 4, '#6a45b8', 2);
  txt(c, 'EXIT', 1700, gy + gh + 11, 18, GOLD, { stroke: OUT, sw: 4 });

  // doors
  for (const d of world.doors) {
    const [x, y, w, h] = d.r;
    if (d.d === 'n') {
      const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#6b4a2a'); g.addColorStop(1, '#c9a26b');
      c.fillStyle = g; c.fillRect(x, y, w, h);
      const top = d.mini ? 378 : 336;
      box(c, x - 6, top, 6, y + h - top, 2, GOLD, 2); box(c, x + w, top, 6, y + h - top, 2, GOLD, 2);
      if (d.label) { const lw = d.label.length > 3 ? 104 : 46; box(c, x + w / 2 - lw / 2, y - 16, lw, 28, 7, '#1a1029', 3, GOLD); txt(c, d.label, x + w / 2, y - 1, 19, GOLD); }
    } else if (d.d === 'v') {
      c.fillStyle = '#c9a26b'; c.fillRect(x - 1, y, w + 2, h);
      box(c, x - 3, y - 7, w + 6, 7, 2, GOLD, 2); box(c, x - 3, y + h, w + 6, 7, 2, GOLD, 2);
    } else {
      c.fillStyle = '#c9a26b'; c.fillRect(x, y, w, h);
      c.strokeStyle = '#a9824f'; c.lineWidth = 2; for (let i = 20; i < w; i += 20) { c.beginPath(); c.moveTo(x + i, y); c.lineTo(x + i, y + h); c.stroke(); }
      box(c, x - 8, y + 8, 8, h - 8, 2, GOLD, 2); box(c, x + w, y + 8, 8, h - 8, 2, GOLD, 2);
      box(c, x + 8, y + h + 4, w - 16, 22, 5, '#b3123f', 2.5); txt(c, 'SWAGAT', x + w / 2, y + h + 16, 13, '#ffe9a8');
    }
  }

  // stools
  for (const [i, s] of world.stools.entries()) {
    if (s.v === 'bar') { line(c, [s.x, s.y - 6, s.x, s.y + 5], '#8892a6', 4); ell(c, s.x, s.y + 6, 9, 4, '#8892a6', 2); ell(c, s.x, s.y - 8, 14, 7.5, '#ff3d6e', 2.5); }
    else if (s.v === 'mush') { box(c, s.x - 7, s.y - 8, 14, 16, 5, '#fff3dc', 2); c.beginPath(); c.ellipse(s.x, s.y - 6, 19, 12, 0, Math.PI, TAU); c.closePath(); c.fillStyle = i % 2 ? '#8a4fd0' : '#e3173e'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2.5; c.stroke(); c.fillStyle = '#fff'; for (const dx of [-9, 0, 9]) { c.beginPath(); c.arc(s.x + dx, s.y - 12 + Math.abs(dx) * 0.25, 2.4, 0, TAU); c.fill(); } }
    else { line(c, [s.x - 7, s.y - 2, s.x - 8, s.y + 6], '#5a3a22', 3); line(c, [s.x + 7, s.y - 2, s.x + 8, s.y + 6], '#5a3a22', 3); ell(c, s.x, s.y - 5, 14, 8, BEDS[i % BEDS.length], 2.5); }
  }

  // ---- wall dressing
  // living: TV, hanging messages, eye frames
  box(c, 1446, 344, 248, 80, 8, '#15121c', 3); box(c, 1454, 350, 232, 66, 4, '#241640', 0);
  const notes = ['#ffe14a', '#ff8fc0', '#9be3f2', '#b9f5a0', '#ffc28a'];
  for (const [sx, n] of [[1336, 4], [1704, 4]]) {
    line(c, [sx, 352, sx + 50, 360, sx + 100, 352], '#fff7e6', 1.5);
    for (let i = 0; i < n; i++) { c.save(); c.translate(sx + 12 + i * 25, 356 + (i === 1 || i === 2 ? 4 : 0)); c.rotate((rnd() - 0.5) * 0.3); box(c, -9, 0, 18, 22, 2, notes[(i + (sx > 1500 ? 2 : 0)) % 5], 1.5); c.strokeStyle = 'rgba(43,27,61,.55)'; c.lineWidth = 1.2; for (const yy of [6, 11, 16]) { c.beginPath(); c.moveTo(-5, yy); c.lineTo(5, yy); c.stroke(); } c.restore(); }
  }
  // bedroom: mushrooms growing out of the wall, fairy lights
  for (const [mx, my, s, col] of [[546, 404, 20, '#e3173e'], [590, 412, 12, '#ff8fc0'], [712, 400, 22, '#e3173e'], [770, 412, 12, '#ffc928'], [880, 404, 18, '#ff8fc0'], [930, 414, 10, '#e3173e'], [1062, 400, 22, '#e3173e'], [1098, 414, 11, '#ffc928']]) mushroom(c, mx, my, s, col);
  line(c, [504, 352, 660, 366, 810, 352, 960, 366, 1116, 352], '#fff7e6', 1.5);
  for (let i = 0; i < 20; i++) { const px = 520 + i * 31, k = (px - 504) % 306, py = 352 + (k < 153 ? k : 306 - k) * 0.092 + 4; ell(c, px, py, 4, 5, ['#ffe14a', '#ff6fae', '#39c6e8', '#b9f5a0'][i % 4], 1.2); }
  // kitchen: shelves and the menu board
  for (const [sx, sw] of [[2030, 70], [2182, 96]]) {
    box(c, sx, 392, sw, 7, 2, '#8a5a3c', 2);
    for (let i = 0; i < sw - 14; i += 17) box(c, sx + 5 + i, 372 + (i % 2) * 4, 12, 20 - (i % 2) * 4, 3, ['#ffe14a', '#ff8fc0', '#b9f5a0', '#fff'][(i / 17) % 4 | 0], 1.6);
  }
  box(c, 2350, 350, 140, 68, 5, '#22342c', 3, '#8a5a3c');
  txt(c, "TODAY'S MENU", 2420, 364, 15, '#fff7e6'); txt(c, 'Daal · Chai · Drama', 2420, 384, 13, '#ffe14a', { font: BODY, weight: 700 }); txt(c, 'Aloo in chicken? Fight!', 2420, 402, 11, '#ff8fc0', { font: BODY, weight: 600 });
  // bathroom: mirrors, the upside-down neon bunny, stalls
  for (const mx of [134, 200]) { ell(c, mx, 512, 23, 30, '#d9f4ff', 3, 0, GOLD); line(c, [mx - 9, 500, mx - 2, 492], '#fff', 3); }
  for (const sx of [422]) { box(c, sx, 484, 48, 76, [10, 10, 0, 0], '#fff7fb', 2.5); ell(c, sx + 24, 508, 9, 9, '#9be3f2', 2); ell(c, sx + 40, 528, 2.6, 2.6, GOLD, 1.2); }
  c.save(); c.shadowColor = '#ff3dbb'; c.shadowBlur = 16; c.strokeStyle = '#ff3dbb'; c.lineWidth = 3.4; c.lineCap = 'round';
  c.beginPath(); c.ellipse(322, 488, 11, 9, 0, 0, TAU); c.stroke();
  c.beginPath(); c.arc(322, 506, 11, 0, TAU); c.stroke();
  c.beginPath(); c.ellipse(315, 532, 4.4, 14, 0.14, 0, TAU); c.stroke(); c.beginPath(); c.ellipse(329, 532, 4.4, 14, -0.14, 0, TAU); c.stroke();
  c.fillStyle = '#ff3dbb'; c.beginPath(); c.arc(318, 508, 1.6, 0, TAU); c.arc(326, 508, 1.6, 0, TAU); c.fill();
  c.restore();
  // confession room: velvet drapes + the frame for the big eye
  for (const dx of [1160, 1386]) { box(c, dx, 20, 34, 90, [0, 0, 10, 10], '#b3123f', 2.5); c.strokeStyle = '#7d0c2b'; c.lineWidth = 2; for (const k of [9, 17, 25]) { c.beginPath(); c.moveTo(dx + k, 22); c.lineTo(dx + k, 106); c.stroke(); } }
  ell(c, 1290, 64, 66, 38, '#1a1029', 4, 0, GOLD);
  // room 20: the Wall of Fame, one split-face portrait per housemate
  txt(c, 'WALL OF FAME', 1850, 28, 13, GOLD);
  cast.forEach((L, i) => {
    const px = 1729 + (i % 9) * 27, py = 37 + ((i / 9) | 0) * 36;
    box(c, px, py, 23, 31, 3, '#efe6ff', 2, GOLD);
    c.save(); c.beginPath(); c.rect(px + 1, py + 1, 21, 29); c.clip();
    drawBust(c, L, px + 11.5, py + 17, 0.46);
    c.fillStyle = 'rgba(138,79,208,.42)'; c.fillRect(px + 11.5, py, 12, 31);
    c.restore();
  });
  // room 2X
  c.save(); c.shadowColor = '#39e6ff'; c.shadowBlur = 18; txt(c, '2X', 2290, 62, 60, '#aef6ff', { stroke: '#1583a8', sw: 5 }); c.restore();
  for (const gxp of [2105, 2475]) { ell(c, gxp, 62, 20, 20, '#e9f3f8', 3); line(c, [gxp, 62, gxp + 9, 52], '#e3173e', 2.5); ell(c, gxp, 62, 2.6, 2.6, OUT, 0); }
  txt(c, 'JEEVANDAAN PODS', 2438, 100, 12, '#ffd23f');
  c.save(); c.beginPath(); c.rect(2060, 92, 300, 9); c.clip();
  for (let i = 0; i < 320; i += 18) { c.fillStyle = (i / 18) % 2 ? '#1a1029' : '#ffd23f'; c.beginPath(); c.moveTo(2060 + i, 92); c.lineTo(2069 + i, 92); c.lineTo(2060 + i, 101); c.lineTo(2051 + i, 101); c.fill(); }
  c.restore();
  // eye frames
  for (const e of EYES) if (e.frame) ell(c, e.x, e.y, e.r * 2.3, e.r * 1.75, '#1a1029', 4, 0, GOLD);
  // surveillance
  for (const r of inner) { const [x, y, w] = r.r; camera(c, x + 15, y - F + 20, 1); camera(c, x + w - 15, y - F + 20, -1); }
  for (const [px, py, d] of [[112, 1122, 1], [2528, 1122, -1], [112, 1712, 1], [2528, 1712, -1]]) { line(c, [px, py + 26, px, py], '#1a1029', 4); camera(c, px, py, d); }
}

// Eyes on the walls that follow you around (the season's recurring motif).
const EYES = [
  { x: 1200, y: 384, r: 13, frame: 1 }, { x: 1940, y: 384, r: 13, frame: 1 },
  { x: 646, y: 388, r: 12, frame: 1 }, { x: 992, y: 388, r: 12, frame: 1 },
  { x: 1290, y: 64, r: 23 },
];
const LEDS = [];

// ------------------------------------------------------------ prop sprites
function critters(c, x, y, w) {
  // chameleon on the left, scorpion on the right of the bedroom sofa
  const cx = x + 40, cy = y - 46;
  c.strokeStyle = OUT; c.lineWidth = 9; c.beginPath(); c.arc(cx - 26, cy + 2, 9, 0.2, 5.2); c.stroke();
  c.strokeStyle = '#4ccf5a'; c.lineWidth = 5; c.beginPath(); c.arc(cx - 26, cy + 2, 9, 0.2, 5.2); c.stroke();
  ell(c, cx, cy, 22, 11, '#4ccf5a'); ell(c, cx + 20, cy - 5, 11, 9, '#4ccf5a');
  line(c, [cx - 8, cy - 9, cx - 4, cy - 14, cx + 2, cy - 10, cx + 7, cy - 15], '#ffe14a', 2.5);
  ell(c, cx + 23, cy - 7, 4.6, 4.6, '#fff', 1.6); ell(c, cx + 24, cy - 7, 1.8, 1.8, OUT, 0);
  line(c, [cx - 8, cy + 9, cx - 10, cy + 16], '#3aa648', 4); line(c, [cx + 9, cy + 9, cx + 11, cy + 16], '#3aa648', 4);
  const sx = x + w - 42, sy = y - 44;
  for (const s of [-1, 1]) { limb(c, sx + s * 12, sy, sx + s * 26, sy - 9, 4, '#ff7a1a'); ell(c, sx + s * 30, sy - 12, 7, 5, '#ff7a1a', 2, s * 0.5); }
  ell(c, sx, sy, 15, 10, '#ff7a1a'); ell(c, sx, sy + 1, 9, 5, '#ffa04d', 0);
  let px = sx, py = sy - 8;
  for (let i = 0; i < 5; i++) { const a = -1.9 + i * 0.5; px += Math.cos(a) * 9; py += Math.sin(a) * 9; ell(c, px, py, 5.5 - i * 0.4, 5.5 - i * 0.4, '#ff7a1a', 2); }
  poly(c, [px + 3, py - 1, px + 12, py + 6, px + 2, py + 6], '#2b1b3d', 0);
  ell(c, sx - 5, sy - 3, 1.6, 1.6, OUT, 0); ell(c, sx + 5, sy - 3, 1.6, 1.6, OUT, 0);
}

const KINDS = {
  leg: () => [],
  bed(p) {
    const [x, y, w, h] = p.r, col = BEDS[p.c % BEDS.length];
    return [{ bb: [x - 6, y - 26, w + 12, h + 32], sortY: y + 1, draw(c) {
      box(c, x - 3, y - 22, w + 6, 36, 11, '#4b2f86');
      mushroom(c, x + w - 14, y - 12, 8, '#e3173e');
      box(c, x, y, w, h, 9, '#fff6ea'); box(c, x + 10, y + 6, w - 20, 27, 9, '#fff', 2);
      box(c, x, y + 40, w, h - 40, 9, col); box(c, x, y + 40, w, 13, 6, shade(col, 0.4), 2);
      c.fillStyle = shade(col, 0.3); for (const [dx, dy] of [[16, 70], [40, 62], [56, 84], [26, 90]]) { c.beginPath(); c.arc(x + dx, y + dy, 4, 0, TAU); c.fill(); }
    } }];
  },
  bedside(p) {
    const [x, y, w, h] = p.r, col = BEDS[p.c % BEDS.length], f = p.f;
    return [{ bb: [x - 26, y - 8, w + 52, h + 16], sortY: y + 1, draw(c) {
      box(c, f > 0 ? x - 20 : x + w - 12, y - 4, 32, h + 8, 10, '#4b2f86');
      box(c, x, y, w, h, 9, '#fff6ea'); box(c, f > 0 ? x + 8 : x + w - 34, y + 9, 26, h - 18, 9, '#fff', 2);
      box(c, f > 0 ? x + 40 : x, y, w - 40, h, 9, col); box(c, f > 0 ? x + 40 : x + w - 53, y, 13, h, 6, shade(col, 0.4), 2);
    } }];
  },
  sofafront(p) {
    const [x, y, w, h] = p.r;
    const [c1, c2] = { bed: ['#ff8fc0', '#d94d93'], bath: ['#5fd3ee', '#1e9cc4'], garden: ['#fff0cf', '#b98a55'] }[p.v];
    const out = [{ bb: [x - 12, y - 40, w + 24, h + 50], sortY: y + 1, draw(c) {
      box(c, x - 2, y - 34, w + 4, 52, 14, c2);
      const n = Math.max(2, Math.round(w / 55)), cw = (w - 8) / n;
      for (let i = 0; i < n; i++) box(c, x + 4 + i * cw, y - 28, cw - 3, 36, 9, shade(c1, 0.15), 2);
      box(c, x - 4, y + 2, w + 8, h + 2, 11, c1);
      c.strokeStyle = shade(c1, -0.2); c.lineWidth = 2; for (let i = 1; i < n; i++) { c.beginPath(); c.moveTo(x + 4 + i * cw, y + 6); c.lineTo(x + 4 + i * cw, y + h); c.stroke(); }
      box(c, x - 10, y - 12, 18, h + 16, 8, c2); box(c, x + w - 8, y - 12, 18, h + 16, 8, c2);
    } }];
    if (p.v === 'bed') out.push({ bb: [x - 10, y - 104, w + 20, 76], sortY: y + 0.5, draw(c) { critters(c, x, y, w); } });
    return out;
  },
  sofaside(p) {
    const [x, y, w, h] = p.r, f = p.f;
    const [c1, c2] = p.v === 'bath' ? ['#5fd3ee', '#1e9cc4'] : ['#ff6fae', '#c93a80'];
    return [{ bb: [x - 14, y - 32, w + 28, h + 44], sortY: y + 1, draw(c) {
      box(c, f > 0 ? x - 9 : x + w - 9, y - 24, 18, h + 28, 9, c2);
      box(c, f > 0 ? x + 4 : x - 6, y - 10, w + 2, h + 12, 11, c1);
      c.strokeStyle = shade(c1, -0.2); c.lineWidth = 2; const n = Math.round(h / 44);
      for (let i = 1; i < n; i++) { const yy = y - 6 + (i * (h + 4)) / n; c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy); c.stroke(); }
      box(c, x - 9, y - 28, w + 18, 22, 9, c2); box(c, x - 9, y + h - 10, w + 18, 20, 9, c2);
    } }];
  },
  ottoman(p) {
    const [x, y, w, h] = p.r;
    return [{ bb: [x - 4, y - 14, w + 8, h + 22], sortY: y + 1, draw(c) {
      box(c, x, y - 10, w, h + 14, 14, '#ffc928'); box(c, x, y - 10, w, h - 4, 14, '#ffd95c', 0);
      c.fillStyle = '#d99a00'; for (let i = 30; i < w; i += 40) { c.beginPath(); c.arc(x + i, y + 4, 3, 0, TAU); c.fill(); }
      c.strokeStyle = OUT; c.lineWidth = 2.5; c.beginPath(); c.roundRect(x, y - 10, w, h + 14, 14); c.stroke();
    } }];
  },
  ctable(p) {
    const [x, y, w, h] = p.r;
    return [{ bb: [x - 6, y - 22, w + 12, h + 30], sortY: y + h, draw(c) {
      for (const lx of [x + 8, x + w - 8]) line(c, [lx, y + h - 14, lx, y + h + 2], '#2a1d4e', 6);
      box(c, x - 3, y - 16, w + 6, h + 6, 12, '#3b2a6b'); box(c, x + 4, y - 10, w - 8, h - 8, 8, '#4d3a86', 0);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { c.fillStyle = (i + j) % 2 ? '#2b1b3d' : '#fff7e6'; c.fillRect(x + 12 + i * 9, y - 6 + j * 9, 9, 9); }
      ell(c, x + 74, y + 4, 13, 8, '#fff', 2); ell(c, x + 74, y + 2, 8, 4.5, '#b9763a', 1.5);
      ell(c, x + 92, y + 22, 8, 5, '#ff8fc0', 2);
    } }];
  },
  choc(p) {   // the chocolate throne couch
    const [x, y] = p.r;
    return [{ bb: [x - 12, y - 38, 118, 104], sortY: y - 31, fade: 1, draw(c) {
      box(c, x - 2, y - 34, 98, 44, 20, '#5a2f17'); box(c, x - 8, y - 6, 110, 56, 22, '#7a4424');
      ell(c, x + 47, y + 12, 40, 12, '#93582f', 0);
      for (const [dx, h] of [[4, 21], [30, 16], [70, 21], [90, 16]]) box(c, x + dx, y + 38, 9, h, 5, '#7a4424', 2);
    } }];
  },
  basket(p) {
    const [x, y, w, h] = p.r, cx = x + w / 2;
    const weave = (c, bx, by, bw, bh) => { c.save(); c.beginPath(); c.roundRect(bx, by, bw, bh, 9); c.clip(); c.strokeStyle = 'rgba(90,58,34,.6)'; c.lineWidth = 2; for (let i = -bh; i < bw; i += 11) { c.beginPath(); c.moveTo(bx + i, by); c.lineTo(bx + i + bh, by + bh); c.stroke(); c.beginPath(); c.moveTo(bx + i + bh, by); c.lineTo(bx + i, by + bh); c.stroke(); } c.restore(); };
    return [
      { bb: [x - 6, y - 30, w + 12, h + 34], sortY: y + 1, draw(c) { box(c, x, y - 24, w, h + 22, 10, '#a66f36'); weave(c, x, y - 24, w, h + 22); } },
      { bb: [x - 8, y + 14, w + 16, h - 6], sortY: y + h + 1, draw(c) { box(c, x - 3, y + 20, w + 6, h - 16, 10, '#c98d4b'); weave(c, x - 3, y + 20, w + 6, h - 16); box(c, x - 5, y + 16, w + 10, 10, 5, '#e0a866', 2.5); } },
      { bb: [cx - 72, y - 200, 144, 200], sortY: y + h + 2, fade: 1, draw(c) {
        line(c, [x + 4, y - 20, cx - 34, y - 82], '#5a3a22', 2.5); line(c, [x + w - 4, y - 20, cx + 34, y - 82], '#5a3a22', 2.5);
        line(c, [cx - 14, y - 22, cx - 14, y - 76], '#5a3a22', 2); line(c, [cx + 14, y - 22, cx + 14, y - 76], '#5a3a22', 2);
        const by = y - 132, cols = ['#e3173e', '#ffc928', '#16a6a0', '#8a4fd0', '#ff7a1a'];
        c.save(); c.beginPath(); c.ellipse(cx, by, 64, 62, 0, 0, TAU); c.clip();
        for (let i = 0; i < 5; i++) { c.fillStyle = cols[i]; c.beginPath(); c.ellipse(cx, by, 64 - i * 14, 64, 0, 0, TAU); c.fill(); }
        c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.ellipse(cx - 26, by - 24, 20, 26, -0.4, 0, TAU); c.fill();
        c.restore();
        ell(c, cx, by, 64, 62, null, 3); box(c, cx - 22, by + 55, 44, 11, 5, '#5a3a22', 2.5);
      } },
    ];
  },
  dining(p) {
    const [x, y, w, h] = p.r;
    return [{ bb: [x - 8, y - 24, w + 16, h + 34], sortY: y + 1, draw(c) {
      box(c, x - 4, y + 22, w + 8, h - 14, 9, '#d9c2ff'); box(c, x - 4, y - 18, w + 8, 56, 11, '#fff7e6');
      c.strokeStyle = '#ff8fc0'; c.lineWidth = 3; c.setLineDash([9, 8]); c.beginPath(); c.roundRect(x + 3, y - 12, w - 6, 44, 8); c.stroke(); c.setLineDash([]);
      for (let i = 0; i < 5; i++) { const px = x + 28 + i * 56; ell(c, px, y - 4, 11, 5.5, '#fff', 2); ell(c, px, y + 22, 11, 5.5, '#fff', 2); }
      box(c, x + w / 2 - 22, y - 4, 44, 18, 6, '#ff8fc0', 2.5); ell(c, x + w / 2, y - 4, 22, 7, '#fff', 2.5); ell(c, x + w / 2, y - 10, 4, 4, '#e3173e', 1.5);
      for (const dx of [70, w - 70]) { ell(c, x + dx, y + 8, 10, 8, '#9be3f2', 2.5); line(c, [x + dx + 9, y + 4, x + dx + 16, y + 1], OUT, 2.5); }
    } }];
  },
  plant(p) {
    const [x, y, w, h] = p.r, cx = x + w / 2, by = y + h;
    return [{ bb: [cx - 44, by - 104, 88, 108], sortY: by, draw(c) {
      if (p.v === 0) for (const [a, l] of [[-2.2, 62], [-1.57, 76], [-0.95, 62], [-2.7, 44], [-0.45, 44]]) { const ex = cx + Math.cos(a) * l, ey = by - 22 + Math.sin(a) * l; line(c, [cx, by - 22, ex, ey], '#2f8f3a', 4); ell(c, ex, ey, 17, 10, '#3fb04f', 2.5, a); }
      else if (p.v === 1) { line(c, [cx, by - 20, cx, by - 58], '#8a5a3c', 5); for (const [dy, r] of [[-58, 18], [-80, 13], [-96, 8]]) ell(c, cx, by + dy, r, r, '#3fb04f', 2.5); ell(c, cx, by - 58, 5, 5, '#ff6fae', 1.5); }
      else { box(c, cx - 9, by - 74, 18, 56, 9, '#ff8fc0'); box(c, cx - 22, by - 54, 12, 22, 6, '#ff8fc0'); box(c, cx + 10, by - 64, 12, 26, 6, '#ff8fc0'); ell(c, cx, by - 76, 5, 5, '#ffe14a', 1.5); }
      poly(c, [cx - 16, by - 24, cx + 16, by - 24, cx + 12, by, cx - 12, by], '#ffc928'); box(c, cx - 18, by - 28, 36, 8, 3, '#ffd95c', 2.5);
    } }];
  },
  truck(p) {
    const [x, y, w, h] = p.r;
    return [{ bb: [x - 14, y - 116, w + 28, h + 132], sortY: y + 1, fade: 1, draw(c) {
      for (const px of [x + 14, x + w - 14]) line(c, [px, y - 30, px, y - 96], '#8892a6', 5);
      box(c, x + 4, y - 110, w - 8, 44, 10, '#ff3d6e', 3); txt(c, 'BB FOOD TRUCK', x + w / 2, y - 86, 31, '#fff7e6', { stroke: OUT, sw: 5 });
      for (const wx of [x + 52, x + w - 52]) { ell(c, wx, y + h - 2, 19, 17, '#1a1029', 2.5); ell(c, wx, y + h - 2, 8, 7, '#8892a6', 2); }
      box(c, x, y - 34, w, h + 22, 16, '#19b5a5'); c.save(); c.beginPath(); c.roundRect(x, y - 34, w, h + 22, 16); c.clip(); c.fillStyle = '#ffd23f'; c.fillRect(x, y + 38, w, 40); c.fillStyle = '#ff7a1a'; c.fillRect(x, y + 34, w, 6); c.restore();
      box(c, x + 28, y - 18, 176, 44, 6, '#fff3d6');
      for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#fff' : '#e3173e'; c.beginPath(); c.moveTo(x + 20 + i * 24, y - 40); c.lineTo(x + 44 + i * 24, y - 40); c.lineTo(x + 44 + i * 24, y - 20); c.arc(x + 32 + i * 24, y - 20, 12, 0, Math.PI); c.closePath(); c.fill(); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke(); }
      for (const [dx, col] of [[52, '#ffe14a'], [86, '#ff8a1f'], [120, '#8a5a3c'], [156, '#fff']]) { ell(c, x + dx, y + 16, 13, 6, '#fff', 2); ell(c, x + dx, y + 12, 9, 5, col, 1.5); }
      box(c, x + 222, y - 18, 58, 44, 6, '#0f8478'); txt(c, 'CHAI', x + 251, y - 5, 17, '#ffe14a'); txt(c, '₹ drama', x + 251, y + 13, 12, '#fff', { font: BODY, weight: 700 });
      ell(c, x + w - 4, y + 44, 7, 7, '#ffe14a', 2); ell(c, x + 4, y + 44, 7, 7, '#ffe14a', 2);
    } }];
  },
  counter(p) {
    const [x, y, w, h] = p.r;
    return [{ bb: [x - 6, y - 96, w + 12, h + 104], sortY: y + 1, draw(c) {
      box(c, x - 3, y + 6, w + 3, h - 2, 6, '#f7e7c6'); box(c, x - 3, y + 6, 9, h - 2, 4, '#e0c690', 2);
      box(c, x + 12, y + 120, 40, 62, 6, '#2b2b36', 2.5); for (const [dx, dy] of [[23, 136], [41, 136], [23, 164], [41, 164]]) ell(c, x + dx, y + dy, 7, 7, '#55556a', 1.6);
      box(c, x + 12, y + 220, 40, 56, 8, '#cfe0ea', 2.5); ell(c, x + 32, y + 248, 12, 18, '#9fc3d6', 2);
      box(c, x + 14, y + 320, 36, 50, 5, '#c98d4b', 2.5); ell(c, x + 26, y + 338, 7, 7, '#e3173e', 1.6); ell(c, x + 38, y + 352, 7, 7, '#ffc928', 1.6);
      ell(c, x + 32, y + 420, 16, 16, '#fff', 2.5); ell(c, x + 32, y + 420, 10, 10, '#ffd595', 0);
      box(c, x - 2, y - 92, w + 2, 118, 9, '#dfe9f2', 3); line(c, [x + 6, y - 44, x + 6, y - 8], '#8892a6', 4); line(c, [x - 2, y - 52, x + w, y - 52], OUT, 2.5); line(c, [x + 6, y - 80, x + 6, y - 60], '#8892a6', 4);
    } }];
  },
  pod(p) {
    const [x, y, w] = p.r;
    return [
      { bb: [x - 6, y - 74, w + 12, 128], sortY: y + 1, draw(c) { box(c, x - 3, y + 30, w + 6, 18, 7, '#3d5a73'); box(c, x, y - 68, w, 110, 27, '#0f2030'); const g = c.createRadialGradient(x + w / 2, y - 10, 4, x + w / 2, y - 10, 46); g.addColorStop(0, 'rgba(57,230,255,.5)'); g.addColorStop(1, 'rgba(57,230,255,0)'); c.fillStyle = g; c.fillRect(x, y - 68, w, 110); } },
      { bb: [x - 6, y - 74, w + 12, 128], sortY: y + 46, draw(c) { box(c, x, y - 68, w, 110, 27, 'rgba(140,235,255,.22)', 3, '#9fefff'); line(c, [x + 9, y - 44, x + 9, y + 12], 'rgba(255,255,255,.7)', 3.5); box(c, x - 4, y + 32, w + 8, 16, 7, '#4f7391'); ell(c, x + w / 2, y + 40, 5, 5, '#39ff9a', 1.5); } },
    ];
  },
  buzzer(p) {
    const [x, y, w, h] = p.r, two = p.v === '2';
    return [{ bb: [x - 6, y - 34, w + 12, h + 38], sortY: y + h, draw(c) {
      box(c, x + 3, y - 12, w - 6, h + 12, 5, '#44506a'); ell(c, x + w / 2, y - 12, w / 2 + 2, 9, '#2b3346');
      ell(c, x + w / 2, y - 17, w / 2 - 2, 8, two ? '#1e9e4f' : '#a8112c', 2.5); ell(c, x + w / 2, y - 21, w / 2 - 2, 8, two ? '#39e67a' : '#ff3d5a');
      txt(c, p.v, x + w / 2, y - 20, 15, '#fff', { stroke: OUT, sw: 3 });
    } }];
  },
  p20(p) {
    const [x, y, w, h] = p.r;
    return [{ bb: [x - 14, y - 84, w + 28, h + 90], sortY: y + h, draw(c) {
      box(c, x, y + 6, w, h - 4, 5, '#24202e'); box(c, x - 4, y, w + 8, 12, 4, '#3a3448');
      txt(c, '20', x + w / 2, y - 30, 78, GOLD, { stroke: OUT, sw: 9 }); txt(c, '20', x + w / 2 - 2, y - 32, 78, '#ffe89a');
      txt(c, '20', x + w / 2, y - 30, 78, 'rgba(245,197,66,.55)');
    } }];
  },
  cchair(p) {
    const [x, y, w, h] = p.r, cx = x + w / 2;
    return [{ bb: [x - 16, y - 84, w + 32, h + 92], sortY: y + 1, draw(c) {
      box(c, x + 2, y - 76, w - 4, 100, [30, 30, 8, 8], '#7b1fa2', 3); box(c, x + 9, y - 68, w - 18, 84, [24, 24, 6, 6], '#9c3fc4', 0);
      c.fillStyle = 'rgba(0,0,0,.18)'; for (const [dx, dy] of [[-10, -40], [10, -40], [0, -22], [-10, -4], [10, -4]]) { c.beginPath(); c.arc(cx + dx, y + dy, 2.4, 0, TAU); c.fill(); }
      drawEye(c, cx, y - 60, 7);
      box(c, x - 6, y + 4, w + 12, h, 9, '#9c27b0'); box(c, x - 12, y - 10, 15, h + 14, 7, GOLD); box(c, x + w - 3, y - 10, 15, h + 14, 7, GOLD);
    } }];
  },
  sinks(p) {
    const [x, y, w, h] = p.r;
    return [{ bb: [x - 6, y - 16, w + 12, h + 22], sortY: y + 1, draw(c) {
      box(c, x - 2, y + 10, w + 4, h - 8, 5, '#e3a9c8'); box(c, x - 4, y - 10, w + 8, 26, 7, '#fff');
      for (const dx of [34, 100, 166]) { ell(c, x + dx, y + 3, 22, 8.5, '#d9f4ff', 2); line(c, [x + dx, y - 7, x + dx, y - 14, x + dx + 8, y - 14], GOLD, 3.5); }
    } }];
  },
  chimps(p) {
    const [x, y, w, h] = p.r;
    const chimp = (c, cx, f) => {
      const top = y + 14;
      limb(c, cx - 4 * f, top + 36, cx - 6 * f, top, 6, '#6b4a3a'); limb(c, cx + 9 * f, top + 44, cx + 19 * f, top + 62, 6, '#6b4a3a');
      limb(c, cx - 5, top + 58, cx - 13, top + 70, 6, '#6b4a3a'); limb(c, cx + 5, top + 58, cx + 12, top + 72, 6, '#6b4a3a');
      ell(c, cx, top + 46, 13, 16, '#6b4a3a'); ell(c, cx + 1 * f, top + 50, 7, 9, '#a8795c', 0);
      ell(c, cx - 2 * f, top + 24, 4.5, 5, '#e8c4a0', 2); ell(c, cx + 18 * f, top + 24, 4.5, 5, '#e8c4a0', 2);
      ell(c, cx + 8 * f, top + 24, 11.5, 11, '#6b4a3a'); ell(c, cx + 9 * f, top + 27, 8, 7.5, '#e8c4a0', 0);
      ell(c, cx + 5.5 * f, top + 24, 1.6, 1.9, OUT, 0); ell(c, cx + 12.5 * f, top + 24, 1.6, 1.9, OUT, 0);
      c.strokeStyle = OUT; c.lineWidth = 1.6; c.beginPath(); c.arc(cx + 9 * f, top + 28.5, 4, 0.2, Math.PI - 0.2); c.stroke();
    };
    return [{ bb: [x, y, w, h], sortY: y + h - 29, draw(c) {
      c.strokeStyle = OUT; c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(x + 4, y + 10); c.quadraticCurveTo(x + w / 2, y + 22, x + w - 4, y + 10); c.stroke();
      c.strokeStyle = '#3fb04f'; c.lineWidth = 4; c.stroke();
      chimp(c, x + 152, 1); chimp(c, x + 268, -1);
    } }];
  },
  ringmaster(p) {
    const cx = p.r[0] + p.r[2] / 2, by = p.r[1] + p.r[3] - 4;
    return [{ bb: [cx - 150, by - 312, 300, 320], sortY: by + 1, fade: 1, draw(c) {
      for (const s of [-1, 1]) {
        const fx = cx + s * 55;
        const leg = [fx - 13, by - 12, fx + 13, by - 12, cx + s * 34, by - 104, cx + s * 2, by - 104];
        poly(c, leg, '#fff7e6', 0); c.save(); c.beginPath(); c.moveTo(leg[0], leg[1]); for (let i = 2; i < 8; i += 2) c.lineTo(leg[i], leg[i + 1]); c.closePath(); c.clip();
        c.strokeStyle = '#e3173e'; c.lineWidth = 6; for (let k = -40; k < 80; k += 14) { c.beginPath(); c.moveTo(fx + k - s * 46, by - 110); c.lineTo(fx + k, by - 8); c.stroke(); }
        c.restore(); poly(c, leg, null, 3);
        box(c, fx - 18, by - 18, 36, 20, 8, '#1a1029', 3);
      }
      // coat
      limb(c, cx - 30, by - 176, cx - 104, by - 204, 20, '#d81e3f'); limb(c, cx + 30, by - 176, cx + 104, by - 204, 20, '#d81e3f');
      ell(c, cx - 112, by - 208, 14, 14, '#fff', 3); ell(c, cx + 112, by - 208, 14, 14, '#fff', 3);
      line(c, [cx + 116, by - 214, cx + 134, by - 276], OUT, 7); line(c, [cx + 116, by - 214, cx + 134, by - 276], GOLD, 3.5); ell(c, cx + 135, by - 280, 6, 6, '#e3173e', 2);
      box(c, cx - 40, by - 196, 80, 104, 18, '#d81e3f', 3);
      poly(c, [cx - 13, by - 196, cx + 13, by - 196, cx, by - 150], '#fff7e6', 2.5);
      poly(c, [cx - 12, by - 190, cx, by - 184, cx - 12, by - 177], '#8a4fd0', 2); poly(c, [cx + 12, by - 190, cx, by - 184, cx + 12, by - 177], '#8a4fd0', 2);
      for (const yy of [-150, -132, -114]) { ell(c, cx - 14, by + yy, 4, 4, GOLD, 1.5); ell(c, cx + 14, by + yy, 4, 4, GOLD, 1.5); line(c, [cx - 14, by + yy, cx + 14, by + yy], GOLD, 2); }
      box(c, cx - 42, by - 104, 84, 12, 4, GOLD, 2.5);
      // head
      for (const s of [-1, 1]) { ell(c, cx + s * 27, by - 216, 11, 13, '#ff7a1a', 2.5); ell(c, cx + s * 33, by - 204, 8, 9, '#ff7a1a', 2.5); }
      ell(c, cx, by - 218, 27, 27, '#ffe2c4', 3);
      ell(c, cx - 14, by - 208, 6, 4, 'rgba(255,90,120,.4)', 0); ell(c, cx + 14, by - 208, 6, 4, 'rgba(255,90,120,.4)', 0);
      ell(c, cx - 9, by - 224, 5, 6, '#fff', 2); ell(c, cx + 9, by - 224, 5, 6, '#fff', 2); ell(c, cx - 8, by - 223, 2.2, 2.8, OUT, 0); ell(c, cx + 10, by - 223, 2.2, 2.8, OUT, 0);
      c.strokeStyle = OUT; c.lineWidth = 3.5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(cx, by - 211); c.quadraticCurveTo(cx - 14, by - 204, cx - 24, by - 214); c.moveTo(cx, by - 211); c.quadraticCurveTo(cx + 14, by - 204, cx + 24, by - 214); c.stroke();
      c.beginPath(); c.arc(cx, by - 208, 11, 0.25, Math.PI - 0.25); c.closePath(); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 2; c.stroke();
      // mad hatter top hat
      ell(c, cx, by - 240, 42, 10, '#2a1d4e', 3);
      poly(c, [cx - 25, by - 242, cx + 25, by - 242, cx + 34, by - 298, cx - 34, by - 298], '#3b2a6b', 3);
      poly(c, [cx - 26.5, by - 252, cx + 26.5, by - 252, cx + 28.5, by - 264, cx - 28.5, by - 264], '#ff6fae', 2);
      ell(c, cx, by - 298, 34, 8, '#4d3a86', 3);
      c.save(); c.translate(cx + 20, by - 268); c.rotate(0.3); box(c, -9, -12, 18, 22, 2, '#fff7e6', 2); txt(c, '20', 0, 0, 13, OUT); c.restore();
    } }];
  },
  gorilla(p) {
    const cx = p.r[0] + p.r[2] / 2, wy = 1016;
    return [{ bb: [cx - 80, wy - 126, 160, 196], sortY: wy + 5, fade: 1, draw(c) {
      limb(c, cx - 40, wy - 56, cx - 54, wy + 34, 19, '#4a4458'); limb(c, cx + 40, wy - 56, cx + 54, wy + 34, 19, '#4a4458');
      ell(c, cx - 54, wy + 42, 13, 11, '#35303f'); ell(c, cx + 54, wy + 42, 13, 11, '#35303f');
      ell(c, cx, wy - 38, 48, 42, '#4a4458', 3); ell(c, cx, wy - 28, 28, 26, '#6b6480', 0);
      ell(c, cx - 26, wy + 2, 14, 9, '#35303f'); ell(c, cx + 26, wy + 2, 14, 9, '#35303f');
      ell(c, cx, wy - 88, 28, 26, '#4a4458', 3); ell(c, cx, wy - 82, 19, 17, '#8d86a0', 2);
      line(c, [cx - 18, wy - 94, cx + 18, wy - 94], '#35303f', 6);
      ell(c, cx - 8, wy - 88, 3.4, 3.4, '#ffe14a', 1.5); ell(c, cx + 8, wy - 88, 3.4, 3.4, '#ffe14a', 1.5); ell(c, cx - 8, wy - 88, 1.4, 1.4, OUT, 0); ell(c, cx + 8, wy - 88, 1.4, 1.4, OUT, 0);
      ell(c, cx - 3.5, wy - 79, 1.8, 1.4, OUT, 0); ell(c, cx + 3.5, wy - 79, 1.8, 1.4, OUT, 0);
      line(c, [cx - 9, wy - 71, cx + 9, wy - 71], OUT, 2.2);
      ell(c, cx, wy - 114, 9, 6, '#4a4458', 2.5);
    } }];
  },
  tap(p) {
    const [x, y] = p.r, cx = x + 25, by = y + 22;
    return [{ bb: [x - 12, y - 130, 150, 190], sortY: y + 30, draw(c) {
      box(c, x + 2, by - 6, 46, 16, 6, '#d9a82a'); box(c, cx - 11, by - 102, 22, 100, 7, GOLD);
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(cx, by - 94); c.lineTo(cx + 38, by - 94); c.quadraticCurveTo(cx + 52, by - 94, cx + 52, by - 74);
      c.strokeStyle = OUT; c.lineWidth = 26; c.stroke(); c.strokeStyle = GOLD; c.lineWidth = 20; c.stroke();
      c.strokeStyle = '#ffe89a'; c.lineWidth = 4; c.beginPath(); c.moveTo(cx - 2, by - 100); c.lineTo(cx + 36, by - 100); c.stroke();
      box(c, cx - 4, by - 122, 8, 22, 2, GOLD); box(c, cx - 24, by - 130, 48, 11, 5, '#e3173e'); ell(c, cx, by - 125, 6, 6, '#fff', 2);
      const cols = ['#ff6fae', '#fff', '#ffe14a', '#b78cf5', '#ff8a1f'], rnd = rng(5);
      for (let i = 0; i < 20; i++) { const k = i / 19; flower(c, cx + 52 + (rnd() - 0.5) * (8 + k * 46), by - 62 + k * 88, 6 + rnd() * 3, cols[i % 5]); }
    } }];
  },
  shark(p) {
    const [x, y] = p.r; // facing the shallow end, jaws open
    return [{ bb: [x - 46, y - 98, 176, 200], sortY: y + 82, draw(c) {
      poly(c, [x + 82, y - 38, x + 108, y - 88, x + 116, y - 20], '#5f7d95', 3);
      c.beginPath(); c.moveTo(x + 112, y + 84); c.quadraticCurveTo(x + 120, y - 16, x + 72, y - 44); c.quadraticCurveTo(x + 22, y - 72, x - 24, y - 46);
      c.lineTo(x + 24, y + 8); c.lineTo(x - 18, y + 52); c.quadraticCurveTo(x + 2, y + 84, x + 52, y + 86); c.closePath();
      c.fillStyle = '#7d9cb5'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
      poly(c, [x + 24, y + 8, x - 18, y + 52, x + 6, y + 80, x + 70, y + 86, x + 74, y + 34], '#e9f3f8', 0);
      poly(c, [x - 22, y - 44, x + 26, y + 8, x - 16, y + 50, x + 2, y + 30, x + 4, y - 8], '#b3123f', 2.5);
      c.fillStyle = '#fff'; c.strokeStyle = OUT; c.lineWidth = 1.4;
      for (let i = 0; i < 5; i++) { const k = i / 5, ax = x - 20 + k * 44, ay = y - 42 + k * 48; c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax + 9, ay + 9.6); c.lineTo(ax - 1, ay + 14); c.closePath(); c.fill(); c.stroke(); }
      for (let i = 0; i < 4; i++) { const k = i / 4, ax = x - 15 + k * 38, ay = y + 49 - k * 38; c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax + 9.5, ay - 9.5); c.lineTo(ax + 1, ay - 13); c.closePath(); c.fill(); c.stroke(); }
      ell(c, x + 64, y - 16, 7, 7, '#fff', 2); ell(c, x + 62, y - 15, 3, 3.6, OUT, 0);
      line(c, [x + 56, y - 30, x + 72, y - 30], OUT, 3);
      for (const dx of [86, 94, 102]) line(c, [x + dx, y + 8, x + dx - 3, y + 30], '#5f7d95', 2.5);
      c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 5; c.beginPath(); c.ellipse(x + 50, y + 88, 70, 11, 0, 0, TAU); c.stroke();
    } }];
  },
  tree(p) {
    const [x, y, w, h] = p.r, cx = x + w / 2;
    return [
      { bb: [cx - 80, y - 116, 160, 196], sortY: y + 1, draw(c) {
        ell(c, cx, y + 42, 72, 30, '#d9a25f', 3); ell(c, cx, y + 38, 50, 19, '#b98148', 0);
        poly(c, [cx - 22, y - 110, cx + 22, y - 110, cx + 30, y + 40, cx - 30, y + 40], '#8a5a3c', 3);
        c.strokeStyle = '#6b422a'; c.lineWidth = 2; for (const dx of [-10, 4, 14]) { c.beginPath(); c.moveTo(cx + dx, y - 100); c.lineTo(cx + dx * 1.2, y + 30); c.stroke(); }
        for (let i = 0; i < 4; i++) { const yy = y - 84 + i * 27, wd = 23 + i * 1.6; poly(c, [cx - wd - 3, yy + 15, cx + wd + 3, yy, cx + wd + 3, yy + 12, cx - wd - 3, yy + 27], '#5ec24a', 2.5); c.fillStyle = '#ffe14a'; for (const k of [-0.5, 0, 0.5]) { c.beginPath(); c.arc(cx + k * wd * 1.3, yy + 13.5 - k * 15, 2.6, 0, TAU); c.fill(); } }
        line(c, [cx + 24, y - 82, cx + 40, y - 90], OUT, 15); line(c, [cx + 24, y - 82, cx + 40, y - 90], '#5ec24a', 10);
        ell(c, cx + 46, y - 92, 15, 10.5, '#5ec24a', 2.5, -0.3); ell(c, cx + 49, y - 96, 3.4, 3.4, '#ffe14a', 1.5); ell(c, cx + 50, y - 96, 1.3, 1.6, OUT, 0);
        line(c, [cx + 59, y - 94, cx + 70, y - 97, cx + 76, y - 102], '#e3173e', 2.2); line(c, [cx + 70, y - 97, cx + 77, y - 94], '#e3173e', 2.2);
      } },
      { bb: [cx - 124, y - 262, 248, 190], sortY: y + h + 1, fade: 1, draw(c) {
        const puff = [[0, -150, 64], [-62, -124, 46], [62, -124, 46], [-32, -192, 46], [36, -196, 46]];
        c.fillStyle = OUT; for (const [dx, dy, r] of puff) { c.beginPath(); c.arc(cx + dx, y + dy, r + 3, 0, TAU); c.fill(); }
        c.fillStyle = '#3fa34d'; for (const [dx, dy, r] of puff) { c.beginPath(); c.arc(cx + dx, y + dy, r, 0, TAU); c.fill(); }
        c.fillStyle = '#58bf63'; for (const [dx, dy, r] of puff) { c.beginPath(); c.arc(cx + dx - r * 0.2, y + dy - r * 0.25, r * 0.6, 0, TAU); c.fill(); }
        for (const [dx, dy] of [[-70, -140], [-20, -210], [40, -170], [80, -120], [0, -120], [-44, -108]]) flower(c, cx + dx, y + dy, 7, '#ff8fc0');
      } },
    ];
  },
  bag(p) {
    const [x, y, w, h] = p.r;
    return [{ bb: [x - 14, y - 124, 100, 154], sortY: y + h, draw(c) {
      box(c, x - 8, y + 6, w + 16, 18, 6, '#44506a'); box(c, x + 14, y - 114, 10, 126, 3, '#8892a6'); box(c, x + 14, y - 116, 54, 9, 3, '#8892a6');
      line(c, [x + 56, y - 107, x + 56, y - 92], OUT, 2.5);
      box(c, x + 41, y - 92, 30, 76, 13, '#e3173e', 3); box(c, x + 41, y - 76, 30, 8, 0, '#fff', 0); txt(c, 'MK', x + 56, y - 50, 14, '#fff');
    } }];
  },
  chess(p) {
    const [x, y, w, h] = p.r, cx = x + w / 2, by = y + h, dark = p.v === 'pawn';
    const col = dark ? '#3b2a6b' : '#fff7e6', hi = dark ? '#5a47a0' : '#fff';
    return [{ bb: [x - 12, by - 110, w + 24, 116], sortY: by, draw(c) {
      ell(c, cx, by - 7, w / 2 + 5, 9, col);
      if (p.v === 'pawn') { poly(c, [cx - 11, by - 9, cx + 11, by - 9, cx + 5, by - 38, cx - 5, by - 38], col); ell(c, cx, by - 38, 10, 4.5, col); ell(c, cx, by - 50, 11, 11, col); ell(c, cx - 3, by - 54, 3.5, 3.5, hi, 0); }
      else if (p.v === 'king') { poly(c, [cx - 14, by - 9, cx + 14, by - 9, cx + 7, by - 64, cx - 7, by - 64], col); ell(c, cx, by - 64, 13, 5.5, col); poly(c, [cx - 11, by - 68, cx - 14, by - 86, cx - 5, by - 78, cx, by - 90, cx + 5, by - 78, cx + 14, by - 86, cx + 11, by - 68], GOLD); line(c, [cx, by - 90, cx, by - 104], OUT, 5); line(c, [cx - 6, by - 98, cx + 6, by - 98], OUT, 5); line(c, [cx, by - 90, cx, by - 104], GOLD, 2); line(c, [cx - 6, by - 98, cx + 6, by - 98], GOLD, 2); }
      else { poly(c, [cx - 12, by - 9, cx + 12, by - 9, cx + 8, by - 34, cx - 8, by - 34], col); poly(c, [cx - 10, by - 32, cx - 6, by - 60, cx + 4, by - 72, cx + 18, by - 58, cx + 22, by - 44, cx + 10, by - 42, cx + 10, by - 32], col); poly(c, [cx - 2, by - 70, cx + 2, by - 82, cx + 8, by - 68], col); ell(c, cx + 8, by - 58, 2.2, 2.2, OUT, 0); line(c, [cx - 7, by - 58, cx - 10, by - 44], dark ? hi : '#c9bfa8', 3); }
    } }];
  },
  gmush(p) {
    const [x, y, w, h] = p.r, cx = x + w / 2;
    return [{ bb: [cx - 60, y - 96, 120, h + 100], sortY: y + h, draw(c) {
      box(c, cx - 12, y - 48, 24, h + 46, 10, '#fff3dc');
      c.beginPath(); c.ellipse(cx, y - 44, 54, 44, 0, Math.PI, TAU); c.closePath(); c.fillStyle = x < 1000 ? '#e3173e' : '#8a4fd0'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#fff'; for (const [dx, dy, r] of [[-28, -58, 8], [6, -70, 10], [32, -54, 6.5], [-8, -50, 5]]) { c.beginPath(); c.arc(cx + dx, y + dy, r, 0, TAU); c.fill(); }
      ell(c, cx - 4, y - 22, 2, 2.6, OUT, 0); ell(c, cx + 5, y - 22, 2, 2.6, OUT, 0); c.strokeStyle = OUT; c.lineWidth = 1.8; c.beginPath(); c.arc(cx + 0.5, y - 16, 4, 0.2, Math.PI - 0.2); c.stroke();
    } }];
  },
  tvunit(p) {
    const [x, y, w, h] = p.r;
    return [{ bb: [x - 4, y - 10, w + 8, h + 16], sortY: y + h, draw(c) { box(c, x, y - 6, w, h + 8, 6, '#3b2a6b'); for (let i = 0; i < 4; i++) { box(c, x + 6 + i * 48, y - 1, 44, h - 2, 4, '#4d3a86', 2); ell(c, x + 28 + i * 48, y + h / 2 - 2, 2.6, 2.6, GOLD, 0); } } }];
  },
};

// Wall above the "Drink Me" mini door, drawn over anyone crawling through it.
const MINI = { bb: [2282, 316, 60, 64], sortY: 431, draw(c) {
  c.fillStyle = RIM; c.fillRect(2284, 318, 56, 23);
  const g = c.createLinearGradient(0, 340, 0, 430); g.addColorStop(0, shade(STYLE.kitchen.wall, -0.32)); g.addColorStop(1, STYLE.kitchen.wall);
  c.fillStyle = g; c.fillRect(2284, 340, 56, 36); c.fillStyle = shade(STYLE.kitchen.wall, 0.3); c.fillRect(2284, 340, 56, 6);
  box(c, 2284, 372, 56, 7, 3, GOLD, 2);
  box(c, 2291, 351, 42, 16, 4, '#fff7e6', 1.6); txt(c, 'DRINK ME', 2312, 359.5, 10, OUT);
} };

export class House {
  constructor(world, cast) {
    this.world = world;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // Floor layer: one big canvas, kept under ~11M pixels for phones.
    this.fs = coarse ? 1 : dpr > 1.2 ? 1.5 : 1;
    const fl = document.createElement('canvas');
    fl.width = world.w * this.fs; fl.height = world.h * this.fs;
    const fc = fl.getContext('2d'); fc.scale(this.fs, this.fs);
    drawStatic(fc, world, cast);
    this.floor = fl;

    const ps = coarse ? 1.5 : 2;
    this.sprites = [];
    for (const p of world.props) for (const L of (KINDS[p.k] ? KINDS[p.k](p) : [])) this.sprites.push(this.bake(L, ps));
    this.sprites.push(this.bake(MINI, ps));
    this.sprites.sort((a, b) => a.sortY - b.sortY);
    for (const r of world.rooms) if (r.id !== 'garden') { const [x, y, w] = r.r; LEDS.push([x + 15, y - world.face + 13], [x + w - 15, y - world.face + 13]); }
    for (const [px, py] of [[112, 1122], [2528, 1122], [112, 1712], [2528, 1712]]) LEDS.push([px, py - 7]);
    this.mini = world.doors.find((d) => d.mini).r;
  }

  bake(L, ps) {
    const [x, y, w, h] = L.bb, cv = document.createElement('canvas');
    cv.width = Math.ceil(w * ps); cv.height = Math.ceil(h * ps);
    const c = cv.getContext('2d'); c.scale(ps, ps); c.translate(-x, -y); c.lineJoin = 'round';
    L.draw(c);
    return { x, y, w, h, sortY: L.sortY, fade: !!L.fade, img: cv };
  }

  drawFloor(c, vx, vy, vw, vh) {
    const W = this.world, s = this.fs;
    const x0 = Math.max(0, Math.floor(vx)), y0 = Math.max(0, Math.floor(vy));
    const x1 = Math.min(W.w, Math.ceil(vx + vw)), y1 = Math.min(W.h, Math.ceil(vy + vh));
    if (x1 <= x0 || y1 <= y0) return;
    c.drawImage(this.floor, x0 * s, y0 * s, (x1 - x0) * s, (y1 - y0) * s, x0, y0, x1 - x0, y1 - y0);
  }

  // Cheap per-frame animation on top of the floor layer.
  drawLive(c, t, px, py, board) {
    const [wx, wy, ww, wh] = this.world.water;
    c.save(); c.beginPath(); c.roundRect(wx, wy, ww, wh, 60); c.clip();
    c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 3; c.lineCap = 'round';
    for (let k = 0; k < 6; k++) {
      const y0 = wy + 34 + k * 46, off = ((t * 26 + k * 70) % 140);
      for (let x = wx - 140 + off; x < wx + ww; x += 140) {
        c.beginPath(); c.moveTo(x, y0); c.quadraticCurveTo(x + 16, y0 - 7 + Math.sin(t * 2 + k) * 3, x + 34, y0); c.quadraticCurveTo(x + 50, y0 + 7, x + 66, y0); c.stroke();
      }
    }
    c.restore();
    for (const [i, e] of EYES.entries()) {
      const dx = px - e.x, dy = py - e.y, d = Math.hypot(dx, dy) || 1;
      const lid = ((t * 0.7 + i * 1.3) % 5) < 0.14 ? 0.12 : 1;
      drawEye(c, e.x, e.y, e.r, (dx / d) * Math.min(1, d / 160), (dy / d) * Math.min(1, d / 160), lid);
    }
    // living room TV: live TRP ratings
    c.save(); c.beginPath(); c.rect(1454, 350, 232, 66); c.clip();
    const g = c.createLinearGradient(1454, 0, 1686, 0); g.addColorStop(0, '#3a1560'); g.addColorStop(1, '#b3123f'); c.fillStyle = g; c.fillRect(1454, 350, 232, 66);
    txt(c, 'TRP RATINGS · LIVE', 1570, 360, 13, '#ffe14a');
    board.slice(0, 3).forEach((s, i) => txt(c, s, 1570, 376 + i * 13.5, 12, '#fff', { font: BODY, weight: 700 }));
    c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(1454, 350 + ((t * 30) % 66), 232, 5);
    c.restore();
    for (const [i, [lx, ly]] of LEDS.entries()) if ((t * 1.4 + i * 0.37) % 2 < 1) { c.fillStyle = '#ff2d4a'; c.beginPath(); c.arc(lx, ly, 2.6, 0, TAU); c.fill(); }
  }
}
