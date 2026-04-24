// Heart Putt — mini-golf dating sim.
// Pull back on the ball, release to putt. Fewer strokes = hotter date.

import { HOLES } from "./holes.js";
import { stepBall, circleHit } from "./physics.js";
import { sfx, setMuted, isMuted, unlock } from "./audio.js";

const VW = 420, VH = 640;           // virtual canvas size (portrait)
const BALL_R = 10;
const HOLE_R = 18;
const MAX_POWER = 760;              // px/sec
const POWER_PER_PX = 5.5;           // px of drag → velocity

const STORAGE = "heartputt.v1";

const $ = (s) => document.querySelector(s);
const canvas = $("#game");
const ctx = canvas.getContext("2d");

const state = {
  holeIndex: 0,
  ball: { x: 0, y: 0, vx: 0, vy: 0, r: BALL_R },
  strokes: 0,
  phase: "AIM",        // AIM | BALL_MOVING | SUNK | TRANSITION
  drag: null,          // { sx, sy, x, y } screen coords during pointer drag
  lastTs: 0,
  sinkT: 0,
  starsByHole: {},
  muted: false,
  toasts: [],          // [{ text, age, life }]
};

function save() {
  try { localStorage.setItem(STORAGE, JSON.stringify({ starsByHole: state.starsByHole, muted: state.muted })); } catch (_) {}
}
function load() {
  try { const raw = localStorage.getItem(STORAGE); if (raw) {
    const d = JSON.parse(raw);
    state.starsByHole = d.starsByHole || {};
    state.muted = !!d.muted;
    setMuted(state.muted);
  } } catch (_) {}
}

function loadHole(i) {
  state.holeIndex = i;
  const h = HOLES[i];
  state.ball.x = h.tee.x;
  state.ball.y = h.tee.y;
  state.ball.vx = 0; state.ball.vy = 0;
  state.strokes = 0;
  state.phase = "AIM";
  state.drag = null;
  state.sinkT = 0;
  state.toasts = [];
  $("#hole-num").textContent = `Date ${h.id}`;
  $("#hole-name").textContent = h.name;
  $("#strokes").textContent = "0";
  $("#par-label").textContent = `par ${h.par}`;
  $("#stars").textContent = starStr(0);
  $("#quip").textContent = h.quips.intro;
  $("#btn-next").classList.add("hidden");
  hideOverlay();
}

function starStr(n) { return "★".repeat(n) + "☆".repeat(3 - n); }

function computeStars(h, strokes) {
  // 3: <= par-1; 2: par; 1: par+1; 0: worse
  if (strokes <= h.par - 1) return 3;
  if (strokes <= h.par) return 2;
  if (strokes <= h.par + 1) return 1;
  return 0;
}

// --- Input ---

function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) * (VW / r.width);
  const y = (e.clientY - r.top) * (VH / r.height);
  return { x, y };
}

function onPointerDown(e) {
  unlock();
  if (state.phase !== "AIM") return;
  const p = canvasPoint(e);
  const dx = p.x - state.ball.x, dy = p.y - state.ball.y;
  // Only start a drag if reasonably close to the ball (or anywhere — generous).
  state.drag = { sx: state.ball.x, sy: state.ball.y, x: p.x, y: p.y };
  canvas.setPointerCapture?.(e.pointerId);
}
function onPointerMove(e) {
  if (!state.drag) return;
  const p = canvasPoint(e);
  state.drag.x = p.x;
  state.drag.y = p.y;
}
function onPointerUp(_e) {
  if (!state.drag || state.phase !== "AIM") { state.drag = null; return; }
  // Velocity is OPPOSITE to the drag direction (pull-back-to-fire).
  const dx = state.drag.sx - state.drag.x;
  const dy = state.drag.sy - state.drag.y;
  const dist = Math.hypot(dx, dy);
  const p = Math.min(MAX_POWER, dist * POWER_PER_PX);
  if (p < 40) { state.drag = null; return; } // dead zone — cancel
  const nx = dx / (dist || 1), ny = dy / (dist || 1);
  state.ball.vx = nx * p;
  state.ball.vy = ny * p;
  state.strokes++;
  $("#strokes").textContent = String(state.strokes);
  state.phase = "BALL_MOVING";
  state.drag = null;
  sfx.putt();
}

canvas.addEventListener("pointerdown", onPointerDown);
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointercancel", onPointerUp);

