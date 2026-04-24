// Bootstrap: load levels, wire inputs, run game loop. The "cold open" entrypoint.

import { bus, EVENTS } from "./events.js";
import { StateMachine, PHASE } from "./state.js";
import { loadLevels, createLevel, createDaily } from "./levels.js";
import { PlaceArrowCommand, RemoveArrowCommand, ClearCommand, CommandHistory } from "./commands.js";
import { Renderer } from "./render.js";
import { Juice } from "./juice.js";
import { Progress } from "./storage.js";

const TICK_MS = 280; // movement cadence during RUN

const DIRS = ["N", "E", "S", "W"];
const GLYPH_FOR_DIR = { N: "⬆", E: "➡", S: "⬇", W: "⬅" };

const $ = (sel) => document.querySelector(sel);

const app = {
  levels: [],
  levelIndex: 0,
  isDaily: false,
  board: null,
  sm: new StateMachine(),
  history: new CommandHistory(),
  juice: new Juice(),
  progress: new Progress(),
  renderer: null,
  tickTimer: null,
  runResultHandled: false,
  lastTs: 0,
  dragging: null, // { dir, ghostEl }
};

async function boot() {
  app.levels = await loadLevels();
  app.progress.setIdOrder(app.levels.map(l => l.id));

  const canvas = $("#game");
  app.renderer = new Renderer(canvas, app.juice);

  app.juice.setMuted(app.progress.getMuted());
  updateMuteButton();

  // Cold-open: load current level immediately, no splash.
  const startIdx = Math.max(0, Math.min(app.levels.length - 1, app.progress.data.currentLevel - 1));
  loadLevelIndex(startIdx);

  wireInputs();
  wireHUD();
  wireEvents();

  requestAnimationFrame(loop);
}

function loadLevelIndex(i, daily = false) {
  app.levelIndex = i;
  app.isDaily = daily;
  const def = daily ? null : app.levels[i];
  app.board = daily ? createDaily(app.levels, app.progress.todayKey()) : createLevel(def);
  app.history.clear();
  app.runResultHandled = false;
  app.sm.phase = PHASE.PLACING;
  hideOverlay();
  setWorld(app.board.world);
  $("#level-title").textContent = daily ? `🌟 ${app.board.title}` : `L${app.board.id} · ${worldName(app.board.world)} · ${app.board.title}`;
  app.renderer.setBoard(app.board);
  app.renderer.setUnitInstant(app.board.unit.x, app.board.unit.y);
  syncHUD();
  renderTray();
  $("#btn-run").classList.remove("hidden");
  $("#btn-retry").classList.add("hidden");
}

function worldName(w) {
  return w === 1 ? "Workshop" : w === 2 ? "Nebula" : "High Seas";
}

function setWorld(w) {
  $("#app").dataset.world = String(w);
  bus.emit(EVENTS.WORLD_CHANGED, { world: w });
}

function syncHUD() {
  const placed = app.board.totalPlaced();
  const budgetTotal = Object.values(app.board.budget).reduce((a, b) => a + b, 0);
  $("#budget").textContent = `${placed} / ${budgetTotal} · par ${app.board.par}`;
  $("#streak").textContent = `🔥 ${app.progress.getStreak()}`;
  const starsGot = app.progress.starsFor(app.board.id);
  $("#stars").textContent = renderStars(starsGot);
}

function renderStars(n) {
  return "★".repeat(n) + "☆".repeat(3 - n);
}

function renderTray() {
  const tray = $("#tray-tiles");
  tray.innerHTML = "";
  const rem = app.board.remainingBudget();
  for (const d of DIRS) {
    const total = app.board.budget[d] || 0;
    if (total === 0) continue;
    const used = total - rem[d];
    const el = document.createElement("div");
    el.className = "tray-tile";
    el.dataset.dir = d;
    el.dataset.count = String(rem[d]);
    el.innerHTML = `<span>${GLYPH_FOR_DIR[d]}</span><span class="count">${rem[d]}/${total}</span>`;
    el.addEventListener("pointerdown", (ev) => startDrag(ev, d));
    tray.appendChild(el);
  }
}

