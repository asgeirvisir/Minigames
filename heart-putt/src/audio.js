// WebAudio oscillator blips, no assets.
let ctx = null, master = null, muted = false;

function ensure() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  } catch (_) {}
}

export function setMuted(v) { muted = !!v; }
export function isMuted() { return muted; }
export function unlock() { ensure(); }

function blip(freq, dur = 0.1, type = "triangle", vol = 1) {
  if (muted || !ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.25 * vol, ctx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g); g.connect(master);
  o.start();
  o.stop(ctx.currentTime + dur + 0.02);
}

export const sfx = {
  putt: () => blip(440, 0.08, "square", 0.9),
  bounce: (v) => blip(200 + Math.min(600, v * 1.5), 0.05, "triangle", 0.5),
  phone: () => { blip(720, 0.05, "square", 0.5); blip(720, 0.05, "square", 0.5); },
  silence: () => blip(120, 0.14, "sine", 0.4),
  ex: () => { blip(180, 0.1, "sawtooth", 0.9); setTimeout(() => blip(140, 0.12, "sawtooth", 0.7), 60); },
  sink: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.18, "triangle", 0.8), i * 60)); },
  fail: () => { [220, 196, 164].forEach((f, i) => setTimeout(() => blip(f, 0.18, "sawtooth", 0.7), i * 80)); },
  next: () => blip(660, 0.08, "triangle", 0.6),
};