window.addEventListener("keydown", (e) => {
  if (e.key === "r" || e.key === "R") retry();
  if (e.key === "n" || e.key === "N") { if (!$("#btn-next").classList.contains("hidden")) next(); }
  if (e.key === "m" || e.key === "M") toggleMute();
});

$("#btn-retry").addEventListener("click", retry);
$("#btn-next").addEventListener("click", next);
$("#btn-mute").addEventListener("click", toggleMute);

function toggleMute() {
  state.muted = !state.muted;
  setMuted(state.muted);
  $("#btn-mute").textContent = state.muted ? "🔇" : "🔊";
  save();
}

// --- Game flow ---

function retry() { loadHole(state.holeIndex); }

function next() {
  if (state.holeIndex >= HOLES.length - 1) {
    showFinalOverlay();
    return;
  }
  sfx.next();
  loadHole(state.holeIndex + 1);
}

function toast(text, life = 1.2) { state.toasts.push({ text, age: 0, life }); }

function checkSink() {
  const h = HOLES[state.holeIndex];
  const dx = h.hole.x - state.ball.x;
  const dy = h.hole.y - state.ball.y;
  const d = Math.hypot(dx, dy);
  const speed = Math.hypot(state.ball.vx, state.ball.vy);
  if (d < HOLE_R + 4 && speed < 420) {
    // Capture the ball — ease it into the hole, then resolve.
    state.ball.vx *= 0.15; state.ball.vy *= 0.15;
    state.ball.x += dx * 0.25;
    state.ball.y += dy * 0.25;
    if (d < 8) {
      state.phase = "SUNK";
      state.sinkT = 0;
      sfx.sink();
      resolveHole();
    }
  }
}

function resolveHole() {
  const h = HOLES[state.holeIndex];
  const stars = computeStars(h, state.strokes);
  state.starsByHole[h.id] = Math.max(state.starsByHole[h.id] || 0, stars);
  save();
  $("#stars").textContent = starStr(stars);
  const quipKey = stars === 3 ? "birdie" : stars === 2 ? "par" : stars === 1 ? "bogey" : "miss";
  showHoleOverlay(stars, h.quips[quipKey]);
}

function showHoleOverlay(stars, quip) {
  const ov = $("#overlay");
  ov.classList.remove("hidden");
  const isLast = state.holeIndex >= HOLES.length - 1;
  ov.innerHTML = `
    <div class="big-stars pop">${starStr(stars)}</div>
    <h2 class="pop">${titleForStars(stars)}</h2>
    <p>${quip}</p>
    <div class="row">
      <button id="ov-retry">↺ Retry</button>
      ${isLast ? `<button id="ov-final" class="primary">See result ▶</button>` : `<button id="ov-next" class="primary">Next date ▶</button>`}
    </div>
  `;
  $("#ov-retry").addEventListener("click", () => { hideOverlay(); retry(); });
  const nb = $("#ov-next"); if (nb) nb.addEventListener("click", () => { hideOverlay(); next(); });
  const fb = $("#ov-final"); if (fb) fb.addEventListener("click", () => { hideOverlay(); showFinalOverlay(); });
  $("#btn-next").classList.remove("hidden");
}

function titleForStars(s) {
  return s === 3 ? "Sparks ✨" : s === 2 ? "A nice time" : s === 1 ? "Mid date" : "Ghosted 👻";
}

function showFinalOverlay() {
  const ov = $("#overlay");
  ov.classList.remove("hidden");
  const total = HOLES.reduce((a, h) => a + (state.starsByHole[h.id] || 0), 0);
  const max = HOLES.length * 3;
  const pct = Math.round(total / max * 100);
  const grade = pct >= 95 ? "A+ Soulmates" : pct >= 80 ? "A Very Compatible" : pct >= 60 ? "B We'll See" : pct >= 40 ? "C Mid" : "D Let's Be Friends";
  ov.innerHTML = `
    <h2 class="pop">Compatibility</h2>
    <div class="big-stars pop">${pct}%</div>
    <p>${grade}</p>
    <p style="font-size:12px">Total ${total} / ${max} stars across ${HOLES.length} dates.</p>
    <div class="row">
      <button id="ov-replay" class="primary">Replay dating pool</button>
      <a class="back" href="../" style="padding:8px 12px;border:1px solid #ff7ab8;border-radius:8px;text-decoration:none">All games</a>
    </div>
  `;
  $("#ov-replay").addEventListener("click", () => { hideOverlay(); loadHole(0); });
}