// --- Drag & drop arrow placement ---

function startDrag(ev, dir) {
  if (!app.sm.is(PHASE.PLACING)) return;
  if ((app.board.remainingBudget()[dir] ?? 0) <= 0) return;
  app.juice.unlockAudio();
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  ghost.textContent = GLYPH_FOR_DIR[dir];
  document.body.appendChild(ghost);
  app.dragging = { dir, ghostEl: ghost };
  app.renderer.dragDir = dir;
  moveGhost(ev.clientX, ev.clientY);
  ev.target.setPointerCapture?.(ev.pointerId);
  const onMove = (e) => {
    moveGhost(e.clientX, e.clientY);
    const cell = app.renderer.screenToCell(e.clientX, e.clientY);
    app.renderer.hoverCell = cell;
  };
  const onUp = (e) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    const cell = app.renderer.screenToCell(e.clientX, e.clientY);
    if (cell) {
      app.history.execute(new PlaceArrowCommand(app.board, cell.x, cell.y, dir));
    }
    if (app.dragging?.ghostEl) app.dragging.ghostEl.remove();
    app.dragging = null;
    app.renderer.dragDir = null;
    app.renderer.hoverCell = null;
    renderTray();
    syncHUD();
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

function moveGhost(x, y) {
  if (!app.dragging) return;
  const g = app.dragging.ghostEl;
  g.style.left = x + "px";
  g.style.top = y + "px";
}

// --- Click on placed arrow removes it. ---
function onCanvasClick(ev) {
  if (!app.sm.is(PHASE.PLACING)) return;
  const cell = app.renderer.screenToCell(ev.clientX, ev.clientY);
  if (!cell) return;
  const arrow = app.board.arrowAt(cell.x, cell.y);
  if (arrow) {
    app.history.execute(new RemoveArrowCommand(app.board, cell.x, cell.y));
    renderTray();
    syncHUD();
  }
}

function wireInputs() {
  const canvas = $("#game");
  canvas.addEventListener("click", onCanvasClick);

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === " ") { e.preventDefault(); if (app.sm.is(PHASE.PLACING)) startRun(); }
    if (e.key === "r" || e.key === "R") { e.preventDefault(); retry(); }
    if (e.key === "z" || e.key === "Z") { e.preventDefault(); undo(); }
    if (e.key === "n" || e.key === "N") { e.preventDefault(); next(); }
    if (e.key === "Escape") { toggleMap(false); }
    if (e.key === "m" || e.key === "M") { toggleMute(); }
  });

  // Touch: pinch/scroll prevention on canvas
  canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
}

function wireHUD() {
  $("#btn-run").addEventListener("click", () => { if (app.sm.is(PHASE.PLACING)) startRun(); });
  $("#btn-retry").addEventListener("click", retry);
  $("#btn-undo").addEventListener("click", undo);
  $("#btn-clear").addEventListener("click", () => {
    app.history.execute(new ClearCommand(app.board));
    renderTray(); syncHUD();
  });
  $("#btn-map").addEventListener("click", () => toggleMap(true));
  $("#btn-close-map").addEventListener("click", () => toggleMap(false));
  $("#btn-daily").addEventListener("click", () => {
    toggleMap(false);
    loadLevelIndex(0, true);
  });
  $("#btn-mute").addEventListener("click", toggleMute);
}

function wireEvents() {
  bus.on(EVENTS.LEVEL_WON, ({ stars }) => {
    syncHUD();
    showWinOverlay(stars);
  });
  bus.on(EVENTS.LEVEL_FAILED, ({ reason, nearMiss }) => {
    showFailOverlay(reason, nearMiss);
  });
}

function undo() {
  if (!app.sm.is(PHASE.PLACING)) return;
  if (app.history.undo()) {
    renderTray(); syncHUD();
  }
}

function toggleMute() {
  const m = !app.progress.getMuted();
  app.progress.setMuted(m);
  app.juice.setMuted(m);
  updateMuteButton();
}
function updateMuteButton() {
  $("#btn-mute").textContent = app.progress.getMuted() ? "🔇" : "🔊";
}

// --- Run phase ---

