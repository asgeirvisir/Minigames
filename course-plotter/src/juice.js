// Juice layer: screen shake, particle pool, WebAudio oscillator blips.
// Subscribes to game events and produces satisfying feedback.

import { bus, EVENTS } from "./events.js";

const rand = (a, b) => a + Math.random() * (b - a);

class ParticlePool {
  constructor(size = 256) {
    this.pool = [];
    for (let i = 0; i < size; i++) {
      this.pool.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, age: 0, r: 0, color: "#fff" });
    }
  }
  spawn(n, opts) {
    let spawned = 0;
    for (const p of this.pool) {
      if (spawned >= n) break;
      if (p.alive) continue;
      p.alive = true;
      p.x = opts.x; p.y = opts.y;
      const a = rand(0, Math.PI * 2);
      const s = rand(opts.speedMin ?? 60, opts.speedMax ?? 220);
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.life = opts.life ?? 0.8;
      p.age = 0;
      p.r = rand(opts.rMin ?? 2, opts.rMax ?? 5);
      p.color = opts.color ?? "#fff";
      spawned++;
    }
  }
  update(dt) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) { p.alive = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt;   // slight gravity
      p.vx *= 0.98;
    }
  }
  draw(ctx) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      const t = 1 - p.age / p.life;
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * t, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

class ShakeFX {
  constructor() { this.t = 0; this.mag = 0; }
  kick(mag = 10, dur = 0.25) { this.mag = Math.max(this.mag, mag); this.t = Math.max(this.t, dur); }
  update(dt) {
    if (this.t > 0) { this.t -= dt; if (this.t < 0) this.t = 0; }
    if (this.t <= 0) this.mag = 0;
  }
  offset() {
    if (this.mag <= 0) return { dx: 0, dy: 0 };
    const m = this.mag * (this.t > 0 ? Math.min(1, this.t * 4) : 0);
    return { dx: rand(-m, m), dy: rand(-m, m) };
  }
}

class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
  }
  ensure() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      console.warn("no audio", e);
    }
  }
  setMuted(v) { this.muted = v; }
  blip(freq, dur = 0.08, type = "square", vol = 1) {
    if (this.muted || !this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25 * vol, this.ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start();
    o.stop(this.ctx.currentTime + dur + 0.02);
  }
  chord(freqs, dur = 0.3, type = "triangle") {
    freqs.forEach((f, i) => setTimeout(() => this.blip(f, dur, type, 0.8), i * 60));
  }
}

export class Juice {
  constructor() {
    this.particles = new ParticlePool(256);
    this.shake = new ShakeFX();
    this.audio = new Audio();
    this.confetti = 0;
    this.confettiBurst = [];
    this._boardToScreen = (x, y) => ({ x, y }); // set by renderer
    this._bind();
  }
  setProjector(fn) { this._boardToScreen = fn; }
  setMuted(v) { this.audio.setMuted(v); }
  unlockAudio() { this.audio.ensure(); }

  _bind() {
    bus.on(EVENTS.GEM_COLLECTED, (p) => {
      const { x, y } = this._boardToScreen(p.x, p.y);
      this.particles.spawn(18, { x, y, color: "#f5cf4e", speedMin: 80, speedMax: 220, life: 0.7, rMin: 3, rMax: 6 });
      // rising pitch as streak grows (we approximate by counting recent gems via confetti)
      this.audio.blip(720 + Math.min(600, this.confetti * 40), 0.08, "square");
    });
    bus.on(EVENTS.TREASURE_HIT, (p) => {
      const { x, y } = this._boardToScreen(p.x, p.y);
      this.particles.spawn(14, { x, y, color: p.done ? "#f5cf4e" : "#d0a46a", life: 0.6, speedMax: 180 });
      this.audio.blip(p.done ? 880 : 520, 0.12, "triangle");
    });
    bus.on(EVENTS.UNIT_CRASHED, () => {
      this.shake.kick(14, 0.3);
      this.audio.blip(110, 0.2, "sawtooth");
      setTimeout(() => this.audio.blip(80, 0.25, "sawtooth"), 80);
    });
    bus.on(EVENTS.UNIT_WARPED, (p) => {
      const { x, y } = this._boardToScreen(p.x, p.y);
      this.particles.spawn(22, { x, y, color: "#b48bff", speedMax: 300, life: 0.5 });
      this.audio.blip(1200, 0.1, "sine");
      this.audio.blip(1500, 0.1, "sine");
    });
    bus.on(EVENTS.CANNON_FIRED, () => {
      this.shake.kick(6, 0.15);
      this.audio.blip(180, 0.1, "square");
    });
    bus.on(EVENTS.LEVEL_WON, (p) => {
      this.confetti = (p && p.stars) || 1;
      this.confettiBurst = Array.from({ length: 60 + (p.stars || 1) * 30 }, () => ({
        x: rand(80, 640), y: -10, vx: rand(-40, 40), vy: rand(40, 160),
        life: rand(1.5, 2.8), age: 0, color: ["#f5cf4e","#6dc5ff","#ff6b6b","#3fb950","#b48bff"][Math.floor(rand(0, 5))]
      }));
      this.audio.chord([523, 659, 784, 1046], 0.25, "triangle");
    });
    bus.on(EVENTS.LEVEL_FAILED, () => {
      this.shake.kick(10, 0.25);
      this.audio.chord([220, 196, 164], 0.2, "sawtooth");
    });
    bus.on(EVENTS.TILE_PLACED, () => {
      this.audio.blip(520, 0.04, "square", 0.5);
    });
    bus.on(EVENTS.TILE_REMOVED, () => {
      this.audio.blip(360, 0.04, "square", 0.4);
    });
    bus.on(EVENTS.UNIT_TURNED, () => {
      this.audio.blip(620, 0.04, "triangle", 0.4);
    });
  }

  update(dt) {
    this.particles.update(dt);
    this.shake.update(dt);
    for (const c of this.confettiBurst) {
      c.age += dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vy += 140 * dt;
      c.vx *= 0.99;
    }
    this.confettiBurst = this.confettiBurst.filter(c => c.age < c.life);
  }

  drawWorld(ctx) {
    this.particles.draw(ctx);
  }

  drawScreen(ctx, w, h) {
    for (const c of this.confettiBurst) {
      const t = 1 - c.age / c.life;
      ctx.globalAlpha = t;
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x, c.y, 6, 10);
    }
    ctx.globalAlpha = 1;
  }

  getOffset() { return this.shake.offset(); }
}
