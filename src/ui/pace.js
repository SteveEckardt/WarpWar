// Pacing the computer (Phase 9b-4): a pause before each of its actions so a human can follow them, at a chosen
// speed; Pause, Resume and Step; and a hold while a round report is open with nobody human playing.

import { esc } from './hexmap.js';

// Milliseconds before each computer action.
export const SPEEDS = { slow: 1500, normal: 700, fast: 150 };
const SPEED_TEXT = { slow: 'Slow', normal: 'Normal', fast: 'Fast' };

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

// sleep(ms) is the delay itself, replaceable for tests.
export function createPacer({ speed = 'normal', sleep = pause } = {}) {
  let paused = false;
  let held = false;
  let steps = 0;
  const waiting = [];
  const open = () => !held && (!paused || steps > 0);
  const release = () => {
    while (waiting.length > 0 && open()) {
      if (paused) steps -= 1;
      waiting.shift()();
    }
  };
  return {
    get speed() {
      return speed;
    },
    get paused() {
      return paused;
    },
    setSpeed(next) {
      if (!(next in SPEEDS)) throw new RangeError(`A speed is ${Object.keys(SPEEDS).join(', ')}, not: ${next}`);
      speed = next;
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      release();
    },
    // While paused: lets the next waiting action go. A step with nothing waiting is not saved up.
    step() {
      if (!paused || waiting.length === 0) return;
      steps += 1;
      release();
    },
    hold(on) {
      held = on;
      release();
    },
    // Resolves when the computer may act: after the delay, and once it is not paused or held.
    async wait() {
      await sleep(SPEEDS[speed]);
      await new Promise((done) => {
        waiting.push(done);
        release();
      });
    },
  };
}

// The bar shown while a computer plays: speed, Pause or Resume, Step while paused, and the game's seed.
export function renderPace({ speed, paused, seed }) {
  const options = Object.keys(SPEEDS).map((s) => `<option value="${s}"${s === speed ? ' selected' : ''}>${SPEED_TEXT[s]}</option>`).join('');
  return [
    `<label>Computer speed <select name="speed" aria-label="Computer speed">${options}</select></label>`,
    paused
      ? `<button type="button" data-action="resume">Resume</button> <button type="button" data-action="step">Step</button>`
      : `<button type="button" data-action="pause">Pause</button>`,
    seed != null ? `<span class="meta">Seed ${esc(String(seed))}</span>` : '',
  ].join(' ');
}
