// Factory: hydrate level JSON into Board instances with live hazard Strategy objects.

import { Board } from "./board.js";
import { HAZARD_FACTORY } from "./hazards.js";

export async function loadLevels(url = "./levels.json") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load levels: ${res.status}`);
  const data = await res.json();
  return data.levels;
}

export function createLevel(def) {
  const hydrated = {
    ...def,
    hazards: (def.hazards || []).map(h => {
      const make = HAZARD_FACTORY[h.type];
      if (!make) throw new Error(`unknown hazard: ${h.type}`);
      return make(h);
    }),
  };
  return new Board(hydrated);
}

// Deterministic daily puzzle generator. Seeded RNG, picks a random level template
// from the available pool and tweaks gem/hazard positions.
export function createDaily(templates, dateKey) {
  const seed = hashStr(dateKey);
  const rng = mulberry32(seed);
  const pool = templates.filter(t => t.world >= 2);
  const base = pool[Math.floor(rng() * pool.length)];
  // Shuffle gems a bit for variety.
  const tweaked = JSON.parse(JSON.stringify(base));
  tweaked.id = `daily-${dateKey}`;
  tweaked.title = `Daily · ${dateKey}`;
  if (tweaked.gems && tweaked.gems.length) {
    for (const g of tweaked.gems) {
      if (rng() < 0.5) {
        const nx = Math.min(tweaked.cols - 1, Math.max(0, g.x + (rng() < 0.5 ? -1 : 1)));
        const ny = Math.min(tweaked.rows - 1, Math.max(0, g.y + (rng() < 0.5 ? -1 : 1)));
        if (!(nx === tweaked.start.x && ny === tweaked.start.y) &&
            !(nx === tweaked.goal.x && ny === tweaked.goal.y)) {
          g.x = nx; g.y = ny;
        }
      }
    }
  }
  return createLevel(tweaked);
}

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
