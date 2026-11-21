// The screenshot scenes behind ?shot=start|play|alert|end|win. Each one plays
// the real rules forward from a fresh world, steered by an autopilot, so the
// frame is what a short game really looks like and the same seed always
// gives the same frame. Both pilots navigate with a grid BFS that routes
// around walls and cover; the careful one also prices cells a guard can
// currently see, waits out a cone when it can, and crouches when half-seen,
// while the careless one walks the shortest route straight into the cones,
// as a hurried player does, and gets caught.
import { FIELD, LEVELS, PLAYER, STEP } from './config.js';
import { EVENT_CAUGHT, EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 24;
const LIMIT_SECONDS = 600;
/** Grid cell size for the pilot's pathfinding, in field pixels. */
const CELL = 32;
const COLS = Math.ceil(FIELD.width / CELL);
const ROWS = Math.ceil(FIELD.height / CELL);
/** Replan the route this often, in steps, so it follows moving cones. */
const REPLAN_STEPS = 90;
/** How long the careful pilot waits out a watched corridor before pushing on. */
const MAX_WAIT_SECONDS = 5;

function circleHitsRect(x, y, radius, r) {
  const cx = Math.max(r.x, Math.min(x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(y, r.y + r.h));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < radius * radius;
}

function cellFree(state, col, row, blockers) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  const x = col * CELL + CELL / 2;
  const y = row * CELL + CELL / 2;
  if (x < PLAYER.radius || x > FIELD.width - PLAYER.radius) return false;
  if (y < PLAYER.radius || y > FIELD.height - PLAYER.radius) return false;
  for (let i = 0; i < blockers.length; i += 1) {
    if (circleHitsRect(x, y, PLAYER.radius, blockers[i])) return false;
  }
  return true;
}

function currentTarget(state) {
  let best = null;
  let bestDist = Infinity;
  for (const relic of state.relics) {
    if (relic.taken) continue;
    const dx = relic.x - state.player.x;
    const dy = relic.y - state.player.y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = relic;
    }
  }
  if (best !== null) return best;
  const exit = LEVELS[state.level].exit;
  return { x: exit.x + exit.w / 2, y: exit.y + exit.h / 2 };
}

/**
 * Breadth-first route from the player to the target over free cells.
 * The careful pilot pays extra for cells a guard can see right now, so
 * the route prefers shadow and cover; the careless one pays nothing.
 */
function findPath(world, careful) {
  const state = world.state;
  const target = currentTarget(state);
  const startCol = Math.floor(state.player.x / CELL);
  const startRow = Math.floor(state.player.y / CELL);
  const goalCol = Math.floor(target.x / CELL);
  const goalRow = Math.floor(target.y / CELL);
  const level = LEVELS[state.level];
  const blockers = level.walls.concat(level.cover);
  if (!cellFree(state, goalCol, goalRow, blockers)) return null;
  const key = (c, r) => r * COLS + c;
  const cost = new Map();
  const prev = new Map();
  const visited = new Set();
  const queue = [[startCol, startRow]];
  cost.set(key(startCol, startRow), 0);
  visited.add(key(startCol, startRow));
  const seenCache = new Map();
  const seenCost = (c, r) => {
    if (!careful) return 0;
    const k = r * COLS + c;
    if (seenCache.has(k)) return seenCache.get(k);
    const x = c * CELL + CELL / 2;
    const y = r * CELL + CELL / 2;
    const value = world.seesPlayerAt(x, y) ? 8 : 0;
    seenCache.set(k, value);
    return value;
  };
  while (queue.length > 0) {
    const [col, row] = queue.shift();
    if (col === goalCol && row === goalRow) break;
    const here = cost.get(key(col, row));
    const neighbours = [
      [col + 1, row],
      [col - 1, row],
      [col, row + 1],
      [col, row - 1],
      [col + 1, row + 1],
      [col + 1, row - 1],
      [col - 1, row + 1],
      [col - 1, row - 1],
    ];
    for (const [nc, nr] of neighbours) {
      if (!cellFree(state, nc, nr, blockers)) continue;
      // No cutting corners through a wall.
      if (nc !== col && nr !== row && (!cellFree(state, nc, row, blockers) || !cellFree(state, col, nr, blockers))) continue;
      const next = here + 1 + seenCost(nc, nr);
      const k = key(nc, nr);
      if (visited.has(k)) continue;
      visited.add(k);
      cost.set(k, next);
      prev.set(k, key(col, row));
      queue.push([nc, nr]);
    }
  }
  if (!cost.has(key(goalCol, goalRow))) return null;
  const path = [];
  let k = key(goalCol, goalRow);
  while (k !== key(startCol, startRow)) {
    const col = k % COLS;
    const row = Math.floor(k / COLS);
    path.unshift({ x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 });
    k = prev.get(k);
  }
  return path;
}

/** Put the player where the nearest guard is looking, so the alarm goes up through the real rules. */
function stageAlarm(world, memory) {
  const state = world.state;
  let guard = null;
  let guardDist = Infinity;
  for (const g of state.guards) {
    if (g.kind === 'sentry') continue;
    const dx = g.x - state.player.x;
    const dy = g.y - state.player.y;
    const d = dx * dx + dy * dy;
    if (d < guardDist) {
      guardDist = d;
      guard = g;
    }
  }
  if (guard === null) return false;
  const level = LEVELS[state.level];
  const blockers = level.walls.concat(level.cover);
  for (const offset of [90, 70, 120, 50]) {
    const x = guard.x + Math.cos(guard.angle) * offset;
    const y = guard.y + Math.sin(guard.angle) * offset;
    let free = x > PLAYER.radius && x < FIELD.width - PLAYER.radius && y > PLAYER.radius && y < FIELD.height - PLAYER.radius;
    if (free) {
      for (const r of blockers) {
        if (circleHitsRect(x, y, PLAYER.radius, r)) {
          free = false;
          break;
        }
      }
    }
    if (free && world.guardSees(guard, x, y)) {
      state.player.x = x;
      state.player.y = y;
      return true;
    }
  }
  return false;
}

