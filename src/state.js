// State Machine for game phases. Phases gate input and drive the RAF loop.
// PLACING -> RUNNING -> RESOLVE -> WIN/FAIL -> PLACING

import { bus, EVENTS } from "./events.js";

export const PHASE = Object.freeze({
  PLACING: "PLACING",
  RUNNING: "RUNNING",
  RESOLVE: "RESOLVE",
  WIN: "WIN",
  FAIL: "FAIL",
});

const ALLOWED = {
  PLACING: new Set(["RUNNING"]),
  RUNNING: new Set(["RESOLVE", "PLACING"]),
  RESOLVE: new Set(["WIN", "FAIL"]),
  WIN: new Set(["PLACING"]),
  FAIL: new Set(["PLACING"]),
};

export class StateMachine {
  constructor() {
    this.phase = PHASE.PLACING;
  }
  can(next) { return ALLOWED[this.phase]?.has(next); }
  transition(next) {
    if (!this.can(next)) {
      console.warn(`bad transition ${this.phase} -> ${next}`);
      return false;
    }
    const prev = this.phase;
    this.phase = next;
    bus.emit(EVENTS.PHASE_CHANGED, { from: prev, to: next });
    return true;
  }
  is(p) { return this.phase === p; }
}
