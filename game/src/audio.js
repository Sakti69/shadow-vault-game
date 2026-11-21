// Tiny WebAudio sound effects, synthesized — no audio files, no network.
// Everything is silent until the first user gesture creates the context.
let context = null;

export function ensureAudio() {
  try {
    if (context === null) context = new (window.AudioContext || window.webkitAudioContext)();
    if (context.state === 'suspended') void context.resume();
  } catch {
    context = null;
  }
}

function tone(freq, dur, type, gain, when = 0) {
  if (context === null) return;
  try {
    const t0 = context.currentTime + when;
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp);
    amp.connect(context.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  } catch {
    // Sound is garnish: never let it break the game.
  }
}

export function playStep(running) {
  tone(running ? 140 : 90, 0.05, 'sine', 0.03);
}

export function playPickup() {
  tone(660, 0.12, 'sine', 0.08);
  tone(990, 0.18, 'sine', 0.08, 0.09);
}

export function playAlarm() {
  tone(220, 0.22, 'sawtooth', 0.07);
  tone(330, 0.22, 'sawtooth', 0.07, 0.18);
}

export function playCaught() {
  tone(110, 0.35, 'sawtooth', 0.1);
  tone(55, 0.4, 'square', 0.06, 0.1);
}

export function playLevelClear() {
  tone(523, 0.14, 'sine', 0.08);
  tone(659, 0.14, 'sine', 0.08, 0.12);
  tone(784, 0.24, 'sine', 0.08, 0.24);
}

export function playWin() {
  tone(523, 0.16, 'sine', 0.08);
  tone(659, 0.16, 'sine', 0.08, 0.14);
  tone(784, 0.16, 'sine', 0.08, 0.28);
  tone(1047, 0.4, 'sine', 0.09, 0.42);
}

export function playPebble() {
  tone(1200, 0.06, 'triangle', 0.05);
}
