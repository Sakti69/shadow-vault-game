// The game's rules and state, with no drawing and no browser in it: the
// thief, the patrolling guards and their vision cones, cover, shadows,
// relics, the exit, detection and alarm. step() advances one fixed step
// and returns what happened as bit flags, so the caller can react without
// the world knowing about screens or sound. Nothing here allocates after
// createWorld returns (the per-step scratch lives on the closure).
import { DETECTION, FIELD, GUARD, LEVELS, LIVES, PEBBLES_PER_LEVEL, PLAYER, SCORE } from './config.js';

export const EVENT_RELIC = 1;
export const EVENT_CAUGHT = 2;
export const EVENT_OVER = 4;
export const EVENT_LEVEL = 8;
export const EVENT_WIN = 16;
export const EVENT_ALARM = 32;
export const EVENT_PEBBLE = 64;

const TAU = Math.PI * 2;

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

function angleLerp(a, b, t) {
  return a + angleDiff(b, a) * Math.min(1, t);
}

function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function circleHitsRect(x, y, radius, r) {
  const cx = Math.max(r.x, Math.min(x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(y, r.y + r.h));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < radius * radius;
}

/** True when the segment (x1,y1)-(x2,y2) touches rectangle r (slab test). */
function segmentHitsRect(x1, y1, x2, y2, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tMin = 0;
  let tMax = 1;
  if (dx === 0) {
    if (x1 < r.x || x1 > r.x + r.w) return false;
  } else {
    let t1 = (r.x - x1) / dx;
    let t2 = (r.x + r.w - x1) / dx;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  if (dy === 0) {
    if (y1 < r.y || y1 > r.y + r.h) return false;
  } else {
    let t1 = (r.y - y1) / dy;
    let t2 = (r.y + r.h - y1) / dy;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
}

export function createWorld(random) {
  const state = {
    player: { x: 0, y: 0, angle: 0, crouch: false, running: false, moving: false },
    guards: [],
    relics: [],
    level: 0,
    levelName: '',
    score: 0,
    lives: LIVES,
    detection: 0,
    alarm: false,
    unseenTimer: 0,
    levelTime: 0,
    totalTime: 0,
    pebbles: PEBBLES_PER_LEVEL,
    ghost: true,
    elapsed: 0,
    won: false,
  };
  // Scratch reused every step so the loop never allocates.
  const scratch = { blockers: [], level: null, seenBy: [] };

  function loadLevel(index) {
    const def = LEVELS[index];
    scratch.level = def;
    scratch.blockers = def.walls.concat(def.cover);
    state.level = index;
    state.levelName = def.name;
    state.levelTime = 0;
    state.detection = 0;
    state.alarm = false;
    state.unseenTimer = 0;
    state.pebbles = PEBBLES_PER_LEVEL;
    state.ghost = true;
    state.player.x = def.spawn.x;
    state.player.y = def.spawn.y;
    state.player.angle = -Math.PI / 2;
    state.player.crouch = false;
    state.player.running = false;
    state.player.moving = false;
    state.relics = def.relics.map((r) => ({ x: r.x, y: r.y, name: r.name, taken: false }));
    state.guards = def.guards.map((g) => {
      if (g.kind === 'sentry') {
        return {
          kind: 'sentry',
          x: g.x,
          y: g.y,
          angle: g.from,
          from: g.from,
          to: g.to,
          sweep: g.sweep,
          sweepDir: 1,
          mode: 'sentry',
          range: GUARD.sentryRange,
          pause: 0,
          wpIndex: 0,
          targetX: 0,
          targetY: 0,
        };
      }
      const first = g.waypoints[0];
      return {
        kind: 'patrol',
        x: first[0],
        y: first[1],
        angle: 0,
        mode: 'patrol',
        range: GUARD.visionRange,
        pause: 0,
        wpIndex: 1 % g.waypoints.length,
        waypoints: g.waypoints,
        targetX: 0,
        targetY: 0,
        from: 0,
        to: 0,
        sweep: 0,
        sweepDir: 1,
      };
    });
  }

  function reset() {
    state.score = 0;
    state.lives = LIVES;
    state.totalTime = 0;
    state.elapsed = 0;
    state.won = false;
    loadLevel(0);
  }

  function inShadow(x, y) {
    const zones = scratch.level.shadows;
    for (let i = 0; i < zones.length; i += 1) if (pointInRect(x, y, zones[i])) return true;
    return false;
  }

  function losBlocked(x1, y1, x2, y2) {
    const blockers = scratch.blockers;
    for (let i = 0; i < blockers.length; i += 1) {
      if (segmentHitsRect(x1, y1, x2, y2, blockers[i])) return true;
    }
    return false;
  }

  /** Would guard g see a player standing at (px, py) right now? */
  function guardSees(g, px, py) {
    const dx = px - g.x;
    const dy = py - g.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > g.range) return false;
    if (dist > 1 && Math.abs(angleDiff(Math.atan2(dy, dx), g.angle)) > GUARD.halfAngle) return false;
    return !losBlocked(g.x, g.y, px, py);
  }

  /** Would any guard see a player standing at (px, py)? For the autopilot. */
  function seesPlayerAt(px, py) {
    for (let i = 0; i < state.guards.length; i += 1) {
      if (guardSees(state.guards[i], px, py)) return true;
    }
    return false;
  }

  function moveCircle(body, dx, dy, radius) {
    const blockers = scratch.blockers;
    let nx = body.x + dx;
    for (let i = 0; i < blockers.length; i += 1) {
      if (circleHitsRect(nx, body.y, radius, blockers[i])) {
        nx = body.x;
        break;
      }
    }
    let ny = body.y + dy;
    for (let i = 0; i < blockers.length; i += 1) {
      if (circleHitsRect(nx, ny, radius, blockers[i])) {
        ny = body.y;
        break;
      }
    }
    body.x = Math.max(PLAYER.radius, Math.min(nx, FIELD.width - PLAYER.radius));
    body.y = Math.max(PLAYER.radius, Math.min(ny, FIELD.height - PLAYER.radius));
  }

  function moveToward(body, tx, ty, speed, dt, radius) {
    const dx = tx - body.x;
    const dy = ty - body.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return true;
    const stepLen = Math.min(dist, speed * dt);
    moveCircle(body, (dx / dist) * stepLen, (dy / dist) * stepLen, radius);
    body.angle = angleLerp(body.angle, Math.atan2(dy, dx), dt * 10);
    return dist <= speed * dt + 1;
  }

  function throwPebble(x, y) {
    if (state.pebbles <= 0) return false;
    state.pebbles -= 1;
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < state.guards.length; i += 1) {
      const g = state.guards[i];
      if (g.kind === 'sentry' || g.mode === 'chase') continue;
      const dx = g.x - x;
      const dy = g.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = g;
      }
    }
    if (best !== null) {
      best.mode = 'investigate';
      best.targetX = x;
      best.targetY = y;
      best.pause = 0;
    }
    return true;
  }

  /**
   * One fixed step. `move` is {dx, dy, run, crouch} with dx/dy in -1..1.
   * `pebble` is {x, y} when the player threw one this step, else null.
   * With `harmless` set (the title screen's backdrop) guards patrol but
   * nothing is seen, caught or scored.
   */
  function step(dt, move, pebble, harmless) {
    let events = 0;
    if (state.won && !harmless) return events;
    state.elapsed += dt;
    if (!harmless) state.levelTime += dt;
    if (!harmless) state.totalTime += dt;

    const player = state.player;
    const speed = move.crouch ? PLAYER.crouch : move.run ? PLAYER.run : PLAYER.walk;
    let mx = move.dx;
    let my = move.dy;
    const mLen = Math.sqrt(mx * mx + my * my);
    if (mLen > 1) {
      mx /= mLen;
      my /= mLen;
    }
    player.moving = mLen > 0.05;
    player.running = move.run && player.moving;
    player.crouch = move.crouch;
    if (player.moving) {
      moveCircle(player, mx * speed * dt, my * speed * dt, PLAYER.radius);
      player.angle = angleLerp(player.angle, Math.atan2(my, mx), dt * 12);
    }
    if (pebble !== null && !harmless && throwPebble(pebble.x, pebble.y)) events |= EVENT_PEBBLE;

    // Running is loud: guards in earshot come to look.
    if (player.running && !harmless) {
      for (let i = 0; i < state.guards.length; i += 1) {
        const g = state.guards[i];
        if (g.kind === 'sentry' || g.mode !== 'patrol') continue;
        const dx = g.x - player.x;
        const dy = g.y - player.y;
        if (dx * dx + dy * dy < PLAYER.noiseRadius * PLAYER.noiseRadius) {
          g.mode = 'investigate';
          g.targetX = player.x;
          g.targetY = player.y;
          g.pause = 0;
        }
      }
    }

    // Guards. Remember which ones see the player so the detection pass below
    // does not redo the line-of-sight test.
    let anySees = false;
    const seenBy = scratch.seenBy;
    seenBy.length = 0;
    for (let i = 0; i < state.guards.length; i += 1) {
      const g = state.guards[i];
      if (g.kind === 'sentry') {
        g.angle += g.sweepDir * g.sweep * dt;
        if (g.sweepDir > 0 && g.angle >= g.to) {
          g.angle = g.to;
          g.sweepDir = -1;
        } else if (g.sweepDir < 0 && g.angle <= g.from) {
          g.angle = g.from;
          g.sweepDir = 1;
        }
      } else if (g.mode === 'patrol') {
        if (g.pause > 0) {
          g.pause -= dt;
        } else {
          const wp = g.waypoints[g.wpIndex];
          if (moveToward(g, wp[0], wp[1], GUARD.patrolSpeed, dt, GUARD.radius)) {
            g.wpIndex = (g.wpIndex + 1) % g.waypoints.length;
            g.pause = GUARD.waypointPause;
          }
        }
      } else if (g.mode === 'investigate') {
        if (g.pause > 0) {
          g.pause -= dt;
          if (g.pause <= 0) g.mode = 'patrol';
        } else if (moveToward(g, g.targetX, g.targetY, GUARD.investigateSpeed, dt, GUARD.radius)) {
          g.pause = GUARD.investigatePause;
        }
      } else if (g.mode === 'chase') {
        moveToward(g, player.x, player.y, GUARD.chaseSpeed, dt, GUARD.radius);
      }
      if (!harmless && guardSees(g, player.x, player.y)) {
        anySees = true;
        seenBy.push(g);
      }
    }

    if (harmless) return events;

    // Detection meter: rises while any guard sees the player, falls otherwise.
    if (anySees) {
      state.unseenTimer = 0;
      let rate = 0;
      for (let i = 0; i < seenBy.length; i += 1) {
        const g = seenBy[i];
        const dx = player.x - g.x;
        const dy = player.y - g.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const closeness = 1 - dist / (g.range + 1);
        let r = DETECTION.farRate + (DETECTION.closeRate - DETECTION.farRate) * closeness;
        if (player.crouch) r *= DETECTION.crouchFactor;
        if (player.running) r *= DETECTION.runFactor;
        if (player.moving) r *= DETECTION.movingFactor;
        if (inShadow(player.x, player.y)) r *= DETECTION.shadowFactor;
        if (r > rate) rate = r;
      }
      state.detection = Math.min(100, state.detection + rate * dt);
    } else {
      state.unseenTimer += dt;
      state.detection = Math.max(0, state.detection - DETECTION.decayCalm * dt);
    }

    if (state.detection >= 100 && !state.alarm) {
      state.alarm = true;
      state.ghost = false;
      state.unseenTimer = 0;
      for (let i = 0; i < state.guards.length; i += 1) {
        const g = state.guards[i];
        if (g.kind !== 'sentry') g.mode = 'chase';
      }
      events |= EVENT_ALARM;
    }
    if (state.alarm && state.unseenTimer >= DETECTION.alarmCooldown) {
      state.alarm = false;
      state.detection = 40;
      for (let i = 0; i < state.guards.length; i += 1) {
        const g = state.guards[i];
        if (g.kind !== 'sentry') g.mode = 'patrol';
      }
    }

    // Caught: a chasing guard closes in.
    if (state.alarm) {
      for (let i = 0; i < state.guards.length; i += 1) {
        const g = state.guards[i];
        if (g.mode !== 'chase') continue;
        const dx = player.x - g.x;
        const dy = player.y - g.y;
        if (dx * dx + dy * dy < GUARD.catchDistance * GUARD.catchDistance) {
          state.lives -= 1;
          state.score += SCORE.caught;
          state.alarm = false;
          state.detection = 0;
          events |= EVENT_CAUGHT;
          if (state.lives <= 0) {
            events |= EVENT_OVER;
            return events;
          }
          loadLevel(state.level);
          return events;
        }
      }
    }

    // Relics.
    for (let i = 0; i < state.relics.length; i += 1) {
      const relic = state.relics[i];
      if (relic.taken) continue;
      const dx = player.x - relic.x;
      const dy = player.y - relic.y;
      if (dx * dx + dy * dy < 28 * 28) {
        relic.taken = true;
        state.score += SCORE.relic;
        events |= EVENT_RELIC;
      }
    }

    // Exit: opens once every relic is taken. After the win, the run is
    // over: no more bonuses, no more re-triggers.
    const allTaken = state.relics.every((r) => r.taken);
    if (allTaken && !state.won) {
      const exit = scratch.level.exit;
      if (circleHitsRect(player.x, player.y, PLAYER.radius, exit)) {
        const par = scratch.level.par;
        const timeBonus = Math.max(0, Math.round((par - state.levelTime) * 10));
        state.score += timeBonus;
        if (state.ghost) state.score += SCORE.levelGhost;
        if (state.level + 1 >= LEVELS.length) {
          state.won = true;
          events |= EVENT_WIN;
        } else {
          events |= EVENT_LEVEL;
          loadLevel(state.level + 1);
        }
      }
    }
    return events;
  }

  reset();
  return { state, reset, step, loadLevel, seesPlayerAt, inShadow, guardSees };
}
