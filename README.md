# Course Plotter

A tiny browser puzzle game: drop a budget of directional arrows onto a grid, press **Run**, and watch your unit follow the course from start to goal — picking up gems, dodging asteroids, warping, riding wind, and ducking cannon fire. Three worlds, 15 levels, one verb.

## Play

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

No build step, no dependencies.

## Worlds

1. **Workshop** 🤖 — learn the grammar with plain arrows.
2. **Nebula** 🚀 — asteroids (static, then moving) and warp pairs.
3. **High Seas** 🏴‍☠️ — wind tiles, timed cannons, revisit-treasure routing.

## Controls

- **Drag** an arrow tile from the right tray onto the grid.
- **Click** a placed arrow to remove it.
- **Space** / ▶ Run  ·  **R** Retry  ·  **Z** Undo  ·  **M** Mute  ·  **N** Next
- **☰** opens the level map. Progress auto-saves per device.

## Stars

- ★ Completed the level.
- ★★ Completed + all gems collected.
- ★★★ Completed + all gems + used ≤ par arrows.

Consecutive 3-stars build your 🔥 streak. Finishing L15 unlocks a 🌟 Daily Puzzle seeded by date — the same puzzle for everyone, every day.

## Code layout

```
index.html
style.css
levels.json
src/
  main.js       bootstrap + game loop + input
  state.js      state machine (PLACING/RUNNING/…)
  board.js      grid model + tick simulation
  commands.js   place/remove/clear + undo stack
  events.js     EventBus
  hazards.js    Strategy per hazard type
  levels.js     JSON → Board factory + daily
  render.js     Canvas2D + sprite-atlas Flyweight
  juice.js      shake, particles, WebAudio blips
  storage.js    localStorage progress
```
