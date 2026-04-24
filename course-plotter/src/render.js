// Canvas renderer with a Flyweight sprite atlas (emoji glyphs cached on an OffscreenCanvas).
// All visuals live here. The engine has no canvas dependency.

const GLYPHS = {
  robot: "🤖",
  ship: "🚀",
  pirate: "🏴‍☠️",
  gem: "💎",
  goal_r: "🏁",
  goal_s: "🛰️",
  goal_p: "🏝️",
  asteroid: "🪨",
  warp_a: "🌀",
  warp_b: "🌀",
  wind: "🌬️",
  cannon: "💣",
  treasure: "📦",
  arrow_N: "⬆",
  arrow_E: "➡",
  arrow_S: "⬇",
  arrow_W: "⬅",
};

const WORLD_UNITS = {
  1: GLYPHS.robot,
  2: GLYPHS.ship,
  3: GLYPHS.pirate,
};
const WORLD_GOAL = {
  1: GLYPHS.goal_r,
  2: GLYPHS.goal_s,
  3: GLYPHS.goal_p,
};

class SpriteAtlas {
  constructor(cellSize = 64) {
    this.cellSize = cellSize;
    this.cache = new Map(); // key -> OffscreenCanvas
  }
  get(key, glyph, size = null) {
    const k = `${key}@${size || this.cellSize}`;
    if (this.cache.has(k)) return this.cache.get(k);
    const s = size || this.cellSize;
    const c = typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(s, s)
      : Object.assign(document.createElement("canvas"), { width: s, height: s });
    const ctx = c.getContext("2d");
    ctx.font = `${Math.floor(s * 0.82)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(glyph, s / 2, s / 2 + 2);
    this.cache.set(k, c);
    return c;
  }
}

const DIR_ANGLE = { N: 0, E: Math.PI / 2, S: Math.PI, W: -Math.PI / 2 };

export class Renderer {
  constructor(canvas, juice) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: true });
    this.juice = juice;
    this.atlas = new SpriteAtlas(64);
    this.cell = 64;
    this.offsetX = 0;
    this.offsetY = 0;
    this.hoverCell = null; // { x, y }
    this.dragDir = null;
    this.runAnim = null; // { fromX, fromY, toX, toY, t, dur }
    this.prevUnit = null;
    this.flashFire = 0; // cannon flash timer
    this.cannonBeams = []; // transient beams
    this._fit();
    window.addEventListener("resize", () => this._fit());
    // juice needs cell->screen conversion for effects.
    juice.setProjector((x, y) => this.cellCenter(x, y));
  }

  _fit() {
    // Responsive: fit canvas to stage while preserving square cells.
    const stage = this.canvas.parentElement;
    const rect = stage.getBoundingClientRect();
    const pad = 16;
    const maxW = Math.max(200, rect.width - pad);
    const maxH = Math.max(200, rect.height - pad);
    const side = Math.min(maxW, maxH, 760);
    this.canvas.style.width = side + "px";
    this.canvas.style.height = side + "px";
    this.canvas.width = side;
    this.canvas.height = side;
  }

  setBoard(board) {
    this.board = board;
    const side = Math.min(this.canvas.width, this.canvas.height);
    const pad = 24;
    const avail = side - pad * 2;
    this.cell = Math.floor(Math.min(avail / board.cols, avail / board.rows));
    this.offsetX = Math.floor((this.canvas.width - this.cell * board.cols) / 2);
    this.offsetY = Math.floor((this.canvas.height - this.cell * board.rows) / 2);
    this.prevUnit = { x: board.unit.x, y: board.unit.y };
    this.runAnim = null;
  }

  cellCenter(cx, cy) {
    return {
      x: this.offsetX + cx * this.cell + this.cell / 2,
      y: this.offsetY + cy * this.cell + this.cell / 2,
    };
  }

  screenToCell(sx, sy) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (sx - rect.left) * (this.canvas.width / rect.width);
    const y = (sy - rect.top) * (this.canvas.height / rect.height);
    const cx = Math.floor((x - this.offsetX) / this.cell);
    const cy = Math.floor((y - this.offsetY) / this.cell);
    if (!this.board) return null;
    if (cx < 0 || cy < 0 || cx >= this.board.cols || cy >= this.board.rows) return null;
    return { x: cx, y: cy };
  }

  startUnitTween(from, to, dur) {
    this.runAnim = { fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, t: 0, dur };
  }
  setUnitInstant(x, y) {
    this.runAnim = null;
    this.prevUnit = { x, y };
  }

  update(dt) {
    if (this.runAnim) {
      this.runAnim.t += dt;
      if (this.runAnim.t >= this.runAnim.dur) {
        this.prevUnit = { x: this.runAnim.toX, y: this.runAnim.toY };
        this.runAnim = null;
      }
    }
    this.flashFire = Math.max(0, this.flashFire - dt);
    this.cannonBeams = this.cannonBeams.filter(b => (b.age += dt) < b.life);
  }

  pushCannonBeam(cells, life = 0.25) {
    this.cannonBeams.push({ cells, life, age: 0 });
    this.flashFire = 0.15;
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!this.board) return;
    const { dx, dy } = this.juice.getOffset();
    ctx.save();
    ctx.translate(dx, dy);

    this.drawGrid();
    this.drawPlacedArrows();
    this.drawHazards();
    this.drawGems();
    this.drawGoal();
    this.drawHover();
    this.drawCannonBeams();
    this.drawUnit();
    this.juice.drawWorld(ctx);

    ctx.restore();

    this.juice.drawScreen(ctx, w, h);
  }

  drawGrid() {
    const ctx = this.ctx;
    const { cols, rows } = this.board;
    const c = getComputedStyle(document.documentElement);
    const gridCol1 = c.getPropertyValue("--grid").trim() || "#2a313c";
    const gridCol2 = c.getPropertyValue("--grid-2").trim() || "#232a34";
    const accent = c.getPropertyValue("--accent").trim() || "#58a6ff";
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? gridCol1 : gridCol2;
        ctx.fillRect(this.offsetX + x * this.cell, this.offsetY + y * this.cell, this.cell, this.cell);
      }
    }
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let y = 0; y <= rows; y++) {
      ctx.beginPath();
      ctx.moveTo(this.offsetX, this.offsetY + y * this.cell);
      ctx.lineTo(this.offsetX + cols * this.cell, this.offsetY + y * this.cell);
      ctx.stroke();
    }
    for (let x = 0; x <= cols; x++) {
      ctx.beginPath();
      ctx.moveTo(this.offsetX + x * this.cell, this.offsetY);
      ctx.lineTo(this.offsetX + x * this.cell, this.offsetY + rows * this.cell);
      ctx.stroke();
    }
    // Start cell highlight.
    const s = this.board.startDef;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(this.offsetX + s.x * this.cell + 2, this.offsetY + s.y * this.cell + 2, this.cell - 4, this.cell - 4);
  }

  drawPlacedArrows() {
    const ctx = this.ctx;
    for (const [k, dir] of this.board.placedArrows.entries()) {
      const [x, y] = k.split(",").map(Number);
      const { x: px, y: py } = this.cellCenter(x, y);
      const glyph = GLYPHS[`arrow_${dir}`] || "?";
      ctx.save();
      ctx.globalAlpha = 0.95;
      const img = this.atlas.get(`arrow_${dir}`, glyph, this.cell);
      ctx.drawImage(img, px - this.cell / 2, py - this.cell / 2);
      ctx.restore();
    }
  }

  drawHazards() {
    for (const h of this.board.hazards) {
      switch (h.type) {
        case "warp": this._drawWarpPair(h); break;
        case "cannon": this._drawCannon(h); break;
        case "wind": this._drawWindArrow(h); break;
        case "treasure": this._drawTreasure(h); break;
        case "asteroid":
        default: this._drawGlyph(h.x, h.y, "asteroid", GLYPHS.asteroid);
      }
    }
  }

  _drawWindArrow(h) {
    const ctx = this.ctx;
    const { x: px, y: py } = this.cellCenter(h.x, h.y);
    const img = this.atlas.get("wind", GLYPHS.wind, this.cell);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.drawImage(img, px - this.cell / 2, py - this.cell / 2);
    ctx.restore();
    // small directional arrow overlay
    const arrowImg = this.atlas.get(`arrow_${h.dir}`, GLYPHS[`arrow_${h.dir}`], Math.floor(this.cell * 0.45));
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.drawImage(arrowImg, px - this.cell * 0.22, py + this.cell * 0.05);
    ctx.restore();
  }

  _drawCannon(h) {
    const ctx = this.ctx;
    const { x: px, y: py } = this.cellCenter(h.x, h.y);
    const img = this.atlas.get("cannon", GLYPHS.cannon, this.cell);
    ctx.drawImage(img, px - this.cell / 2, py - this.cell / 2);
    // Pulse ring when about to fire.
    const nextIn = (h.period - ((this.board.tickN + h.phase) % h.period)) % h.period;
    if (nextIn <= 1) {
      ctx.strokeStyle = "rgba(255, 90, 90, 0.55)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py, this.cell * 0.45, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  _drawWarpPair(h) {
    const ctx = this.ctx;
    const a = this.cellCenter(h.x, h.y);
    const b = this.cellCenter(h.pairX, h.pairY);
    const img = this.atlas.get("warp", GLYPHS.warp_a, this.cell);
    ctx.save();
    const pulse = 0.85 + 0.15 * Math.sin(performance.now() / 200);
    ctx.globalAlpha = pulse;
    ctx.drawImage(img, a.x - this.cell / 2, a.y - this.cell / 2);
    ctx.drawImage(img, b.x - this.cell / 2, b.y - this.cell / 2);
    ctx.restore();
    ctx.strokeStyle = "rgba(180,139,255,0.3)";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);
  }

  _drawTreasure(h) {
    const ctx = this.ctx;
    const { x: px, y: py } = this.cellCenter(h.x, h.y);
    const img = this.atlas.get("treasure", GLYPHS.treasure, this.cell);
    ctx.drawImage(img, px - this.cell / 2, py - this.cell / 2);
    // dots indicating visits required
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = i < h.visits ? "#f5cf4e" : "rgba(255,255,255,0.3)";
      ctx.beginPath();
      ctx.arc(px - 8 + i * 16, py + this.cell * 0.38, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawGlyph(cx, cy, key, glyph) {
    const ctx = this.ctx;
    const { x: px, y: py } = this.cellCenter(cx, cy);
    const img = this.atlas.get(key, glyph, this.cell);
    ctx.drawImage(img, px - this.cell / 2, py - this.cell / 2);
  }

  drawGems() {
    const ctx = this.ctx;
    for (const g of this.board.gems) {
      if (g.taken) continue;
      const { x: px, y: py } = this.cellCenter(g.x, g.y);
      const bob = Math.sin(performance.now() / 260 + g.x + g.y) * 3;
      const img = this.atlas.get("gem", GLYPHS.gem, this.cell);
      ctx.drawImage(img, px - this.cell / 2, py - this.cell / 2 + bob);
    }
  }

  drawGoal() {
    const glyph = WORLD_GOAL[this.board.world] || GLYPHS.goal_r;
    const img = this.atlas.get(`goal_${this.board.world}`, glyph, this.cell);
    const { x: px, y: py } = this.cellCenter(this.board.goal.x, this.board.goal.y);
    const ctx = this.ctx;
    ctx.save();
    const pulse = 0.9 + 0.1 * Math.sin(performance.now() / 300);
    ctx.globalAlpha = pulse;
    ctx.drawImage(img, px - this.cell / 2, py - this.cell / 2);
    ctx.restore();
  }

  drawHover() {
    if (!this.hoverCell || !this.dragDir) return;
    const ctx = this.ctx;
    const { x: px, y: py } = this.cellCenter(this.hoverCell.x, this.hoverCell.y);
    const canPlace = this.board.canPlaceArrow(this.hoverCell.x, this.hoverCell.y);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = canPlace ? "rgba(106,197,255,0.35)" : "rgba(255,80,80,0.4)";
    ctx.fillRect(this.offsetX + this.hoverCell.x * this.cell, this.offsetY + this.hoverCell.y * this.cell, this.cell, this.cell);
    if (canPlace) {
      const img = this.atlas.get(`arrow_${this.dragDir}`, GLYPHS[`arrow_${this.dragDir}`], this.cell);
      ctx.globalAlpha = 0.7;
      ctx.drawImage(img, px - this.cell / 2, py - this.cell / 2);
    }
    ctx.restore();
  }

  drawCannonBeams() {
    const ctx = this.ctx;
    for (const beam of this.cannonBeams) {
      const t = 1 - beam.age / beam.life;
      ctx.fillStyle = `rgba(255, 120, 120, ${0.6 * t})`;
      for (const c of beam.cells) {
        ctx.fillRect(this.offsetX + c.x * this.cell + 4, this.offsetY + c.y * this.cell + 4, this.cell - 8, this.cell - 8);
      }
    }
  }

  drawUnit() {
    const ctx = this.ctx;
    const u = this.board.unit;
    let ux = u.x, uy = u.y;
    if (this.runAnim) {
      const t = Math.min(1, this.runAnim.t / this.runAnim.dur);
      const ease = 1 - Math.pow(1 - t, 2);
      ux = this.runAnim.fromX + (this.runAnim.toX - this.runAnim.fromX) * ease;
      uy = this.runAnim.fromY + (this.runAnim.toY - this.runAnim.fromY) * ease;
    }
    const px = this.offsetX + ux * this.cell + this.cell / 2;
    const py = this.offsetY + uy * this.cell + this.cell / 2;
    const glyph = WORLD_UNITS[this.board.world] || GLYPHS.robot;
    const img = this.atlas.get(`unit_${this.board.world}`, glyph, this.cell);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(DIR_ANGLE[u.dir] || 0);
    const bob = u.alive && !u.won ? Math.sin(performance.now() / 140) * 2 : 0;
    ctx.drawImage(img, -this.cell / 2, -this.cell / 2 + bob);
    ctx.restore();
  }
}

