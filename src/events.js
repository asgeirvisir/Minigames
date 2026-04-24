// Tiny Observer / EventBus. Any module publishes; any module subscribes.
// Keeps juice, scoring, and storage decoupled from core simulation.

class EventBus {
  constructor() {
    this.listeners = new Map();
  }
  on(event, fn) {
    let set = this.listeners.get(event);
    if (!set) { set = new Set(); this.listeners.set(event, set); }
    set.add(fn);
    return () => set.delete(fn);
  }
  emit(event, payload) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); } catch (e) { console.error("bus handler", event, e); }
    }
  }
}

export const bus = new EventBus();

export const EVENTS = Object.freeze({
  PHASE_CHANGED: "phase:changed",
  TILE_PLACED: "tile:placed",
  TILE_REMOVED: "tile:removed",
  UNIT_MOVED: "unit:moved",
  UNIT_TURNED: "unit:turned",
  UNIT_WARPED: "unit:warped",
  UNIT_CRASHED: "unit:crashed",
  GEM_COLLECTED: "gem:collected",
  TREASURE_HIT: "treasure:hit",
  CANNON_FIRED: "cannon:fired",
  LEVEL_WON: "level:won",
  LEVEL_FAILED: "level:failed",
  STARS_AWARDED: "stars:awarded",
  STREAK_UPDATED: "streak:updated",
  WORLD_CHANGED: "world:changed",
});