function startRun() {
  if (!app.sm.transition(PHASE.RUNNING)) return;
  app.runResultHandled = false;
  $("#btn-run").classList.add("hidden");
  $("#btn-retry").classList.remove("hidden");
  // Kick the tick loop at TICK_MS cadence.
  const tick = () => {
    if (!app.sm.is(PHASE.RUNNING)) return;
    const fromX = app.board.unit.x, fromY = app.board.unit.y;
    // Telegraph cannons that will fire this step (BEFORE step).
    const willFire = app.board.hazards.filter(h => h.type === "cannon" && ((app.board.tickN + 1 + h.phase) % h.period === 0));
    for (const c of willFire) {
      app.renderer.pushCannonBeam(c.beamCells(app.board), 0.3);
      bus.emit(EVENTS.CANNON_FIRED, { x: c.x, y: c.y });
    }
    const status = app.board.step();
    app.renderer.startUnitTween({ x: fromX, y: fromY }, { x: app.board.unit.x, y: app.board.unit.y }, TICK_MS / 1000 * 0.9);
    if (status === "running") {
      app.tickTimer = setTimeout(tick, TICK_MS);
    } else {
      app.tickTimer = setTimeout(() => resolveRun(status), TICK_MS);
    }
  };
  app.tickTimer = setTimeout(tick, 160);
}

function resolveRun(status) {
  if (app.runResultHandled) return;
  app.runResultHandled = true;
  app.sm.transition(PHASE.RESOLVE);
  if (status === "won") {
    const stars = app.board.computeStars();
    if (!app.isDaily) {
      app.progress.recordStars(app.board.id, stars, app.levelIndex);
    } else {
      app.progress.recordDaily(stars);
    }
    app.sm.transition(PHASE.WIN);
    bus.emit(EVENTS.LEVEL_WON, { stars, levelId: app.board.id });
  } else {
    const arrowsPlaced = app.board.totalPlaced();
    const budgetTotal = Object.values(app.board.budget).reduce((a, b) => a + b, 0);
    const nearMiss = (budgetTotal - arrowsPlaced) <= 1 && arrowsPlaced >= app.board.par;
    app.sm.transition(PHASE.FAIL);
    bus.emit(EVENTS.LEVEL_FAILED, {
      reason: status === "timeout" ? "Timed out — maybe a loop?" : (app.board.crashReason || "crash"),
      nearMiss,
    });
  }
}

function retry() {
  clearTimeout(app.tickTimer);
  if (app.sm.is(PHASE.RUNNING)) {
    app.sm.transition(PHASE.PLACING);
  } else if (app.sm.is(PHASE.WIN) || app.sm.is(PHASE.FAIL)) {
    app.sm.transition(PHASE.PLACING);
  }
  app.board.resetRuntime();
  app.renderer.setUnitInstant(app.board.unit.x, app.board.unit.y);
  app.runResultHandled = false;
  hideOverlay();
  $("#btn-run").classList.remove("hidden");
  $("#btn-retry").classList.add("hidden");
  syncHUD();
  renderTray();
}

function next() {
  if (app.isDaily) {
    loadLevelIndex(app.progress.data.currentLevel - 1 || 0);
    return;
  }
  const nextIdx = Math.min(app.levels.length - 1, app.levelIndex + 1);
  loadLevelIndex(nextIdx);
}

// --- Overlays ---

function hideOverlay() {
  const el = $("#overlay");
  el.classList.add("hidden");
  el.innerHTML = "";
}

