// Grid model + tick-based pathing simulation.
// Arrows placed by the player set direction on entry.
// Tick order: hazards tick -> unit steps forward -> resolve cell effects.

import { bus, EVENTS } from "./events.js";

const DIR_VEC = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
};

const MAX_TICKS = 120; // prevent infinite loops

export class Board {
  constructor(level) {
    this.id = level.id;
    this.world = level.world;
    this.cols = level.cols;
    this.rows = level.rows;
    this.startDef = { ...level.start };
    this.goal = { ...level.goal };
    this.gemDefs = (level.gems || []).map(g => ({ ...g }));
    this.hazards = level.hazards || [];
    this.par = level.par ?? 0;
    this.budget = level.budget || {};
    this.title = level.title || `Level ${level.id}`;
    this.placedArrows = new Map(); // "x,y" -> dir
    this.resetRuntime();
  }

  key(x, y) { return `${x},${y}`; }

  resetRuntime() {
    this.tickN = 0;
    this.unit = {
      x: this.startDef.x, y: this.startDef.y, dir: this.startDef.dir,
      alive: true, won: false, justWarped: false,
      forcedNext: null, // {dir} from wind
    };
    this.gems = this.gemDefs.map(g => ({ x: g.x, y: g.y, taken: false }));
    for (const h of this.hazards) if (typeof h.reset === "function") h.reset();
    // restore patrol asteroids to initial
    for (const h of this.hazards) {
      if (h.patrol && h.patrol.length > 0) {
        h.patrolIdx = 0;
        h.x = h.patrol[0].x;
        h.y = h.patrol[0].y;
      }
    }
    this.crashReason = null;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  // Check if a cell can accept a player-placed arrow.
  canPlaceArrow(x, y) {
    if (!this.inBounds(x, y)) return false;
    if (x === this.startDef.x && y === this.startDef.y) return false;
    if (x === this.goal.x && y === this.goal.y) return false;
    for (const h of this.hazards) {
      if (h.x === x && h.y === y) return false;
      if (h.pairX === x && h.pairY === y) return false;
    }
    return true;
  }

  arrowAt(x, y) {
    return this.placedArrows.get(this.key(x, y)) || null;
  }

  placeArrow(x, y, dir) {
    if (!this.canPlaceArrow(x, y)) return false;
    this.placedArrows.set(this.key(x, y), dir);
    bus.emit(EVENTS.TILE_PLACED, { x, y, dir });
    return true;
  }

  removeArrow(x, y) {
    const k = this.key(x, y);
    const prev = this.placedArrows.get(k);
    if (!prev) return null;
    this.placedArrows.delete(k);
    bus.emit(EVENTS.TILE_REMOVED, { x, y, dir: prev });
    return prev;
  }

  arrowsByDir() {
    const counts = { N: 0, E: 0, S: 0, W: 0 };
    for (const dir of this.placedArrows.values()) counts[dir]++;
    return counts;
  }

  remainingBudget() {
    const used = this.arrowsByDir();
    const rem = {};
    for (const d of ["N","E","S","W"]) rem[d] = Math.max(0, (this.budget[d] ?? 0) - (used[d] ?? 0));
    return rem;
  }

  totalPlaced() { return this.placedArrows.size; }

  // Advance one simulation tick. Returns a status string.
  //   "running" | "won" | "crashed" | "timeout"
  step() {
    if (!this.unit.alive || this.unit.won) return this.unit.won ? "won" : "crashed";
    if (this.tickN >= MAX_TICKS) return "timeout";

    this.tickN++;

    // 1) Hazards tick first (moving asteroids relocate).
    for (const h of this.hazards) h.tick(this);

    // 2) Determine direction for this step.
    let dir = this.unit.forcedNext || this.unit.dir;
    this.unit.forcedNext = null;

    // 3) Move unit forward.
    const v = DIR_VEC[dir];
    const nx = this.unit.x + v.dx;
    const ny = this.unit.y + v.dy;
    if (!this.inBounds(nx, ny)) {
      this.unit.alive = false;
      this.crashReason = "offgrid";
      bus.emit(EVENTS.UNIT_CRASHED, { reason: "offgrid" });
      return "crashed";
    }
    this.unit.x = nx; this.unit.y = ny; this.unit.dir = dir;
    this.unit.justWarped = false;
    bus.emit(EVENTS.UNIT_MOVED, { x: nx, y: ny, dir });

    // 4) Resolve cell effects in order: hazards (asteroid crash, cannon beam, wind, warp), gems, arrows, goal.
    for (const h of this.hazards) {
      if (h.occupiesCell && h.occupiesCell(nx, ny)) {
        this.unit.alive = false;
        this.crashReason = "asteroid";
        bus.emit(EVENTS.UNIT_CRASHED, { reason: "asteroid" });
        return "crashed";
      }
    }
    for (const h of this.hazards) {
      const r = h.onEnter ? h.onEnter(this, this.unit) : null;
      if (!r) continue;
      if (r.kind === "crash") {
        this.unit.alive = false;
        this.crashReason = r.reason;
        bus.emit(EVENTS.UNIT_CRASHED, { reason: r.reason });
        return "crashed";
      }
      if (r.kind === "warp") {
        this.unit.x = r.toX; this.unit.y = r.toY;
        this.unit.justWarped = true;
        bus.emit(EVENTS.UNIT_WARPED, { x: r.toX, y: r.toY });
      }
      if (r.kind === "wind") {
        this.unit.forcedNext = r.dir;
      }
      if (r.kind === "treasure-visit" || r.kind === "treasure-done") {
        bus.emit(EVENTS.TREASURE_HIT, { x: h.x, y: h.y, done: r.kind === "treasure-done" });
      }
    }

    // Gems
    for (const g of this.gems) {
      if (!g.taken && g.x === this.unit.x && g.y === this.unit.y) {
        g.taken = true;
        bus.emit(EVENTS.GEM_COLLECTED, { x: g.x, y: g.y });
      }
    }

    // Arrows rotate the unit.
    const arrow = this.arrowAt(this.unit.x, this.unit.y);
    if (arrow && arrow !== this.unit.dir) {
      this.unit.dir = arrow;
      bus.emit(EVENTS.UNIT_TURNED, { dir: arrow });
    }

    // Goal check last — requires visiting goal cell.
    if (this.unit.x === this.goal.x && this.unit.y === this.goal.y) {
      // If a treasure exists and isn't done, this is NOT a win yet (pass-through).
      const pendingTreasure = this.hazards.find(h => h.visits !== undefined && h.visits < 2);
      if (!pendingTreasure) {
        this.unit.won = true;
        return "won";
      }
    }

    return "running";
  }

  allGemsCollected() {
    return this.gems.every(g => g.taken);
  }

  computeStars() {
    // 3 stars: won, all gems, arrows <= par
    // 2 stars: won + (all gems OR par met)
    // 1 star: won only
    if (!this.unit.won) return 0;
    const allGems = this.allGemsCollected();
    const parMet = this.totalPlaced() <= this.par;
    if (allGems && parMet) return 3;
    if (allGems || parMet) return 2;
    return 1;
  }
}
