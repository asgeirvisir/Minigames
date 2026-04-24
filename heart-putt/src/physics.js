// Tiny 2D physics for a circular ball against AABB walls and circular zones.

export const FRICTION = 0.985;      // per 60Hz tick
export const SILENCE_FRICTION = 0.90;
export const STOP_SPEED = 6;        // px/sec
export const WALL_RESTITUTION = 0.72;
export const MAX_STEP = 8;          // px per sub-step to avoid tunneling
export const PHONE_PULL = 360;      // acceleration (px/sec^2) toward phone

export function stepBall(ball, walls, zones, dt, bounds) {
  // Silence zones sticky, phone zones pull, ex zones are solid circular walls.
  let friction = FRICTION;
  for (const z of zones) {
    if (z.kind === "silence" && circleHit(ball, z)) {
      friction = Math.min(friction, SILENCE_FRICTION);
    }
    if (z.kind === "phone" && circleHit(ball, z)) {
      const dx = z.x - ball.x, dy = z.y - ball.y;
      const d = Math.hypot(dx, dy) || 1;
      const a = PHONE_PULL * dt;
      ball.vx += (dx / d) * a;
      ball.vy += (dy / d) * a;
    }
  }

  // Substep integration to avoid wall tunneling.
  const speed = Math.hypot(ball.vx, ball.vy);
  const steps = Math.max(1, Math.ceil(speed * dt / MAX_STEP));
  const sub = dt / steps;
  for (let i = 0; i < steps; i++) {
    ball.x += ball.vx * sub;
    ball.y += ball.vy * sub;
    for (const w of walls) resolveWallCollision(ball, w);
    for (const z of zones) {
      if (z.kind === "ex") resolveCircleObstacle(ball, z);
    }
    resolveBoundsCollision(ball, bounds);
  }

  // Apply friction (at 60Hz cadence regardless of actual dt).
  const f = Math.pow(friction, dt * 60);
  ball.vx *= f;
  ball.vy *= f;

  // Stop when very slow.
  if (Math.hypot(ball.vx, ball.vy) < STOP_SPEED) { ball.vx = 0; ball.vy = 0; }
}

function resolveCircleObstacle(ball, z) {
  const dx = ball.x - z.x;
  const dy = ball.y - z.y;
  const d2 = dx * dx + dy * dy;
  const R = z.r + ball.r;
  if (d2 >= R * R) return;
  const d = Math.sqrt(d2) || 1;
  const nx = dx / d, ny = dy / d;
  const pen = R - d;
  ball.x += nx * pen;
  ball.y += ny * pen;
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) {
    ball.vx -= (1 + 0.85) * vn * nx;
    ball.vy -= (1 + 0.85) * vn * ny;
  }
}

export function circleHit(ball, zone) {
  const dx = ball.x - zone.x, dy = ball.y - zone.y;
  return dx * dx + dy * dy <= (ball.r + zone.r) * (ball.r + zone.r);
}

function resolveWallCollision(ball, w) {
  // Closest point on AABB to ball center.
  const cx = clamp(ball.x, w.x, w.x + w.w);
  const cy = clamp(ball.y, w.y, w.y + w.h);
  const dx = ball.x - cx;
  const dy = ball.y - cy;
  const d2 = dx * dx + dy * dy;
  const r = ball.r;
  if (d2 >= r * r) return;
  let nx, ny, pen;
  if (d2 === 0) {
    // Ball center inside the rect — push out along shortest axis.
    const left = ball.x - w.x;
    const right = (w.x + w.w) - ball.x;
    const top = ball.y - w.y;
    const bot = (w.y + w.h) - ball.y;
    const m = Math.min(left, right, top, bot);
    if (m === left) { nx = -1; ny = 0; pen = left + r; }
    else if (m === right) { nx = 1; ny = 0; pen = right + r; }
    else if (m === top) { nx = 0; ny = -1; pen = top + r; }
    else { nx = 0; ny = 1; pen = bot + r; }
  } else {
    const d = Math.sqrt(d2);
    nx = dx / d; ny = dy / d;
    pen = r - d;
  }
  ball.x += nx * pen;
  ball.y += ny * pen;
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) {
    ball.vx -= (1 + WALL_RESTITUTION) * vn * nx;
    ball.vy -= (1 + WALL_RESTITUTION) * vn * ny;
  }
}

function resolveBoundsCollision(ball, b) {
  if (ball.x - ball.r < b.x) { ball.x = b.x + ball.r; if (ball.vx < 0) ball.vx = -ball.vx * WALL_RESTITUTION; }
  if (ball.x + ball.r > b.x + b.w) { ball.x = b.x + b.w - ball.r; if (ball.vx > 0) ball.vx = -ball.vx * WALL_RESTITUTION; }
  if (ball.y - ball.r < b.y) { ball.y = b.y + ball.r; if (ball.vy < 0) ball.vy = -ball.vy * WALL_RESTITUTION; }
  if (ball.y + ball.r > b.y + b.h) { ball.y = b.y + b.h - ball.r; if (ball.vy > 0) ball.vy = -ball.vy * WALL_RESTITUTION; }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
