// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between six screens: title, play, paused, level-clear, game over and win.
//
// ?seed=N fixes the patrol timing. ?shot=start|play|alert|end|win (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, LIVES, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_ALARM,
  EVENT_CAUGHT,
  EVENT_LEVEL,
  EVENT_OVER,
  EVENT_PEBBLE,
  EVENT_RELIC,
  EVENT_WIN,
} from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import {
  createRenderer,
  SCREEN_CLEAR,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WIN,
} from './render.js';
import { stageShot } from './shots.js';
import {
  ensureAudio,
  playAlarm,
  playCaught,
  playLevelClear,
  playPebble,
  playPickup,
  playStep,
  playWin,
} from './audio.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** Seconds the level-clear banner stays up before the next level starts. */
const CLEAR_SECONDS = 2.5;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, scene.extra);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let clearTimer = 0;
  let clearExtra = '';
  let stepTimer = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each event.
  function announce(message) {
    status.textContent = message;
  }

  // Live state for play-tests and debugging (read-only from the console).
  function expose() {
    window.__game = {
      screen,
      score: world.state.score,
      lives: world.state.lives,
      level: world.state.level,
      levelName: world.state.levelName,
      relicsTaken: world.state.relics.filter((r) => r.taken).length,
      relicsTotal: world.state.relics.length,
      detection: Math.round(world.state.detection),
      alarm: world.state.alarm,
      pebbles: world.state.pebbles,
      player: { x: Math.round(world.state.player.x), y: Math.round(world.state.player.y) },
      guards: world.state.guards.map((g) => ({ x: Math.round(g.x), y: Math.round(g.y), mode: g.mode })),
    };
  }

  function startGame() {
    ensureAudio();
    input.takePebble(); // A click that started the game must not also throw a pebble.
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Playing ${world.state.levelName}. ${LIVES} lives. Collect all 3 relics, then reach the exit.`);
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(
      won
        ? `You cleared the vault. Score ${world.state.score}. Best ${best}.`
        : `Caught. Game over. Score ${world.state.score}. Best ${best}.`,
    );
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      input.takePebble(); // A click that resumes must not also throw a pebble.
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { dx: 0, dy: 0, run: false, crouch: false }, null, true);
      return;
    }
    if (screen === SCREEN_CLEAR) {
      clearTimer -= STEP;
      if (clearTimer <= 0) screen = SCREEN_PLAY;
      return;
    }
    const pebble = input.takePebble();
    const events = world.step(STEP, input.move(), screen === SCREEN_PLAY ? pebble : null, false);
    const player = world.state.player;
    if (player.moving) {
      stepTimer -= STEP;
      if (stepTimer <= 0) {
        playStep(player.running);
        stepTimer = player.running ? 0.28 : 0.45;
      }
    }
    if (events & EVENT_RELIC) {
      playPickup();
      announce(
        `${world.state.relics.filter((r) => r.taken).length} of ${world.state.relics.length} relics. ${
          world.state.relics.every((r) => r.taken) ? 'The exit is open.' : ''
        }`,
      );
    }
    if (events & EVENT_ALARM) {
      playAlarm();
      announce('Spotted! The alarm is up — break line of sight to cool it down.');
    }
    if (events & EVENT_PEBBLE) playPebble();
    if (events & EVENT_CAUGHT) {
      playCaught();
      announce(world.state.lives === 1 ? 'Caught! 1 life left.' : `Caught! ${world.state.lives} lives left.`);
    }
    if (events & EVENT_LEVEL) {
      playLevelClear();
      clearExtra = `${world.state.levelName} · Score ${world.state.score}`;
      clearTimer = CLEAR_SECONDS;
      screen = SCREEN_CLEAR;
      announce(`Level clear. ${clearExtra}.`);
    }
    if (events & EVENT_WIN) {
      playWin();
      endGame(true);
    } else if (events & EVENT_OVER) {
      playCaught();
      endGame(false);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_CLEAR) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_CLEAR)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, clearExtra);
    expose();
  }

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Shadow Vault. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