function planPilot(world, memory, careful) {
  const state = world.state;
  const target = currentTarget(state);
  const targetKey = `${state.level}:${target.x},${target.y}`;
  memory.steps = (memory.steps ?? 0) + 1;
  if (
    memory.path === null ||
    memory.targetKey !== targetKey ||
    memory.steps >= REPLAN_STEPS
  ) {
    memory.path = findPath(world, careful);
    memory.targetKey = targetKey;
    memory.steps = 0;
    memory.wait = 0;
  }
  const player = state.player;
  if (memory.path === null || memory.path.length === 0) {
    // No route (should not happen): walk straight at the target.
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const len = Math.hypot(dx, dy) || 1;
    return { dx: dx / len, dy: dy / len, run: false, crouch: careful && state.detection > 5 };
  }
  while (memory.path.length > 0) {
    const next = memory.path[0];
    if (Math.hypot(next.x - player.x, next.y - player.y) < 14) {
      memory.path.shift();
      continue;
    }
    break;
  }
  if (memory.path.length === 0) {
    return { dx: 0, dy: 0, run: false, crouch: false };
  }
  const next = memory.path[0];
  if (careful) {
    const hereSeen = world.seesPlayerAt(player.x, player.y);
    const nextSeen = world.seesPlayerAt(next.x, next.y);
    if (nextSeen && !hereSeen && state.detection < 40) {
      memory.wait = (memory.wait ?? 0) + STEP;
      if (memory.wait < MAX_WAIT_SECONDS) {
        return { dx: 0, dy: 0, run: false, crouch: state.detection > 5 };
      }
    } else {
      memory.wait = 0;
    }
  }
  const dx = next.x - player.x;
  const dy = next.y - player.y;
  const len = Math.hypot(dx, dy) || 1;
  return { dx: dx / len, dy: dy / len, run: false, crouch: careful && state.detection > 5 };
}

/**
 * Set `world` to the named scene (start, play, alert, end or win; any other
 * name is start) and return the screen to draw over it, the best score to
 * show, and an optional banner line.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'alert' && name !== 'end' && name !== 'win') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, { dx: 0, dy: 0, run: false, crouch: false }, null, true);
    }
    return { screen: SCREEN_TITLE, best: 0, extra: '' };
  }

  const memory = { path: null, targetKey: '', steps: 0, wait: 0 };
  if (name === 'play') {
    for (let index = 0; index < PLAY_SECONDS / STEP; index += 1) {
      const events = world.step(STEP, planPilot(world, memory, true), null, false);
      if (events & EVENT_OVER) break;
    }
    return { screen: SCREEN_PLAY, best: world.state.score, extra: '' };
  }
  if (name === 'alert') {
    // Play a few careful seconds for a natural position, then step into
    // the nearest guard's cone: the alarm goes up through the real rules.
    for (let index = 0; index < 6 / STEP; index += 1) {
      world.step(STEP, planPilot(world, memory, true), null, false);
    }
    for (let attempt = 0; attempt < 3 && !world.state.alarm; attempt += 1) {
      if (!stageAlarm(world, memory)) break;
      // Stand in the cone until the alarm trips: re-place the player in
      // front of the guard each step, since the patrol keeps walking on.
      for (let index = 0; index < 5 / STEP && !world.state.alarm; index += 1) {
        stageAlarm(world, memory);
        if (world.step(STEP, { dx: 0, dy: 0, run: false, crouch: false }, null, false) & EVENT_CAUGHT) break;
      }
    }
    if (world.state.alarm) {
      // A quarter second of chase, then freeze the frame mid-alarm.
      for (let extra = 0; extra < 0.25 / STEP; extra += 1) {
        if (world.step(STEP, { dx: 0, dy: 0, run: false, crouch: false }, null, false) & EVENT_CAUGHT) break;
      }
    }
    return { screen: SCREEN_PLAY, best: world.state.score, extra: '' };
  }
  if (name === 'end') {
    // Get caught three times, each time by stepping into a guard's cone
    // and then standing still for the chase: a real game over.
    for (let catchCount = 0; catchCount < 3; catchCount += 1) {
      let caught = false;
      for (let attempt = 0; attempt < 4 && !caught; attempt += 1) {
        if (!stageAlarm(world, memory)) break;
        for (let index = 0; index < 12 / STEP; index += 1) {
          const events = world.step(STEP, { dx: 0, dy: 0, run: false, crouch: false }, null, false);
          if (events & EVENT_OVER) return { screen: SCREEN_OVER, best: world.state.score, extra: '' };
          if (events & EVENT_CAUGHT) {
            caught = true;
            break;
          }
          if (!world.state.alarm && index > 4 / STEP) break;
        }
      }
      if (!caught) break;
    }
    return { screen: world.state.lives === 0 ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score, extra: '' };
  }
  // win: the careful pilot plays all three levels.
  for (let index = 0; index < LIMIT_SECONDS / STEP; index += 1) {
    const events = world.step(STEP, planPilot(world, memory, true), null, false);
    if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: world.state.score, extra: '' };
    if (events & EVENT_OVER) break;
  }
  return { screen: SCREEN_PLAY, best: world.state.score, extra: '' };
}

// Exported for headless tests.
export { findPath, currentTarget };
