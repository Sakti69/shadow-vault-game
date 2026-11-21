// Shadow Vault — tuning, palette and level data in one place.
// Top-down stealth: collect every relic, then reach the exit unseen.
// The playfield is a fixed 1280x720 logical area; the renderer scales it
// to the window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 11,
  walk: 108,
  run: 168,
  crouch: 62,
  /** Noise radius while running: guards inside it turn to investigate. */
  noiseRadius: 175,
};

export const GUARD = {
  radius: 13,
  patrolSpeed: 62,
  chaseSpeed: 152,
  investigateSpeed: 95,
  /** How long a guard waits at each patrol waypoint, in seconds. */
  waypointPause: 1.4,
  /** How long a guard stares at an investigated spot before resuming patrol. */
  investigatePause: 2.2,
  visionRange: 235,
  sentryRange: 265,
  /** Half-angle of the vision cone, in radians. */
  halfAngle: 0.56,
  /** Catch distance: a chasing guard this close ends the attempt. */
  catchDistance: 26,
};

export const DETECTION = {
  /** Per-second rise while seen at point blank; falls off with distance. */
  closeRate: 62,
  farRate: 20,
  crouchFactor: 0.5,
  runFactor: 1.35,
  shadowFactor: 0.45,
  movingFactor: 1.12,
  /** Per-second fall while unseen. */
  decayCalm: 26,
  decayAlarm: 34,
  /** Seconds unseen before an alarm cools back to patrol. */
  alarmCooldown: 3.5,
};

export const LIVES = 3;
export const PEBBLES_PER_LEVEL = 3;
export const SCORE = { relic: 500, levelGhost: 300, caught: -150, timePar: 90 };