function hideOverlay() { const ov = $("#overlay"); ov.classList.add("hidden"); ov.innerHTML = ""; }

// --- Loop ---

function loop(ts) {
  const dt = state.lastTs ? Math.min(0.033, (ts - state.lastTs) / 1000) : 0;
  state.lastTs = ts;

  if (state.phase === "BALL_MOVING") {
    const h = HOLES[state.holeIndex];
    const prevSpeed = Math.hypot(state.ball.vx, state.ball.vy);
    const prevInEx = h.zones.some(z => z.kind === "ex" && circleHit(state.ball, z));
    const prevInSilence = h.zones.some(z => z.kind === "silence" && circleHit(state.ball, z));
    const prevInPhone = h.zones.some(z => z.kind === "phone" && circleHit(state.ball, z));

    stepBall(state.ball, h.walls, h.zones, dt, { x: 0, y: 0, w: VW, h: VH });

    const nowSpeed = Math.hypot(state.ball.vx, state.ball.vy);
    if (prevSpeed > 0 && nowSpeed > prevSpeed * 1.4) sfx.bounce(nowSpeed);

    const nowInEx = h.zones.some(z => z.kind === "ex" && circleHit(state.ball, z));
    if (nowInEx && !prevInEx) { sfx.ex(); toast("the ex! 🚩", 1.0); }
    const nowInSilence = h.zones.some(z => z.kind === "silence" && circleHit(state.ball, z));
    if (nowInSilence && !prevInSilence) { sfx.silence(); toast("awkward silence...", 1.0); }
    const nowInPhone = h.zones.some(z => z.kind === "phone" && circleHit(state.ball, z));
    if (nowInPhone && !prevInPhone) { sfx.phone(); toast("they're on their phone 📱", 1.0); }

    checkSink();
    if (state.ball.vx === 0 && state.ball.vy === 0 && state.phase === "BALL_MOVING") {
      state.phase = "AIM";
    }
  }

  for (const t of state.toasts) t.age += dt;
  state.toasts = state.toasts.filter(t => t.age < t.life);

  draw();
  requestAnimationFrame(loop);
}

// --- Rendering ---

function fitCanvas() {
  // Scale the virtual 420x640 canvas to fit the stage while preserving aspect.
  const stage = document.getElementById("stage");
  const rect = stage.getBoundingClientRect();
  const padding = 8;
  const targetW = Math.max(100, rect.width - padding * 2);
  const targetH = Math.max(100, rect.height - padding * 2);
  const scale = Math.min(targetW / VW, targetH / VH);
  canvas.style.width = (VW * scale) + "px";
  canvas.style.height = (VH * scale) + "px";
  canvas.width = VW;
  canvas.height = VH;
}
window.addEventListener("resize", fitCanvas);