function showWinOverlay(stars) {
  const el = $("#overlay");
  el.classList.remove("hidden");
  el.innerHTML = "";
  const isLast = app.levelIndex >= app.levels.length - 1 && !app.isDaily;
  const dailyUnlocked = !app.isDaily && app.progress.dailyUnlocked(app.levels);
  el.innerHTML = `
    <div class="big-stars pop">${renderStars(stars)}</div>
    <h2 class="pop">${isLast ? "Voyage Complete!" : "Charted!"}</h2>
    <p>${subtitleFor(stars, app.board)}</p>
    <div class="row">
      <button id="ov-retry">↺ Retry</button>
      <button id="ov-map">☰ Map</button>
      ${dailyUnlocked && isLast ? `<button id="ov-daily" class="primary">🌟 Daily</button>` : ""}
      ${isLast ? "" : `<button id="ov-next" class="primary">Next ▶</button>`}
    </div>
  `;
  $("#ov-retry").addEventListener("click", retry);
  $("#ov-map").addEventListener("click", () => toggleMap(true));
  const nb = $("#ov-next"); if (nb) nb.addEventListener("click", next);
  const db = $("#ov-daily"); if (db) db.addEventListener("click", () => { hideOverlay(); loadLevelIndex(0, true); });
  if (dailyUnlocked) $("#btn-daily").classList.remove("hidden");
}

function subtitleFor(stars, board) {
  if (stars === 3) return `3-star! Used ${board.totalPlaced()} of par ${board.par}. Streak ${app.progress.getStreak()}.`;
  const missed = [];
  if (!board.allGemsCollected()) missed.push("collect all gems");
  if (board.totalPlaced() > board.par) missed.push(`use ≤ ${board.par} arrows (you used ${board.totalPlaced()})`);
  return missed.length ? `For 3 stars: ${missed.join(" and ")}.` : "Nice work.";
}

function showFailOverlay(reason, nearMiss) {
  const el = $("#overlay");
  el.classList.remove("hidden");
  el.innerHTML = `
    <h2 class="pop">${nearMiss ? "So close!" : "Crashed"}</h2>
    <p>${humanReason(reason)}</p>
    <div class="row">
      <button id="ov-retry" class="primary">↺ Retry (R)</button>
      <button id="ov-map">☰ Map</button>
    </div>
  `;
  $("#ov-retry").addEventListener("click", retry);
  $("#ov-map").addEventListener("click", () => toggleMap(true));
}

function humanReason(r) {
  const m = {
    offgrid: "Sailed off the edge of the map.",
    asteroid: "Smacked into an asteroid.",
    cannon: "Caught in the line of fire.",
    "Timed out — maybe a loop?": "The path loops — try a different route.",
  };
  return m[r] || `Run ended: ${r}`;
}

// --- Map screen ---

function toggleMap(open) {
  const s = $("#map-screen");
  if (open) {
    renderMap();
    s.classList.remove("hidden");
  } else {
    s.classList.add("hidden");
  }
}

function renderMap() {
  const grid = $("#map-grid");
  grid.innerHTML = "";
  const maxUnlocked = app.progress.data.currentLevel; // 1-indexed end
  for (let i = 0; i < app.levels.length; i++) {
    const L = app.levels[i];
    const stars = app.progress.starsFor(L.id);
    const unlocked = i < maxUnlocked;
    const cur = i === app.levelIndex && !app.isDaily;
    const cell = document.createElement("div");
    cell.className = "map-cell" + (unlocked ? "" : " locked") + (cur ? " current" : "");
    cell.innerHTML = `
      <div class="lvl">${L.id}</div>
      <div>${worldTag(L.world)}</div>
      <div class="stars-small">${renderStars(stars)}</div>
    `;
    cell.addEventListener("click", () => {
      if (!unlocked) return;
      toggleMap(false);
      loadLevelIndex(i);
    });
    grid.appendChild(cell);
  }
  if (app.progress.dailyUnlocked(app.levels)) {
    $("#btn-daily").classList.remove("hidden");
  } else {
    $("#btn-daily").classList.add("hidden");
  }
}

function worldTag(w) {
  return w === 1 ? "🤖" : w === 2 ? "🚀" : "🏴‍☠️";
}

// --- Main loop ---

function loop(ts) {
  const dt = app.lastTs ? Math.min(0.05, (ts - app.lastTs) / 1000) : 0;
  app.lastTs = ts;
  app.juice.update(dt);
  app.renderer.update(dt);
  app.renderer.draw();
  requestAnimationFrame(loop);
}

boot().catch(err => {
  console.error(err);
  const stage = $("#stage");
  stage.innerHTML = `<div style="color:#ff6b6b;padding:20px">Failed to load: ${err.message}</div>`;
});