export const PALETTE = {
  floor: '#171a21',
  floorTile: '#1b1f28',
  wall: '#3a4152',
  wallEdge: '#565f75',
  cover: '#4a3d28',
  coverEdge: '#7a653d',
  shadowZone: 'rgba(38, 68, 120, 0.30)',
  cone: 'rgba(242, 201, 76, 0.16)',
  coneEdge: 'rgba(242, 201, 76, 0.45)',
  coneAlert: 'rgba(229, 83, 75, 0.20)',
  coneAlertEdge: 'rgba(229, 83, 75, 0.55)',
  player: '#4fc3f7',
  playerCrouch: '#2b7ea6',
  guard: '#e5534b',
  guardBody: '#8c2f2a',
  relic: '#f2c94c',
  exitLocked: '#5a6b52',
  exitOpen: '#58c472',
  panel: '#20242e',
  text: '#eef1f5',
  muted: '#8b93a3',
  danger: '#e5534b',
  gold: '#f2c94c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'shadow-vault.best';

// ---------------------------------------------------------------------------
// Levels. Walls and cover are rectangles {x, y, w, h}; both block movement
// and a guard's line of sight. Shadows are rectangles where detection rises
// slower. Relics are points the player must collect; exit opens once all
// are taken. Guards patrol waypoint loops, or stand as sentries sweeping
// their cone between two angles.
// ---------------------------------------------------------------------------

const BORDER = [
  { x: 0, y: 0, w: 1280, h: 18 },
  { x: 0, y: 702, w: 1280, h: 18 },
  { x: 0, y: 0, w: 18, h: 720 },
  { x: 1262, y: 0, w: 18, h: 720 },
];

// One shared skeleton for all three levels: three short interior walls that
// zigzag the field but never seal a chamber — every room stays reachable
// from every other through a wide gap (verified by the headless
// connectivity test, not by eye).
const SKELETON = [
  ...BORDER,
  { x: 420, y: 0, w: 22, h: 300 },
  { x: 840, y: 420, w: 22, h: 282 },
  { x: 560, y: 300, w: 300, h: 22 },
];

export const LEVELS = [
  {
    name: 'The Gallery',
    par: 90,
    spawn: { x: 70, y: 650 },
    exit: { x: 1180, y: 40, w: 64, h: 52 },
    walls: [...SKELETON],
    cover: [
      { x: 200, y: 150, w: 90, h: 60 },
      { x: 550, y: 520, w: 100, h: 64 },
      { x: 950, y: 120, w: 90, h: 60 },
      { x: 950, y: 480, w: 90, h: 60 },
    ],
    shadows: [
      { x: 40, y: 300, w: 220, h: 130 },
      { x: 480, y: 80, w: 200, h: 120 },
      { x: 1000, y: 540, w: 220, h: 130 },
    ],
    relics: [
      { x: 165, y: 90, name: 'Sun Dial' },
      { x: 800, y: 650, name: 'Jade Fox' },
      { x: 1150, y: 300, name: 'Star Chart' },
    ],
    guards: [
      {
        kind: 'patrol',
        waypoints: [
          [150, 250],
          [150, 600],
          [350, 600],
          [350, 250],
        ],
      },
      {
        kind: 'patrol',
        waypoints: [
          [1080, 150],
          [1080, 550],
          [1200, 550],
          [1200, 150],
        ],
      },
    ],
  },
  {
    name: 'The Hall of Echoes',
    par: 110,
    spawn: { x: 70, y: 70 },
    exit: { x: 1180, y: 620, w: 64, h: 52 },
    walls: [...SKELETON],
    cover: [
      { x: 200, y: 450, w: 100, h: 64 },
      { x: 550, y: 120, w: 90, h: 60 },
      { x: 950, y: 500, w: 100, h: 64 },
      { x: 950, y: 150, w: 90, h: 60 },
    ],
    shadows: [
      { x: 40, y: 200, w: 220, h: 120 },
      { x: 480, y: 560, w: 220, h: 120 },
      { x: 700, y: 300, w: 200, h: 130 },
      { x: 1040, y: 300, w: 200, h: 120 },
    ],
    relics: [
      { x: 1150, y: 90, name: 'Moon Pearl' },
      { x: 480, y: 650, name: 'Bronze Owl' },
      { x: 800, y: 420, name: 'Ivory Key' },
    ],
    guards: [
      {
        kind: 'patrol',
        waypoints: [
          [150, 200],
          [150, 550],
          [350, 550],
          [350, 200],
        ],
      },
      {
        kind: 'patrol',
        waypoints: [
          [1080, 200],
          [1080, 550],
          [1200, 550],
          [1200, 200],
        ],
      },
      {
        kind: 'sentry',
        x: 700,
        y: 150,
        from: -0.4,
        to: Math.PI + 0.4,
        sweep: 0.55,
      },
    ],
  },
  {
    name: 'The Inner Vault',
    par: 130,
    spawn: { x: 70, y: 650 },
    exit: { x: 1180, y: 40, w: 64, h: 52 },
    walls: [...SKELETON],
    cover: [
      { x: 200, y: 150, w: 90, h: 60 },
      { x: 550, y: 520, w: 100, h: 64 },
      { x: 880, y: 120, w: 90, h: 60 },
      { x: 950, y: 480, w: 90, h: 60 },
      { x: 650, y: 450, w: 90, h: 60 },
    ],
    shadows: [
      { x: 40, y: 300, w: 220, h: 130 },
      { x: 480, y: 80, w: 200, h: 120 },
      { x: 700, y: 400, w: 200, h: 130 },
      { x: 1000, y: 540, w: 220, h: 130 },
    ],
    relics: [
      { x: 165, y: 90, name: 'Crown of Dusk' },
      { x: 800, y: 650, name: 'Emerald Scarab' },
      { x: 1150, y: 300, name: 'The Last Coin' },
    ],
    guards: [
      {
        kind: 'patrol',
        waypoints: [
          [150, 250],
          [150, 600],
          [350, 600],
          [350, 250],
        ],
      },
      {
        kind: 'patrol',
        waypoints: [
          [1080, 150],
          [1080, 550],
          [1200, 550],
          [1200, 150],
        ],
      },
      {
        kind: 'patrol',
        waypoints: [
          [500, 150],
          [500, 250],
          [800, 250],
          [800, 150],
        ],
      },
      {
        kind: 'sentry',
        x: 700,
        y: 420,
        from: -Math.PI * 0.9,
        to: -Math.PI * 0.1,
        sweep: 0.7,
      },
    ],
  },
];