function draw() {
  const h = HOLES[state.holeIndex];
  const c = ctx;
  c.clearRect(0, 0, VW, VH);

  // Grass backdrop with subtle stripes.
  const grad = c.createLinearGradient(0, 0, 0, VH);
  grad.addColorStop(0, "#18472f");
  grad.addColorStop(1, "#0e2a1e");
  c.fillStyle = grad;
  c.fillRect(0, 0, VW, VH);
  c.fillStyle = "rgba(255,255,255,0.03)";
  for (let y = 0; y < VH; y += 40) c.fillRect(0, y, VW, 20);

  // Hole
  c.save();
  const hx = h.hole.x, hy = h.hole.y;
  c.fillStyle = "rgba(255,77,134,0.25)";
  c.beginPath(); c.arc(hx, hy, HOLE_R + 10, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#2a0a1a";
  c.beginPath(); c.arc(hx, hy, HOLE_R, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#ff4d86";
  c.font = "26px system-ui";
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText("💖", hx, hy + 2);
  c.restore();

  // Zones
  for (const z of h.zones) drawZone(c, z);

  // Walls
  for (const w of h.walls) {
    c.fillStyle = "#6d3a56";
    roundRect(c, w.x, w.y, w.w, w.h, 4);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.06)";
    c.fillRect(w.x, w.y, w.w, 2);
  }

  // Tee marker
  c.strokeStyle = "rgba(255,255,255,0.25)";
  c.lineWidth = 1.5;
  c.setLineDash([3, 4]);
  c.beginPath(); c.arc(h.tee.x, h.tee.y, 14, 0, Math.PI * 2); c.stroke();
  c.setLineDash([]);

  // Aim line when dragging
  if (state.drag && state.phase === "AIM") {
    const dx = state.drag.sx - state.drag.x, dy = state.drag.sy - state.drag.y;
    const dist = Math.hypot(dx, dy);
    const p = Math.min(MAX_POWER, dist * POWER_PER_PX);
    const ratio = p / MAX_POWER;
    const nx = dx / (dist || 1), ny = dy / (dist || 1);
    const len = 30 + ratio * 140;
    const ex = state.ball.x + nx * len;
    const ey = state.ball.y + ny * len;
    c.strokeStyle = `rgba(255,122,184,${0.5 + ratio * 0.5})`;
    c.lineWidth = 3;
    c.setLineDash([6, 5]);
    c.beginPath(); c.moveTo(state.ball.x, state.ball.y); c.lineTo(ex, ey); c.stroke();
    c.setLineDash([]);
    // Power arc
    c.strokeStyle = `rgba(245,207,78,${0.3 + ratio * 0.5})`;
    c.lineWidth = 3;
    c.beginPath(); c.arc(state.ball.x, state.ball.y, 22 + ratio * 18, 0, Math.PI * 2); c.stroke();
    // Pull-back ghost
    c.fillStyle = "rgba(255,230,240,0.3)";
    c.beginPath(); c.arc(state.drag.x, state.drag.y, BALL_R, 0, Math.PI * 2); c.fill();
  }

  // Ball
  c.save();
  c.shadowColor = "rgba(0,0,0,0.55)";
  c.shadowBlur = 6; c.shadowOffsetY = 2;
  c.fillStyle = "#ffe6f0";
  c.beginPath(); c.arc(state.ball.x, state.ball.y, BALL_R + 1, 0, Math.PI * 2); c.fill();
  c.restore();
  c.font = "20px system-ui";
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText("❤️", state.ball.x, state.ball.y + 1);

  // Toasts
  c.textAlign = "center";
  for (let i = 0; i < state.toasts.length; i++) {
    const t = state.toasts[i];
    const a = Math.max(0, 1 - t.age / t.life);
    c.fillStyle = `rgba(255,230,240,${a})`;
    c.font = "bold 14px system-ui";
    c.fillText(t.text, VW / 2, 40 + i * 22);
  }
}

function drawZone(c, z) {
  const kind = z.kind;
  c.save();
  if (kind === "silence") {
    const g = c.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
    g.addColorStop(0, "rgba(74,111,143,0.55)");
    g.addColorStop(1, "rgba(74,111,143,0)");
    c.fillStyle = g;
    c.beginPath(); c.arc(z.x, z.y, z.r, 0, Math.PI * 2); c.fill();
    c.fillStyle = "rgba(255,255,255,0.5)";
    c.font = "14px system-ui";
    c.textAlign = "center";
    c.fillText("awkward", z.x, z.y - 4);
    c.fillText("silence", z.x, z.y + 12);
  } else if (kind === "ex") {
    const g = c.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
    g.addColorStop(0, "rgba(199,58,90,0.75)");
    g.addColorStop(1, "rgba(199,58,90,0)");
    c.fillStyle = g;
    c.beginPath(); c.arc(z.x, z.y, z.r, 0, Math.PI * 2); c.fill();
    c.font = "22px system-ui";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("🚩", z.x, z.y);
  } else if (kind === "phone") {
    const pulse = 0.9 + 0.1 * Math.sin(performance.now() / 180);
    const g = c.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
    g.addColorStop(0, `rgba(227,182,72,${0.55 * pulse})`);
    g.addColorStop(1, "rgba(227,182,72,0)");
    c.fillStyle = g;
    c.beginPath(); c.arc(z.x, z.y, z.r, 0, Math.PI * 2); c.fill();
    c.font = "20px system-ui";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("📱", z.x, z.y);
  }
  c.restore();
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// --- Boot ---

function boot() {
  load();
  $("#btn-mute").textContent = state.muted ? "🔇" : "🔊";
  fitCanvas();
  loadHole(0);
  requestAnimationFrame(loop);
}

boot();
