// Procedural chibi housemates. Everything is drawn with canvas paths from the
// "look" objects in data/cast.json, so there are no image assets to load.

export const OUT = '#2b1b3d';
const TAU = Math.PI * 2;

export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

const lerp = (a, b, t) => a + (b - a) * t;

function limb(ctx, x1, y1, x2, y2, w, col) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUT; ctx.lineWidth = w + 3.2;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function blob(ctx, fill, lw = 2) {
  ctx.fillStyle = fill; ctx.fill();
  if (lw) { ctx.strokeStyle = OUT; ctx.lineWidth = lw; ctx.stroke(); }
}

function circ(ctx, x, y, r, fill, lw = 2) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); blob(ctx, fill, lw);
}

function ell(ctx, x, y, rx, ry, fill, lw = 2, rot = 0) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); blob(ctx, fill, lw);
}

function poly(ctx, pts, fill, lw = 2) {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath(); blob(ctx, fill, lw);
}

// Draws several circles as one merged shape (outline pass, then fill pass).
function puffs(ctx, list, fill) {
  ctx.fillStyle = OUT;
  for (const [x, y, r] of list) { ctx.beginPath(); ctx.arc(x, y, r + 1.6, 0, TAU); ctx.fill(); }
  ctx.fillStyle = fill;
  for (const [x, y, r] of list) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
}

function torsoPath(ctx, sw, ww, top, bot) {
  ctx.beginPath();
  ctx.moveTo(-sw + 4, top); ctx.lineTo(sw - 4, top);
  ctx.quadraticCurveTo(sw, top, sw, top + 5);
  ctx.lineTo(ww, bot - 2); ctx.quadraticCurveTo(ww, bot, ww - 2, bot);
  ctx.lineTo(-ww + 2, bot); ctx.quadraticCurveTo(-ww, bot, -ww, bot - 2);
  ctx.lineTo(-sw, top + 5); ctx.quadraticCurveTo(-sw, top, -sw + 4, top);
  ctx.closePath();
}

// ------------------------------------------------------------------ hair
function hairBack(ctx, L) {
  const h = L.hair, c = h.c;
  switch (h.back) {
    case 'long':
      ctx.beginPath(); ctx.moveTo(-17, -6); ctx.lineTo(-18.5, 22);
      ctx.quadraticCurveTo(-18.5, 29, -11, 29); ctx.lineTo(11, 29);
      ctx.quadraticCurveTo(18.5, 29, 18.5, 22); ctx.lineTo(17, -6); ctx.closePath();
      blob(ctx, c);
      if (h.hl) {
        ctx.strokeStyle = h.hl; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(-14.5, 6); ctx.lineTo(-14.5, 25); ctx.moveTo(14.5, 4); ctx.lineTo(14.5, 24); ctx.stroke();
      }
      break;
    case 'wavy':
      puffs(ctx, [[-16, 2, 6], [16, 2, 6], [-18.5, 11, 6.2], [18.5, 11, 6.2], [-17.5, 20, 6.4], [17.5, 20, 6.4],
        [-12, 27, 6], [12, 27, 6], [-4, 28, 6], [4, 28, 6], [0, 14, 15]], c);
      if (h.hl) puffs0(ctx, [[-18.5, 12, 3], [18.5, 12, 3], [-14, 25, 3], [14, 25, 3]], h.hl);
      break;
    case 'curly':
      puffs(ctx, [[-16, -2, 6.5], [16, -2, 6.5], [-18.5, 6, 6.5], [18.5, 6, 6.5], [-16.5, 14, 6.2], [16.5, 14, 6.2],
        [-11, 19, 5.6], [11, 19, 5.6], [0, 8, 14]], c);
      break;
    case 'mullet':
      ctx.beginPath(); ctx.moveTo(-17, -6); ctx.quadraticCurveTo(-23, 8, -20, 18);
      ctx.quadraticCurveTo(-14, 23, -9, 17); ctx.lineTo(9, 17);
      ctx.quadraticCurveTo(14, 23, 20, 18); ctx.quadraticCurveTo(23, 8, 17, -6); ctx.closePath();
      blob(ctx, c);
      break;
    case 'pony':
      ell(ctx, -15, 8, 5, 11, c, 2, 0.35);
      break;
  }
}

function puffs0(ctx, list, fill) {
  ctx.fillStyle = fill;
  for (const [x, y, r] of list) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
}

