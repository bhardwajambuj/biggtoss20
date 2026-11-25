// All sound is synthesised with WebAudio, so there are no audio files to ship.

let ac = null, master = null, muted = false;

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ac.destination);
  } catch (e) { ac = null; }
}

export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.55; }

function env(g, t, attack, peak, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(type, f0, f1, dur, vol, delay = 0) {
  if (!ac || vol <= 0.01) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.008, vol, dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur, vol, type, f0, f1, q = 1, delay = 0) {
  if (!ac || vol <= 0.01) return;
  const t = ac.currentTime + delay, n = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = buf; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  env(g, t, 0.004, vol, dur); s.connect(f); f.connect(g); g.connect(master); s.start(t);
}

export const sfx = {
  slap(v = 1) { noise(0.13, 0.9 * v, 'bandpass', 2200, 900, 0.7); tone('sine', 190, 70, 0.12, 0.5 * v); },
  punch(v = 1) { noise(0.16, 0.8 * v, 'lowpass', 900, 200, 0.8); tone('sine', 120, 45, 0.2, 0.7 * v); },
  whoosh(v = 1) { noise(0.2, 0.22 * v, 'bandpass', 500, 2600, 1.4); },
  jump(v = 1) { tone('square', 260, 640, 0.16, 0.1 * v); },
  land(v = 1) { tone('sine', 150, 60, 0.1, 0.22 * v); },
  splash(v = 1) { noise(0.5, 0.5 * v, 'lowpass', 1800, 300, 0.6); },
  sit(v = 1) { tone('sine', 230, 140, 0.12, 0.2 * v); },
  pop(v = 1) { tone('triangle', 520, 940, 0.07, 0.14 * v); },
  ko(v = 1) { tone('sawtooth', 620, 80, 0.75, 0.16 * v); tone('square', 310, 40, 0.75, 0.08 * v); },
  ding(v = 1) { tone('sine', 880, 880, 0.3, 0.16 * v); tone('sine', 1174, 1174, 0.5, 0.16 * v, 0.15); },
  life(v = 1) { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.2, 0.18 * v, i * 0.09)); },
  rooster(v = 1) {
    [[520, 700, 0.12], [700, 720, 0.1], [720, 980, 0.16], [980, 940, 0.34], [900, 520, 0.3]].reduce((d, [a, b, len]) => {
      tone('sawtooth', a, b, len, 0.13 * v, d); return d + len * 0.92;
    }, 0);
  },
};
