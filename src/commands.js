// Command pattern for placements. Each command has do/undo. Powers Undo + Clear.

export class PlaceArrowCommand {
  constructor(board, x, y, dir) { this.board = board; this.x = x; this.y = y; this.dir = dir; this.prev = null; }
  do() {
    this.prev = this.board.arrowAt(this.x, this.y);
    if (this.prev) this.board.removeArrow(this.x, this.y);
    return this.board.placeArrow(this.x, this.y, this.dir);
  }
  undo() {
    this.board.removeArrow(this.x, this.y);
    if (this.prev) this.board.placeArrow(this.x, this.y, this.prev);
  }
}

export class RemoveArrowCommand {
  constructor(board, x, y) { this.board = board; this.x = x; this.y = y; this.prev = null; }
  do() {
    this.prev = this.board.arrowAt(this.x, this.y);
    if (!this.prev) return false;
    this.board.removeArrow(this.x, this.y);
    return true;
  }
  undo() {
    if (this.prev) this.board.placeArrow(this.x, this.y, this.prev);
  }
}

export class ClearCommand {
  constructor(board) { this.board = board; this.snapshot = []; }
  do() {
    this.snapshot = [];
    for (const [k, dir] of this.board.placedArrows.entries()) {
      const [x, y] = k.split(",").map(Number);
      this.snapshot.push({ x, y, dir });
    }
    for (const s of this.snapshot) this.board.removeArrow(s.x, s.y);
    return this.snapshot.length > 0;
  }
  undo() {
    for (const s of this.snapshot) this.board.placeArrow(s.x, s.y, s.dir);
  }
}

export class CommandHistory {
  constructor(limit = 64) { this.stack = []; this.limit = limit; }
  execute(cmd) {
    const ok = cmd.do();
    if (!ok) return false;
    this.stack.push(cmd);
    if (this.stack.length > this.limit) this.stack.shift();
    return true;
  }
  undo() {
    const cmd = this.stack.pop();
    if (!cmd) return false;
    cmd.undo();
    return true;
  }
  clear() { this.stack = []; }
}