function hairFront(ctx, L) {
  const h = L.hair, c = h.c;
  const cap = (rx, ry, line) => {
    ctx.beginPath(); ctx.ellipse(0, -1, rx, ry, 0, Math.PI, TAU); line(); ctx.closePath(); blob(ctx, c);
  };
  switch (h.front) {
    case 'short':
      cap(17.2, 18, () => { ctx.lineTo(16.6, 2); ctx.bezierCurveTo(15, -8, 8, -11, 0, -10.5); ctx.bezierCurveTo(-8, -11, -15, -8, -16.6, 2); });
      break;
    case 'part':
      cap(17.6, 18.6, () => { ctx.lineTo(16.6, 3); ctx.quadraticCurveTo(15, -6, 9, -10); ctx.quadraticCurveTo(-1, -12.5, -10, -4.5); ctx.quadraticCurveTo(-15, -2, -16.6, 4); });
      break;
    case 'center':
      cap(17.6, 18.6, () => { ctx.lineTo(16.8, 6); ctx.quadraticCurveTo(13.5, -8, 1, -13.5); ctx.quadraticCurveTo(-11.5, -8, -16.8, 6); });
      break;
    case 'bangs':
      cap(17.6, 18.6, () => {
        ctx.lineTo(16.8, 5); ctx.lineTo(15, -4.5);
        for (const [x, y] of [[10, -3.6], [6.5, -6], [3, -3.6], [-0.5, -6], [-4, -3.6], [-7.5, -6], [-11, -3.6], [-15, -4.5]]) ctx.lineTo(x, y);
        ctx.lineTo(-16.8, 5);
      });
      break;
    case 'slick':
      cap(17.2, 20.5, () => { ctx.lineTo(16.6, 0); ctx.bezierCurveTo(14, -10, 7, -13, 0, -12.5); ctx.bezierCurveTo(-7, -13, -14, -10, -16.6, 0); });
      ctx.strokeStyle = shade(c, 0.22); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-6, -13); ctx.quadraticCurveTo(-4, -18, 3, -20); ctx.moveTo(3, -12.5); ctx.quadraticCurveTo(6, -17, 11, -17); ctx.stroke();
      break;
    case 'quiff':   // short sides, volume on top, front swept up and back
      ctx.beginPath(); ctx.moveTo(-17, -0.5);
      ctx.bezierCurveTo(-17.8, -13, -11.5, -21, -3.5, -21.2);
      ctx.bezierCurveTo(0.5, -26, 10.5, -25.4, 13.8, -19);
      ctx.bezierCurveTo(16.8, -15, 17.6, -7.5, 17, -0.5);
      ctx.lineTo(14.9, -0.5); ctx.quadraticCurveTo(14.7, -8, 11, -10);
      ctx.quadraticCurveTo(1, -13.4, -10, -10);
      ctx.quadraticCurveTo(-14.7, -8, -14.9, -0.5); ctx.closePath(); blob(ctx, c);
      ctx.strokeStyle = shade(c, 0.24); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-6.5, -11.4); ctx.quadraticCurveTo(-5, -18, 2.5, -22.6);
      ctx.moveTo(0.5, -12.4); ctx.quadraticCurveTo(2.5, -18.5, 9.5, -22);
      ctx.moveTo(7, -11.4); ctx.quadraticCurveTo(10, -16, 14.2, -17); ctx.stroke();
      break;
    case 'flow':
      cap(19, 21, () => { ctx.lineTo(18, 7); ctx.quadraticCurveTo(15, -7, 3, -13); ctx.quadraticCurveTo(-10, -9, -18, 7); });
      ctx.strokeStyle = shade(c, 0.22); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(3, -13); ctx.quadraticCurveTo(9, -19, 16, -12); ctx.moveTo(3, -13); ctx.quadraticCurveTo(-5, -20, -15, -11); ctx.stroke();
      break;
    case 'buzz':
      ctx.globalAlpha *= 0.78;
      ctx.beginPath(); ctx.ellipse(0, -1, 16.3, 17, 0, Math.PI, TAU);
      ctx.lineTo(16, -2); ctx.bezierCurveTo(13, -10, 6, -12.5, 0, -12); ctx.bezierCurveTo(-6, -12.5, -13, -10, -16, -2); ctx.closePath();
      blob(ctx, c, 0);
      ctx.globalAlpha /= 0.78;
      break;
    case 'fade':
      ctx.globalAlpha *= 0.4;
      ctx.beginPath(); ctx.ellipse(0, -1, 16.3, 17, 0, Math.PI, TAU);
      ctx.lineTo(16, 1); ctx.bezierCurveTo(13, -9, 6, -11, 0, -11); ctx.bezierCurveTo(-6, -11, -13, -9, -16, 1); ctx.closePath();
      blob(ctx, c, 0);
      ctx.globalAlpha /= 0.4;
      ctx.beginPath(); ctx.ellipse(0, -2, 15, 18, 0, Math.PI + 0.42, TAU - 0.42);
      ctx.bezierCurveTo(9, -12, 5, -11.5, 0, -11.5); ctx.bezierCurveTo(-5, -11.5, -9, -12, -13.7, -9.3); ctx.closePath();
      blob(ctx, c);
      break;
    case 'curlytop':
      puffs(ctx, [[-14, -6, 6], [-11, -13, 6.4], [-4, -17, 6.6], [4, -17, 6.6], [11, -13, 6.4], [14, -6, 6], [0, -12, 8]], c);
      break;
  }
  if (h.hl && h.front !== 'curlytop') {
    ctx.strokeStyle = h.hl; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(6, -16.5); ctx.quadraticCurveTo(12, -14, 14.5, -7);
    ctx.moveTo(-3, -17.5); ctx.quadraticCurveTo(-10, -15, -13.5, -8); ctx.stroke();
  }
  // strands that frame the face for long styles
  if (h.back === 'long' || h.back === 'wavy') {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(-17.4, -2); ctx.quadraticCurveTo(-13, 4, -15.5, 15); ctx.lineTo(-18.5, 15); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(17.4, -2); ctx.quadraticCurveTo(14, 4, 16, 15); ctx.lineTo(18.5, 15); ctx.closePath(); ctx.fill();
  }
}

