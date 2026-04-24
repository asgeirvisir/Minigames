// Strategy pattern: each hazard implements tick() and optional collidesWith / onEnter.
// The Board engine calls hazards in a known order each tick.

const DIR_VEC = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
};

class Hazard {
  constructor(def) { Object.assign(this, def); }
  tick(_board) {}
  occupiesCell(_x, _y) { return false; }
  onEnter(_board, _unit) { return null; } // returns { kind, ... } or null
}

export class Asteroid extends Hazard {
  constructor(def) {
    super(def);
    this.patrolIdx = 0;
    this.moving = Array.isArray(def.patrol) && def.patrol.length > 1;
  }
  tick(_board) {
    if (!this.moving) return;
    this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length;
    const p = this.patrol[this.patrolIdx];
    this.x = p.x; this.y = p.y;
  }
  occupiesCell(x, y) { return this.x === x && this.y === y; }
  onEnter(_board, unit) {
    if (this.x === unit.x && this.y === unit.y) return { kind: "crash", reason: "asteroid" };
    return null;
  }
}

export class Warp extends Hazard {
  onEnter(_board, unit) {
    if (unit.justWarped) return null; // don't bounce back immediately
    if (this.x === unit.x && this.y === unit.y) {
      return { kind: "warp", toX: this.pairX, toY: this.pairY };
    }
    if (this.pairX === unit.x && this.pairY === unit.y) {
      return { kind: "warp", toX: this.x, toY: this.y };
    }
    return null;
  }
}

export class Wind extends Hazard {
  onEnter(_board, unit) {
    if (this.x === unit.x && this.y === unit.y) {
      return { kind: "wind", dir: this.dir };
    }
    return null;
  }
}

export class Cannon extends Hazard {
  // Fires a beam in `dir` every `period` ticks (when (tick + phase) % period === 0).
  // Beam covers the entire row/col from origin until out of bounds — lethal on that tick only.
  constructor(def) {
    super(def);
    this.phase = def.phase ?? 0;
    this.period = def.period ?? 3;
  }
  isFiringAt(tickN) {
    return (tickN + this.phase) % this.period === 0;
  }
  beamCells(board) {
    const v = DIR_VEC[this.dir];
    const cells = [];
    let x = this.x + v.dx, y = this.y + v.dy;
    while (x >= 0 && y >= 0 && x < board.cols && y < board.rows) {
      cells.push({ x, y });
      x += v.dx; y += v.dy;
    }
    return cells;
  }
  onEnter(board, unit) {
    if (!this.isFiringAt(board.tickN)) return null;
    const hit = this.beamCells(board).some(c => c.x === unit.x && c.y === unit.y);
    if (hit) return { kind: "crash", reason: "cannon" };
    return null;
  }
}

export class Treasure extends Hazard {
  // Visited twice = collected. Player must route through it twice.
  constructor(def) { super(def); this.visits = 0; }
  reset() { this.visits = 0; }
  onEnter(_board, unit) {
    if (this.x === unit.x && this.y === unit.y) {
      this.visits++;
      if (this.visits >= 2) return { kind: "treasure-done" };
      return { kind: "treasure-visit" };
    }
    return null;
  }
}

export const HAZARD_FACTORY = {
  asteroid: (d) => new Asteroid(d),
  warp: (d) => new Warp(d),
  wind: (d) => new Wind(d),
  cannon: (d) => new Cannon(d),
  treasure: (d) => new Treasure(d),
};
