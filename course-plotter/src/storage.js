// localStorage-backed progression: stars, streak, daily completion.
// Autosave keeps progress sticky (Zeigarnik) — closing the tab never loses work.

const KEY = "courseplotter.v1";

const defaults = () => ({
  stars: {},          // { [levelId]: 0..3 }
  streak: 0,
  bestStreak: 0,
  currentLevel: 1,
  lastDaily: null,    // "YYYY-MM-DD"
  dailyStars: {},
  unlockedWorlds: [1],
  muted: false,
  plays: 0,
});

export class Progress {
  constructor() {
    this.data = defaults();
    this._load();
  }
  _load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...defaults(), ...JSON.parse(raw) };
    } catch (_) { /* ignore */ }
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); }
    catch (_) { /* private mode, quota full, etc. */ }
  }
  starsFor(id) { return this.data.stars[id] || 0; }
  recordStars(id, stars, levelIndex) {
    const prev = this.data.stars[id] || 0;
    this.data.stars[id] = Math.max(prev, stars);
    // streak only advances on a fresh 3-star (not a replay re-3-star).
    if (stars === 3 && prev < 3) {
      this.data.streak += 1;
      this.data.bestStreak = Math.max(this.data.bestStreak, this.data.streak);
    } else if (stars < 3) {
      this.data.streak = 0;
    }
    if (levelIndex != null) {
      this.data.currentLevel = Math.max(this.data.currentLevel, levelIndex + 2);
    }
    this.data.plays += 1;
    this.save();
  }
  isLevelUnlocked(index, levelsCount) {
    if (index === 0) return true;
    if (index >= levelsCount) return false;
    // Must have earned at least 1 star on the previous level.
    const prevId = this.data._idOrder?.[index - 1];
    if (prevId == null) return index < this.data.currentLevel;
    return (this.data.stars[prevId] || 0) >= 1;
  }
  setIdOrder(ids) { this.data._idOrder = ids; }
  setMuted(m) { this.data.muted = m; this.save(); }
  getMuted() { return !!this.data.muted; }

  getStreak() { return this.data.streak; }
  getBestStreak() { return this.data.bestStreak; }

  todayKey() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }
  dailyDone() { return this.data.lastDaily === this.todayKey(); }
  recordDaily(stars) {
    const k = this.todayKey();
    this.data.lastDaily = k;
    this.data.dailyStars[k] = Math.max(this.data.dailyStars[k] || 0, stars);
    this.save();
  }

  dailyUnlocked(levels) {
    const last = levels[levels.length - 1];
    return (this.data.stars[last.id] || 0) >= 1;
  }

  totalStars() {
    return Object.values(this.data.stars).reduce((a, b) => a + b, 0);
  }
}
