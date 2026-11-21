// Keyboard and pointer input. Held keys give a steering vector; Shift runs
// (loud), C crouches (quiet, slow); one-shot presses (start, pause) are
// queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice. A click during play throws
// a pebble at that spot in field coordinates; a click on a panel confirms.
import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const CROUCH = new Set(['KeyC', 'ControlLeft']);

export function createInput(target) {
  let left = false;
  let right = false;
  let up = false;
  let down = false;
  let run = false;
  let crouch = false;
  let actions = 0;
  let pebble = null;

  function toField(clientX, clientY) {
    const rect = target.getBoundingClientRect();
    const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
    const ox = (rect.width - FIELD.width * scale) / 2;
    const oy = (rect.height - FIELD.height * scale) / 2;
    return {
      x: (clientX - rect.left - ox) / scale,
      y: (clientY - rect.top - oy) / scale,
    };
  }

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (RUN.has(event.code)) run = true;
    else if (CROUCH.has(event.code)) crouch = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (RUN.has(event.code)) run = false;
    else if (CROUCH.has(event.code)) crouch = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
    up = false;
    down = false;
    run = false;
    crouch = false;
  });
  target.addEventListener('pointerdown', (event) => {
    pebble = toField(event.clientX, event.clientY);
    actions |= ACTION_CONFIRM;
  });

  return {
    /** Steering vector {dx, dy, run, crouch} from the keys held now. */
    move() {
      return {
        dx: (right ? 1 : 0) - (left ? 1 : 0),
        dy: (down ? 1 : 0) - (up ? 1 : 0),
        run,
        crouch,
      };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The click point since the last call, in field coordinates, or null. */
    takePebble() {
      const taken = pebble;
      pebble = null;
      return taken;
    },
  };
}