// ------------------------------------------------------------------ head
// Broad face with a square jaw and a strong chin, instead of the round default.
function jawPath(ctx) {
  ctx.beginPath(); ctx.moveTo(-16, -1);
  ctx.bezierCurveTo(-16, -22.5, 16, -22.5, 16, -1);
  ctx.bezierCurveTo(16.7, 9, 15.8, 13.8, 9.6, 16.9);
  ctx.quadraticCurveTo(1.2, 20, -7.4, 16.9);
  ctx.bezierCurveTo(-14.4, 13.8, -16.7, 9, -16, -1);
  ctx.closePath();
}

function drawHead(ctx, L, p) {
  const t = p.t || 0, skin = L.skin, acc = L.acc || [];
  const dark = shade(skin, -0.22);
  const F = L.face || {};   // optional caricature features: jaw, lids, brows, nose, smirk, shadow
  // ears
  circ(ctx, -15.6, 1.5, 3.6, skin); circ(ctx, 15.6, 1.5, 3.6, skin);
  if (F.jaw) { jawPath(ctx); blob(ctx, skin); } else ell(ctx, 0, 0, 16, 16.5, skin);

  // beard layers (clipped to the face)
  const bc = L.beardc || L.hair.c;
  if (L.beard) {
    ctx.save();
    if (F.jaw) jawPath(ctx); else { ctx.beginPath(); ctx.ellipse(0, 0, 15.2, 15.7, 0, 0, TAU); }
    ctx.clip();
    if (L.beard === 'beard') {
      ctx.fillStyle = bc;
      ctx.beginPath(); ctx.moveTo(-17, 0); ctx.quadraticCurveTo(-12, 5, -7, 4.5); ctx.quadraticCurveTo(1.5, 2, 10, 4.5);
      ctx.quadraticCurveTo(14, 5, 17, 0); ctx.lineTo(17, 18); ctx.lineTo(-17, 18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(1.5, 8.6, 4.6, 2.4, 0, 0, TAU); ctx.fill();
    } else if (L.beard.includes('stubble')) {
      const sa = F.shadow || 0.2;
      ctx.globalAlpha *= sa; ctx.fillStyle = bc;
      ctx.beginPath();
      if (F.shadow) {   // five o'clock shadow: along the jaw and around the mouth, cheeks stay clear
        ctx.moveTo(-17, 2.5); ctx.bezierCurveTo(-13, 11, -7.5, 9.5, -5, 7.2); ctx.quadraticCurveTo(1.6, 4.4, 8.2, 7.2);
        ctx.bezierCurveTo(10.5, 9.5, 14, 11, 17, 2.5);
      } else { ctx.moveTo(-17, 2); ctx.quadraticCurveTo(0, 5, 17, 2); }
      ctx.lineTo(17, 22); ctx.lineTo(-17, 22); ctx.closePath(); ctx.fill();
      ctx.globalAlpha /= sa;
    } else if (L.beard === 'goatee') {
      ctx.fillStyle = bc; ctx.beginPath(); ctx.ellipse(1.5, 14, 5, 4.2, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
    if (F.jaw) { jawPath(ctx); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke(); }
  }

  // eyes
  const hit = p.hit > 0, sleep = p.sleep;
  const blink = !hit && !sleep && ((t * 0.9 + (L.seed || 0)) % 3.4) < 0.12;
  const angry = p.slap > 0 && p.slap < 0.75;
  ctx.lineCap = 'round';
  for (const ex of [-5, 7]) {
    if (hit) {
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; const s = ex < 0 ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(ex - 2.6 * s, -2); ctx.lineTo(ex + 2 * s, 0.6); ctx.lineTo(ex - 2.6 * s, 3.2); ctx.stroke();
    } else if (sleep || blink) {
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.arc(ex, 0, 2.6, 0.15, Math.PI - 0.15); ctx.stroke();
    } else if (F.lids) {   // heavy, hooded lids that droop a little at the outer corners
      const yl = ex < 0 ? -0.8 : -1.5, yr = ex < 0 ? -1.5 : -0.8;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, 0.7, 3.4, 3.1, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = F.eye || '#3a2416'; ctx.beginPath(); ctx.ellipse(ex + 0.6, 1, 2.1, 2.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + 1.3, 0.9, 0.75, 0, TAU); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.moveTo(ex - 4.6, -5); ctx.lineTo(ex + 4.6, -5); ctx.lineTo(ex + 4.6, yr + (yr - yl) * 0.12); ctx.lineTo(ex - 4.6, yl - (yr - yl) * 0.12); ctx.closePath(); ctx.clip();
      ctx.fillStyle = shade(skin, -0.06); ctx.beginPath(); ctx.ellipse(ex, 0.7, 3.8, 3.5, 0, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ex - 3.8, yl); ctx.lineTo(ex + 3.8, yr); ctx.stroke();
      ctx.strokeStyle = dark; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(ex, 1, 3.9, 0.5, Math.PI - 0.5); ctx.stroke();
    } else {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, 0.4, 3.3, 3.9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#20141f'; ctx.beginPath(); ctx.ellipse(ex + 0.7, 0.9, 2.2, 2.9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + 1.4, -0.3, 0.9, 0, TAU); ctx.fill();
      if (L.fem) {
        ctx.strokeStyle = OUT; ctx.lineWidth = 1.3; const s = ex < 0 ? -1 : 1;
        ctx.beginPath(); ctx.moveTo(ex + 2.6 * s, -2.2); ctx.lineTo(ex + 4.8 * s, -4.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(ex, 0.4, 3.6, Math.PI + 0.35, TAU - 0.35); ctx.stroke();
      }
    }
  }
  // brows
  ctx.strokeStyle = shade(L.hair.c, -0.1); ctx.lineWidth = L.fem ? 1.4 : 2;
  const tilt = angry ? 2.2 : 0;
  if (F.brows === 'heavy') {   // thick, straight and low over the eyes
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-9.6, -3.9 - tilt); ctx.lineTo(-1.6, -4.5 + tilt);
    ctx.moveTo(3.6, -4.5 + tilt); ctx.lineTo(11.6, -3.9 - tilt); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(-8, -5.6 - tilt); ctx.lineTo(-2.4, -5.8 + tilt);
    ctx.moveTo(4.4, -5.8 + tilt); ctx.lineTo(10, -5.6 - tilt); ctx.stroke();
  }
  // nose
  ctx.strokeStyle = dark; ctx.lineWidth = 1.3;
  if (F.nose) {   // long bridge, broad tip
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(1.3, -0.6); ctx.quadraticCurveTo(5.2, 4, 4, 5.7); ctx.quadraticCurveTo(1.9, 7, -0.5, 5.6); ctx.stroke();
  } else { ctx.beginPath(); ctx.moveTo(2, 2.8); ctx.quadraticCurveTo(3.8, 4.6, 1.6, 5.2); ctx.stroke(); }
  // blush
  if (L.fem) {
    ctx.fillStyle = 'rgba(255,110,140,0.3)';
    ctx.beginPath(); ctx.ellipse(-8.5, 5, 3, 1.8, 0, 0, TAU); ctx.ellipse(11, 5, 3, 1.8, 0, 0, TAU); ctx.fill();
  }
  // moustache
  if (L.beard && (L.beard.startsWith('moustache') || L.beard === 'beard' || L.beard === 'goatee')) {
    ctx.strokeStyle = bc; ctx.lineWidth = L.beard.startsWith('moustache') ? 2.8 : 2.2;
    ctx.beginPath(); ctx.moveTo(-3.6, 7.2); ctx.quadraticCurveTo(-1, 5.2, 1.5, 6.4); ctx.quadraticCurveTo(4, 5.2, 6.6, 7.2); ctx.stroke();
  }
  // mouth
  const lip = L.fem ? '#c7385f' : '#7a2c2c';
  if (hit) {
    ell(ctx, 1.5, 9.6, 2.3, 2.9, '#5a1a2a', 1.4);
  } else if (angry) {
    ctx.beginPath(); ctx.ellipse(1.5, 9.4, 4.6, 3.4, 0, 0, TAU); blob(ctx, '#5a1a2a', 1.4);
    ctx.fillStyle = '#fff'; ctx.fillRect(-1.8, 6.6, 6.6, 1.7);
  } else if (p.talk) {
    const o = 1.2 + Math.abs(Math.sin(t * 13)) * 2.6;
    ell(ctx, 1.5, 9.4, 3.2, o, '#5a1a2a', 1.4);
  } else if (sleep) {
    ell(ctx, 1.5, 9.6, 1.6, 1.3, '#5a1a2a', 1.2);
  } else if (F.smirk) {   // closed, lopsided half-smile
    ctx.strokeStyle = '#6a2a24'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-3, 10.2); ctx.quadraticCurveTo(1.8, 12, 6.2, 9); ctx.stroke();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(6.9, 7.9); ctx.quadraticCurveTo(8, 9.1, 7.1, 10.4); ctx.stroke();
  } else {
    ctx.strokeStyle = lip; ctx.lineWidth = L.fem ? 2 : 1.7;
    ctx.beginPath(); ctx.moveTo(-2.4, 8.4); ctx.quadraticCurveTo(1.5, 12.4, 5.4, 8.4); ctx.stroke();
  }
  if (F.jaw && !hit) {   // lower lip shadow and chin
    ctx.strokeStyle = dark; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(-0.4, 14.3); ctx.quadraticCurveTo(1.6, 15.2, 3.6, 14.3); ctx.stroke();
  }
  // the famous red hand print
  if (p.cheek > 0) {
    ctx.save(); ctx.globalAlpha *= Math.min(1, p.cheek) * 0.75; ctx.translate(-8.5, 5); ctx.rotate(-0.35);
    ctx.fillStyle = '#ff2d4a'; ctx.beginPath(); ctx.ellipse(0, 1.5, 3.2, 3, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ff2d4a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); for (const a of [-0.75, -0.25, 0.25, 0.75]) { ctx.moveTo(Math.sin(a) * 2, -1); ctx.lineTo(Math.sin(a) * 5.2, -5.6); } ctx.stroke();
    ctx.restore();
  }

  hairFront(ctx, L);

  // accessories on the head
  const gold = '#f5c542';
  if (acc.includes('bindi')) circ(ctx, 1, -7.8, 1.5, '#e3173e', 0);
  if (acc.includes('jhumka')) for (const x of [-16, 16]) { circ(ctx, x, 6.4, 1.3, gold, 0); ctx.beginPath(); ctx.arc(x, 10.4, 2.9, Math.PI, TAU); ctx.closePath(); blob(ctx, gold, 1); }
  if (acc.includes('hoops')) { ctx.strokeStyle = gold; ctx.lineWidth = 1.7; for (const x of [-16.4, 16.4]) { ctx.beginPath(); ctx.arc(x, 8.4, 3.2, 0, TAU); ctx.stroke(); } }
  if (acc.includes('glasses') || acc.includes('shades')) {
    const sh = acc.includes('shades');
    for (const ex of [-5, 7]) {
      ctx.beginPath(); ctx.roundRect(ex - 5, -3.4, 10, 7.8, 2.6);
      if (sh) { ctx.fillStyle = '#15121c'; ctx.fill(); }
      ctx.strokeStyle = sh ? '#000' : '#2a2230'; ctx.lineWidth = 1.5; ctx.stroke();
      if (sh) { ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(ex - 3, -1.6); ctx.lineTo(ex - 0.6, -1.6); ctx.stroke(); }
    }
    ctx.strokeStyle = sh ? '#000' : '#2a2230'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(2, 0); ctx.moveTo(-10, -0.5); ctx.lineTo(-15, -1.5); ctx.moveTo(12, -0.5); ctx.lineTo(15.5, -1.5); ctx.stroke();
  }
  if (acc.includes('shadestop')) {
    for (const ex of [-5.5, 6.5]) { ctx.beginPath(); ctx.roundRect(ex - 5, -16, 10, 6.4, 2.4); blob(ctx, '#2a1d2e', 1.3); }
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-0.5, -13); ctx.lineTo(1.5, -13); ctx.stroke();
  }
  if (acc.includes('capback')) {
    const cc = L.outfit.c3;
    ctx.beginPath(); ctx.ellipse(0, -1, 17.8, 19, 0, Math.PI, TAU); ctx.lineTo(17.4, -5); ctx.quadraticCurveTo(0, -11, -17.4, -5); ctx.closePath(); blob(ctx, cc);
    ctx.beginPath(); ctx.arc(1, -8.6, 4.2, Math.PI, TAU); blob(ctx, L.skin, 1.5);
    circ(ctx, 0, -20, 1.6, shade(cc, -0.25), 0);
  }
  if (acc.includes('headset')) {
    ctx.strokeStyle = OUT; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, -1, 18.6, Math.PI + 0.12, TAU - 0.12); ctx.stroke();
    ctx.strokeStyle = '#2b2b36'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.arc(0, -1, 18.6, Math.PI + 0.12, TAU - 0.12); ctx.stroke();
    for (const x of [-21, 15]) { ctx.beginPath(); ctx.roundRect(x, -5, 6.4, 13, 3); blob(ctx, '#2b2b36'); ctx.fillStyle = '#39ff9a'; ctx.fillRect(x + 2.2, -1, 2, 5); }
    ctx.strokeStyle = '#2b2b36'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-18, 7); ctx.quadraticCurveTo(-15, 14, -6.5, 12.4); ctx.stroke();
    circ(ctx, -6, 12.2, 1.9, '#2b2b36', 0);
  }
  if (acc.includes('bow')) {
    const bcol = '#b3123f';
    poly(ctx, [-10, -17, -18, -22, -17, -11], bcol, 1.6); poly(ctx, [-10, -17, -2, -22, -3, -11], bcol, 1.6); circ(ctx, -10, -17, 2.4, shade(bcol, 0.2), 1.4);
  }
  if (p.crown) {
    poly(ctx, [-11, -17, -13, -29, -6.5, -23, 0, -32, 6.5, -23, 13, -29, 11, -17], gold, 1.8);
    circ(ctx, 0, -20.5, 1.7, '#e3173e', 0);
  }
}

