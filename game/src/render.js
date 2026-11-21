// Drawing only: the world's state and the current screen in, pixels out.
// The 1280x720 playfield is scaled to fit the window and centred, the
// margin filled with the backdrop colour. Vision cones are raycast against
// walls and cover, so a cone stops at the wall it hits, as a player expects.
import { FIELD, FONT, LEVELS, LIVES, PALETTE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';
export const SCREEN_CLEAR = 'clear';

/** The panel's width; its height grows with its lines. */
const PANEL = { width: 640, top: 150, line: 32, bottom: 70 };
const CONE_RAYS = 25;

const TAU = Math.PI * 2;

function formatTime(seconds) {
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/** Distance along a ray before it hits a rectangle, or Infinity. Slab test. */
function rayRectDistance(ox, oy, dx, dy, r) {
  let tMin = 0;
  let tMax = Infinity;
  if (dx === 0) {
    if (ox < r.x || ox > r.x + r.w) return Infinity;
  } else {
    let t1 = (r.x - ox) / dx;
    let t2 = (r.x + r.w - ox) / dx;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return Infinity;
  }
  if (dy === 0) {
    if (oy < r.y || oy > r.y + r.h) return Infinity;
  } else {
    let t1 = (r.y - oy) / dy;
    let t2 = (r.y + r.h - oy) / dy;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return Infinity;
  }
  return tMin;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function drawFloor(state) {
    context.fillStyle = PALETTE.floor;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.floorTile;
    for (let y = 0; y < FIELD.height; y += 80) {
      for (let x = 0; x < FIELD.width; x += 80) {
        if (((x + y) / 80) % 2 === 0) context.fillRect(x, y, 80, 80);
      }
    }
    const level = LEVELS[state.level];
    context.fillStyle = PALETTE.shadowZone;
    for (const zone of level.shadows) context.fillRect(zone.x, zone.y, zone.w, zone.h);
  }

  function drawRects(list, fill, edge) {
    for (const r of list) {
      context.fillStyle = fill;
      context.fillRect(r.x, r.y, r.w, r.h);
      context.strokeStyle = edge;
      context.lineWidth = 2;
      context.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    }
  }

  function drawExit(state) {
    const level = LEVELS[state.level];
    const exit = level.exit;
    const open = state.relics.every((r) => r.taken);
    const pulse = open ? 0.6 + 0.4 * Math.sin(state.elapsed * 4) : 0;
    context.fillStyle = open ? PALETTE.exitOpen : PALETTE.exitLocked;
    context.globalAlpha = open ? 0.55 + 0.45 * pulse : 1;
    context.fillRect(exit.x, exit.y, exit.w, exit.h);
    context.globalAlpha = 1;
    context.strokeStyle = open ? '#a8e6b8' : '#8b93a3';
    context.lineWidth = 2;
    context.strokeRect(exit.x + 1, exit.y + 1, exit.w - 2, exit.h - 2);
    text(open ? 'EXIT' : 'LOCKED', exit.x + exit.w / 2, exit.y + exit.h / 2 + 5, 13, PALETTE.text, 'center');
  }

  function drawRelics(state) {
    const t = state.elapsed;
    for (const relic of state.relics) {
      if (relic.taken) continue;
      const glow = 0.5 + 0.5 * Math.sin(t * 3 + relic.x);
      context.fillStyle = PALETTE.relic;
      context.globalAlpha = 0.25 + 0.2 * glow;
      context.beginPath();
      context.arc(relic.x, relic.y, 20 + 4 * glow, 0, TAU);
      context.fill();
      context.globalAlpha = 1;
      context.save();
      context.translate(relic.x, relic.y);
      context.rotate(Math.PI / 4);
      context.fillRect(-8, -8, 16, 16);
      context.restore();
      text(relic.name, relic.x, relic.y + 34, 12, PALETTE.gold, 'center');
    }
  }

  function drawCone(guard, blockers) {
    const range = guard.range;
    const half = 0.56;
    const alerted = guard.mode === 'chase';
    context.beginPath();
    context.moveTo(guard.x, guard.y);
    for (let i = 0; i <= CONE_RAYS; i += 1) {
      const angle = guard.angle - half + (2 * half * i) / CONE_RAYS;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      let dist = range;
      for (const r of blockers) {
        const hit = rayRectDistance(guard.x, guard.y, dx, dy, r);
        if (hit < dist) dist = hit;
      }
      context.lineTo(guard.x + dx * dist, guard.y + dy * dist);
    }
    context.closePath();
    context.fillStyle = alerted ? PALETTE.coneAlert : PALETTE.cone;
    context.fill();
    context.strokeStyle = alerted ? PALETTE.coneAlertEdge : PALETTE.coneEdge;
    context.lineWidth = 1.5;
    context.stroke();
  }

  function drawGuards(state) {
    const level = LEVELS[state.level];
    const blockers = level.walls.concat(level.cover);
    for (const guard of state.guards) drawCone(guard, blockers);
    for (const guard of state.guards) {
      context.fillStyle = PALETTE.guardBody;
      context.beginPath();
      context.arc(guard.x, guard.y, 13, 0, TAU);
      context.fill();
      context.strokeStyle = PALETTE.guard;
      context.lineWidth = 2;
      context.stroke();
      // Facing tick: the nose shows where the guard looks.
      context.strokeStyle = PALETTE.guard;
      context.beginPath();
      context.moveTo(guard.x, guard.y);
      context.lineTo(guard.x + Math.cos(guard.angle) * 18, guard.y + Math.sin(guard.angle) * 18);
      context.stroke();
      if (guard.mode === 'chase') text('!', guard.x, guard.y - 22, 22, PALETTE.danger, 'center');
      else if (guard.mode === 'investigate') text('?', guard.x, guard.y - 22, 20, PALETTE.gold, 'center');
    }
  }

  function drawPlayer(state) {
    const player = state.player;
    const crouched = player.crouch;
    context.fillStyle = crouched ? PALETTE.playerCrouch : PALETTE.player;
    context.beginPath();
    context.arc(player.x, player.y, crouched ? 9 : 11, 0, TAU);
    context.fill();
    context.strokeStyle = '#dff4ff';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(player.x, player.y);
    context.lineTo(player.x + Math.cos(player.angle) * 16, player.y + Math.sin(player.angle) * 16);
    context.stroke();
    if (crouched) {
      context.strokeStyle = 'rgba(223, 244, 255, 0.5)';
      context.beginPath();
      context.arc(player.x, player.y, 15, 0, TAU);
      context.stroke();
    }
  }

  function drawHud(state) {
    context.fillStyle = 'rgba(16, 18, 24, 0.82)';
    context.fillRect(0, 0, FIELD.width, 40);
    context.textBaseline = 'alphabetic';
    text(`${state.level + 1}/3 · ${state.levelName}`, 16, 27, 17, PALETTE.text, 'left');
    // Relic pips.
    for (let i = 0; i < state.relics.length; i += 1) {
      const x = 300 + i * 26;
      context.save();
      context.translate(x, 20);
      context.rotate(Math.PI / 4);
      context.fillStyle = state.relics[i].taken ? PALETTE.relic : 'rgba(139, 147, 163, 0.4)';
      context.fillRect(-6, -6, 12, 12);
      context.restore();
    }
    text(`${state.relics.filter((r) => r.taken).length}/${state.relics.length} relics`, 380, 27, 15, PALETTE.muted, 'left');
    // Detection meter.
    const meterX = 560;
    const meterW = 220;
    text('DETECTION', meterX - 8, 27, 14, state.detection > 60 ? PALETTE.danger : PALETTE.muted, 'right');
    context.fillStyle = '#0e1116';
    context.fillRect(meterX, 12, meterW, 16);
    const frac = state.detection / 100;
    context.fillStyle = frac > 0.66 ? PALETTE.danger : frac > 0.33 ? PALETTE.gold : PALETTE.exitOpen;
    context.fillRect(meterX, 12, meterW * frac, 16);
    context.strokeStyle = PALETTE.wallEdge;
    context.lineWidth = 1;
    context.strokeRect(meterX, 12, meterW, 16);
    if (state.alarm) text('ALARM!', meterX + meterW + 14, 27, 18, PALETTE.danger, 'left');
    // Lives, pebbles, timer, score.
    let right = FIELD.width - 16;
    text(`Score ${state.score}`, right, 27, 17, PALETTE.text, 'right');
    right -= 130;
    text(formatTime(state.levelTime), right, 27, 17, PALETTE.text, 'right');
    right -= 80;
    text(`Pebbles ${state.pebbles}`, right, 27, 17, PALETTE.text, 'right');
    // The pebbles label is right-aligned and about 95 px wide: leave it room.
    right -= 120;
    for (let life = 0; life < LIVES; life += 1) {
      context.fillStyle = life < state.lives ? PALETTE.player : 'rgba(139, 147, 163, 0.35)';
      context.beginPath();
      context.arc(right - life * 24, 20, 7, 0, TAU);
      context.fill();
    }
    // Hint line at the bottom while playing.
    text(
      'WASD / arrows move · Shift run (loud) · C crouch · Click throws a pebble · P pause',
      FIELD.width / 2,
      FIELD.height - 10,
      13,
      PALETTE.muted,
      'center',
    );
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.wallEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 46, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 20, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 22, PALETTE.gold, 'center');
  }

  const TITLE_LINES = [
    'Three relics. One exit. A vault full of watching eyes.',
    'Slip past the guards and their vision cones — use cover',
    'and shadows, crouch when a cone sweeps near, and run',
    'only when no one can hear you. Click to toss a pebble',
    'and pull a guard away. Get caught three times and it is over.',
    '',
    'Best score: ',
  ];

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, extra) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#11141b';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawFloor(state);
    drawExit(state);
    drawRelics(state);
    const level = LEVELS[state.level];
    drawRects(level.cover, PALETTE.cover, PALETTE.coverEdge);
    drawRects(level.walls, PALETTE.wall, PALETTE.wallEdge);
    drawGuards(state);
    drawPlayer(state);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[6] = `Best score: ${best}`;
      drawPanel('SHADOW VAULT', TITLE_LINES, 'Press Space or click to start');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The guards will wait for you.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      drawPanel('Caught!', [`Score ${state.score}`, `Best ${best}`], 'Press Space or click to try again');
    } else if (screen === SCREEN_WIN) {
      drawPanel('The Vault Is Yours', [
        `Score ${state.score} · Time ${formatTime(state.totalTime)}`,
        `Best ${best}`,
        'Every relic lifted. No alarm that mattered.',
      ], 'Press Space or click to play again');
    } else if (screen === SCREEN_CLEAR) {
      context.textBaseline = 'alphabetic';
      text('Level clear', FIELD.width / 2, FIELD.height / 2 - 10, 44, PALETTE.text, 'center');
      if (extra) text(extra, FIELD.width / 2, FIELD.height / 2 + 34, 22, PALETTE.gold, 'center');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