// ------------------------------------------------------------------ body
export function drawAvatar(ctx, L, p = {}) {
  const t = p.t || 0, f = p.f === -1 ? -1 : 1;
  const hs = L.h || 1, bw = L.w || 1, o = L.outfit, kind = o.k, acc = L.acc || [];
  const skin = L.skin;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  if (p.sleep) { // only the head pokes out of the blanket
    ctx.translate(0, -12); ctx.rotate(((p.rot || 0) * Math.PI) / 180); ctx.scale(hs, hs);
    hairBack(ctx, L); drawHead(ctx, L, p); ctx.restore(); return;
  }
  if (p.swim) { ctx.beginPath(); ctx.rect(-60, -140, 120, 140); ctx.clip(); ctx.translate(0, 25 * hs); }

  ctx.scale(f * hs, hs);
  const walk = p.walk || 0, ph = p.phase || 0, sit = !!p.sit, air = (p.z || 0) > 3;
  const slap = p.slap || 0, hit = p.hit || 0;
  if (hit) ctx.rotate(Math.sin(t * 24) * 0.14 * hit);
  if (slap > 0.2 && slap < 0.7) ctx.rotate(0.1);

  const longSkirt = kind === 'saree' || kind === 'suit';
  const legLen = sit ? 7 : 16;
  const hipY = -legLen;
  const bob = sit ? 0 : walk ? Math.abs(Math.sin(ph)) * 1.7 * walk : Math.sin(t * 2.3 + (L.seed || 0)) * 0.6;
  const sw = 14 * bw, ww = 11.5 * bw;
  const sleeve = { tee: 'short', saree: 'short', dress: 'none', tank: 'none' }[kind] || 'long';
  const armCol = sleeve === 'none' ? skin : (kind === 'saree' ? o.c3 : o.c1);
  const aw = (kind === 'tank' ? 7.4 : 6) * Math.min(1.12, bw);

  // --- back layer
  ctx.save(); ctx.translate(0, hipY - bob);
  if (acc.includes('guitar')) {
    limb(ctx, 4, -16, 21, -47, 3, '#7a4a22');
    ctx.beginPath(); ctx.roundRect(17, -55, 8, 9, 2); blob(ctx, '#3a2412', 1.6);
    ell(ctx, -11, -5, 9.5, 11.5, '#d98a2b', 2, -0.4);
  }
  if (kind === 'hoodie') ell(ctx, 0, -26, 14 * bw, 8, shade(o.c1, -0.18));
  if (kind === 'saree') { ctx.beginPath(); ctx.roundRect(-sw - 3, -25, 7, 22, 3); blob(ctx, o.c1); }
  ctx.translate(0, -42); hairBack(ctx, L);
  ctx.restore();

  // --- legs / skirt
  const shoe = kind === 'dress' ? o.c3 : (longSkirt ? '#f5d9a8' : o.c3 || '#222');
  if (longSkirt) {
    const sway = Math.sin(ph) * 2 * walk, bot = kind === 'suit' ? 15.5 * bw : 13 * bw;
    ell(ctx, -5 + sway, -1, 4.2, 2.4, shoe, 1.6); ell(ctx, 5 - sway, -1, 4.2, 2.4, shoe, 1.6);
    ctx.beginPath(); ctx.moveTo(-ww, hipY - 2); ctx.lineTo(ww, hipY - 2);
    ctx.quadraticCurveTo(bot + 1 + sway, -8, bot + sway, -2.5); ctx.lineTo(-bot + sway, -2.5);
    ctx.quadraticCurveTo(-bot - 1 + sway, -8, -ww, hipY - 2); ctx.closePath();
    blob(ctx, kind === 'saree' ? o.c1 : o.c2);
    ctx.save(); ctx.clip();
    if (kind === 'saree') {
      ctx.fillStyle = o.c2; ctx.fillRect(-30, -6, 60, 5);
      ctx.strokeStyle = shade(o.c1, -0.2); ctx.lineWidth = 1.1;
      ctx.beginPath(); for (const x of [-3, 1, 5]) { ctx.moveTo(x, hipY); ctx.lineTo(x + sway * 0.6, -6); } ctx.stroke();
    } else if (o.dots) {
      ctx.fillStyle = o.dots;
      for (let j = 0; j < 4; j++) for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.arc(i * 6 + (j % 2) * 3, hipY + 2 + j * 4.2, 1.1, 0, TAU); ctx.fill(); }
    } else {
      ctx.strokeStyle = shade(o.c2, -0.16); ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(sway * 0.5, -3); ctx.stroke();
    }
    ctx.restore();
  } else {
    const lw = (o.baggy ? 9.4 : 7.6) * Math.min(1.15, bw), bare = kind === 'dress';
    for (const s of [-1, 1]) {
      const sn = Math.sin(ph + (s > 0 ? Math.PI : 0));
      let fx = s * 5 * bw + sn * 3.6 * walk, fy = -Math.max(0, sn) * 4.2 * walk - 2;
      if (air) { fx = s * 6 * bw; fy = -6; }
      if (sit) { fx = s * 5.5 * bw + 1.5; fy = -1.5; }
      limb(ctx, s * 4.6 * bw, hipY, fx, fy, lw, bare ? skin : o.c2);
      ell(ctx, fx + 1.4, fy + 1.2, 5, 3, shoe, 1.8);
    }
  }

  // --- torso
  ctx.translate(0, hipY - bob);
  const top = -25;
  let bot = 1;
  if (kind === 'kurta') bot = 9; else if (kind === 'suit') bot = sit ? 5 : 10; else if (o.baggy) bot = 4;
  const neck = (r) => { ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, top, r, 0, Math.PI); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(0, top, r, 0, Math.PI); ctx.stroke(); };
  const lineD = (pts, col, w = 1.3) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke(); };
  if (kind === 'dress') {
    torsoPath(ctx, sw - 1, 9, top, -6); blob(ctx, o.c1);
    ctx.save(); ctx.clip(); neck(6.2); ctx.restore();
    ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(9, -8); ctx.quadraticCurveTo(15, 0, 15.5, 6); ctx.lineTo(-15.5, 6); ctx.quadraticCurveTo(-15, 0, -9, -8); ctx.closePath(); blob(ctx, o.c1);
    ctx.save(); ctx.clip(); ctx.fillStyle = o.c2; ctx.fillRect(-20, 2.6, 40, 5); ctx.restore();
    ctx.strokeStyle = o.c2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8.6, -8); ctx.lineTo(8.6, -8); ctx.stroke();
  } else {
    torsoPath(ctx, o.baggy ? sw + 1.5 : sw, kind === 'suit' ? ww + 2.5 : ww + (o.baggy ? 1.5 : 0), top, bot); blob(ctx, kind === 'saree' ? o.c3 : o.c1);
  }
  ctx.save(); ctx.clip();
  switch (kind) {
    case 'tee': neck(4.6); break;
    case 'tank': neck(6.4); ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(-sw, top + 3, 5.2, 0, TAU); ctx.arc(sw, top + 3, 5.2, 0, TAU); ctx.fill(); break;
    case 'hoodie':
      neck(4.2);
      ctx.strokeStyle = shade(o.c1, -0.25); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.roundRect(-7.5 * bw, -10, 15 * bw, 8, 3); ctx.stroke();
      lineD([-3, top + 4, -3, top + 11], o.c3, 1.5); lineD([3, top + 4, 3, top + 11], o.c3, 1.5);
      break;
    case 'jacket':
      ctx.fillStyle = o.c4; ctx.beginPath(); ctx.moveTo(-5, top); ctx.lineTo(5, top); ctx.lineTo(3.4, bot); ctx.lineTo(-3.4, bot); ctx.closePath(); ctx.fill();
      neck(4.2); lineD([-5, top, -3.4, bot], OUT, 1.4); lineD([5, top, 3.4, bot], OUT, 1.4);
      break;
    case 'blazer':
      ctx.fillStyle = o.c4; ctx.beginPath(); ctx.moveTo(-6, top); ctx.lineTo(6, top); ctx.lineTo(0, -11); ctx.closePath(); ctx.fill();
      neck(4); lineD([-6, top, 0, -11, 6, top], OUT, 1.4); lineD([0, -11, 0, bot], OUT, 1.2);
      ctx.fillStyle = '#f5c542'; ctx.beginPath(); ctx.arc(0, -6.5, 1.4, 0, TAU); ctx.fill();
      break;
    case 'kurta':
      if (o.vest) {
        ctx.fillStyle = o.vest; ctx.fillRect(-20, top, 17, 25); ctx.fillRect(3, top, 17, 25);
        lineD([-3, top, -3, 0], OUT, 1.2); lineD([3, top, 3, 0], OUT, 1.2);
        ctx.fillStyle = '#f5c542'; for (const y of [-19, -13, -7]) { ctx.beginPath(); ctx.arc(5.4, y, 1, 0, TAU); ctx.fill(); }
      } else lineD([0, top, 0, -8], shade(o.c1, -0.25), 1.3);
      neck(4);
      break;
    case 'shirt':
      neck(4); lineD([0, top + 4, 0, bot], shade(o.c1, -0.3), 1.2);
      ctx.fillStyle = shade(o.c1, 0.35); ctx.beginPath(); ctx.moveTo(-6.5, top); ctx.lineTo(-1, top + 6); ctx.lineTo(0, top + 3.5); ctx.lineTo(1, top + 6); ctx.lineTo(6.5, top); ctx.lineTo(4, top); ctx.arc(0, top, 4, 0, Math.PI); ctx.closePath(); ctx.fill();
      break;
    case 'track':
      neck(3.8); lineD([0, top + 4, 0, bot], '#fff', 1.6);
      ctx.fillStyle = '#ff9933'; ctx.fillRect(-10, -19, 6.4, 1.9); ctx.fillStyle = '#fff'; ctx.fillRect(-10, -17.1, 6.4, 1.9); ctx.fillStyle = '#138808'; ctx.fillRect(-10, -15.2, 6.4, 1.9);
      break;
    case 'saree':
      ctx.fillStyle = o.c1; ctx.beginPath(); ctx.moveTo(-sw - 2, top - 1); ctx.lineTo(-sw + 10, top - 1); ctx.lineTo(ww + 2, -3); ctx.lineTo(ww + 2, 3); ctx.lineTo(-ww - 2, 3); ctx.lineTo(-ww - 2, -9); ctx.closePath(); ctx.fill();
      lineD([-sw + 10, top - 1, ww + 2, -3], o.c2, 2.6); lineD([-sw + 11.5, top - 1, ww + 2, -1.2], OUT, 0.9);
      neck(5);
      break;
    case 'suit':
      neck(4.6);
      if (!o.nodupatta) {
        ctx.fillStyle = o.c3;
        ctx.beginPath(); ctx.moveTo(-sw, top); ctx.lineTo(-sw + 6, top); ctx.lineTo(-ww + 5, bot); ctx.lineTo(-ww - 3, bot); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(sw, top); ctx.lineTo(sw - 6, top); ctx.lineTo(ww - 5, bot); ctx.lineTo(ww + 3, bot); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = o.c3; ctx.lineWidth = 4.4; ctx.beginPath(); ctx.moveTo(-sw + 3, top + 2); ctx.quadraticCurveTo(0, top + 13, sw - 3, top + 2); ctx.stroke();
      } else {
        lineD([0, top + 5, 0, bot], shade(o.c1, -0.25), 1.2);
        ctx.fillStyle = '#f5c542'; for (const y of [-17, -11, -5]) { ctx.beginPath(); ctx.arc(0, y, 0.9, 0, TAU); ctx.fill(); }
      }
      break;
  }
  if (acc.includes('chain')) { ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-5, top + 1); ctx.quadraticCurveTo(0, top + 12, 5, top + 1); ctx.stroke(); circ(ctx, 0, top + 7.6, 1.8, '#f5c542', 0.8); }
  ctx.restore();

  // --- arms
  const sY = top + 4;
  const hand = (x, y, big, ang) => {
    if (acc.includes('gloves')) {
      circ(ctx, x, y, big ? 7.6 : 6.2, '#e3173e'); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, big ? 4.4 : 3.6, 0.4, 2); ctx.stroke();
    } else if (big) {
      ctx.strokeStyle = OUT; ctx.lineWidth = 3.4; ctx.beginPath();
      for (const a of [-0.5, -0.17, 0.17, 0.5]) { ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang + a) * 9, y + Math.sin(ang + a) * 9); } ctx.stroke();
      ctx.strokeStyle = skin; ctx.lineWidth = 1.8; ctx.stroke();
      circ(ctx, x, y, 5.2, skin);
    } else circ(ctx, x, y, 3.7, skin, 1.8);
  };
  const arm = (s, hx, hy, big, ang) => {
    const ax = s * (sw - 1.5);
    limb(ctx, ax, sY, hx, hy, aw, armCol);
    if (sleeve === 'short') limb(ctx, lerp(ax, hx, 0.5), lerp(sY, hy, 0.5), hx, hy, aw - 1.2, skin);
    if (kind === 'track') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(ax, sY); ctx.lineTo(hx, hy); ctx.stroke(); }
    if (s > 0 && acc.includes('bracelet')) {   // silver chain with a blue stone on the right wrist
      const bx = lerp(ax, hx, 0.8), by = lerp(sY, hy, 0.8);
      circ(ctx, bx, by, aw * 0.56, '#d9dde3', 1.2); circ(ctx, bx, by, 1.5, '#2fc4d6', 0);
    }
    hand(hx, hy, big, ang);
  };
  const swing = Math.sin(ph) * 3.4 * walk;
  let lx = -(sw + 3.5), ly = -3 + swing, rx = sw + 3.5, ry = -3 - swing;
  if (sit) { lx = -(sw - 2); ly = -3; rx = sw - 2; ry = -3; }
  if (air || p.swim) { const w = p.swim ? Math.sin(t * 7) * 5 : 0; lx = -(sw + 8); ly = -33 + w; rx = sw + 8; ry = -33 - w; }
  if (acc.includes('mic') && !sit && !air && !p.swim) {   // the host carries his mic at chest height
    lx = -(sw - 7); ly = -8 + swing * 0.3;
    arm(-1, lx, ly);
    ctx.strokeStyle = '#2a2c33'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(lx, ly + 1.5); ctx.lineTo(lx + 2.2, ly - 7.5); ctx.stroke();
    circ(ctx, lx, ly, 3.7, skin, 1.8);   // fist wraps the handle
    circ(ctx, lx + 2.9, ly - 10.4, 3.9, '#dfe3ea', 1.5);
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(lx - 0.4, ly - 10.4); ctx.lineTo(lx + 6.2, ly - 10.4); ctx.stroke();
  } else arm(-1, lx, ly);
  if (slap > 0) {
    const ax = sw - 1.5;
    if (slap < 0.25) {
      const k = slap / 0.25; arm(1, lerp(rx, ax - 6, k), lerp(ry, sY - 22, k), true, -1.9);
    } else if (slap < 0.55) {
      const k = (slap - 0.25) / 0.3, a = -2.1 + k * 2.3;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(ax, sY, 27, Math.max(-2.1, a - 1.1), a); ctx.stroke();
      arm(1, ax + Math.cos(a) * 25, sY + Math.sin(a) * 25, true, a);
    } else {
      const k = (slap - 0.55) / 0.45; arm(1, lerp(ax + 24.5, rx, k), lerp(sY + 5, ry, k), k < 0.5, 0.2);
    }
  } else arm(1, rx, ry);

  // --- head
  const nk = L.neck || 3.4;
  ctx.fillStyle = skin; ctx.fillRect(-nk, top - 4, nk * 2, 6);
  ctx.translate(0, -42);
  if (walk) ctx.rotate(Math.sin(ph) * 0.035 * walk);
  drawHead(ctx, L, p);
  if (hit > 0) {
    for (let k = 0; k < 3; k++) {
      const a = t * 7 + k * 2.094, x = Math.cos(a) * 15, y = -25 + Math.sin(a) * 4.5;
      star(ctx, x, y, 4.4, '#ffe14a');
    }
  }
  ctx.restore();
}

export function star(ctx, x, y, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke();
}

// Head-and-shoulders portrait, used for HUD chips, the Wall of Fame and cards.
export function drawBust(ctx, L, cx, cy, scale, pose = {}) {
  ctx.save(); ctx.translate(cx, cy + 58 * scale * (L.h || 1)); ctx.scale(scale, scale);
  drawAvatar(ctx, L, { t: 1, ...pose }); ctx.restore();
}
