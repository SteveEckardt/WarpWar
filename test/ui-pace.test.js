import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPacer, renderPace, SPEEDS } from '../src/ui/pace.js';
import { renderNewGame, parseSeed, computerSeed, SEATS } from '../src/ui/setup.js';
import { renderGameOver } from '../src/ui/gameover.js';
import { readFileSync } from 'node:fs';
import { createGame, applyAction } from '../src/engine/game.js';
import { createController } from '../src/play/controllers.js';
import { createGameLoop } from '../src/play/loop.js';

// Phase 9b-4: computer strength, a seed for replays, and pacing controls for watching the computer play.

const tick = () => new Promise((done) => setImmediate(done));
// A pacer whose delays end at once; `slept` records each delay asked for.
const instant = (speed) => {
  const slept = [];
  const pacer = createPacer({ speed, sleep: async (ms) => { slept.push(ms); } });
  return { pacer, slept };
};
// Starts a wait and reports whether it has finished after the queue settles.
async function settles(pacer) {
  let done = false;
  pacer.wait().then(() => { done = true; });
  for (let i = 0; i < 5; i += 1) await tick();
  return () => done;
}

describe('the pacer: the pause before each computer action', () => {
  test('waits the chosen speed: slow, normal or fast', async () => {
    assert.deepEqual(Object.keys(SPEEDS), ['slow', 'normal', 'fast']);
    assert.ok(SPEEDS.slow > SPEEDS.normal && SPEEDS.normal > SPEEDS.fast);
    const { pacer, slept } = instant('normal');
    await pacer.wait();
    pacer.setSpeed('fast');
    await pacer.wait();
    assert.deepEqual(slept, [SPEEDS.normal, SPEEDS.fast]);
    assert.throws(() => pacer.setSpeed('warp'), RangeError);
  });

  test('paused, nothing goes until resumed', async () => {
    const { pacer } = instant('fast');
    pacer.pause();
    assert.equal(pacer.paused, true);
    const done = await settles(pacer);
    assert.equal(done(), false);
    pacer.resume();
    await tick();
    assert.equal(done(), true);
  });

  test('step lets one action through while paused', async () => {
    const { pacer } = instant('fast');
    pacer.pause();
    const first = await settles(pacer);
    const second = await settles(pacer);
    pacer.step();
    await tick();
    assert.deepEqual([first(), second()], [true, false]);
    pacer.step();
    await tick();
    assert.equal(second(), true);
    pacer.step(); // a step with nothing waiting is not saved up
    assert.equal((await settles(pacer))(), false);
  });

  test('held (a round report open, nobody human playing), nothing goes until let go', async () => {
    const { pacer } = instant('fast');
    pacer.hold(true);
    const done = await settles(pacer);
    assert.equal(done(), false);
    pacer.hold(false);
    await tick();
    assert.equal(done(), true);
  });
});

describe('the pace bar', () => {
  test('speed, Pause or Resume, Step while paused, and the seed', () => {
    const running = renderPace({ speed: 'normal', paused: false, seed: 1234 });
    assert.match(running, /<select name="speed"[^>]*><option value="slow">Slow<\/option><option value="normal" selected>Normal<\/option><option value="fast">Fast<\/option><\/select>/);
    assert.match(running, /data-action="pause">Pause</);
    assert.doesNotMatch(running, /data-action="step"/);
    assert.match(running, /Seed 1234/);
    const paused = renderPace({ speed: 'fast', paused: true, seed: 7 });
    assert.match(paused, /data-action="resume">Resume</);
    assert.match(paused, /data-action="step">Step</);
  });
});

describe('the setup screen', () => {
  test('each player is Human, Computer: normal (the planner) or Computer: easy (random)', () => {
    assert.deepEqual(SEATS, { local: 'Human', plan: 'Computer: normal', random: 'Computer: easy' });
    const html = renderNewGame({ seats: ['local', 'random'] });
    assert.match(html, /<select name="seat1"[^>]*><option value="local" selected>Human<\/option><option value="plan">Computer: normal<\/option><option value="random">Computer: easy<\/option><\/select>/);
    assert.match(html, /<select name="seat2"[^>]*>.*<option value="random" selected>Computer: easy/);
  });

  test('a seed: blank for a new one, or a whole number to replay a game', () => {
    assert.match(renderNewGame({}), /<input name="seed" inputmode="numeric" value="" placeholder="random"/);
    assert.match(renderNewGame({ seed: '42' }), /<input name="seed" inputmode="numeric" value="42"/);
    assert.deepEqual(parseSeed(''), { seed: null });
    assert.deepEqual(parseSeed(' 42 '), { seed: 42 });
    assert.deepEqual(parseSeed('0'), { seed: 0 });
    for (const bad of ['-1', '1.5', 'abc', String(2 ** 31)]) assert.match(parseSeed(bad).error, /whole number/);
  });

  test("each computer's seed comes from the game's: the same seed, the same computers", () => {
    assert.equal(computerSeed(42, 0), computerSeed(42, 0));
    assert.notEqual(computerSeed(42, 0), computerSeed(42, 1));
    assert.ok(Number.isInteger(computerSeed(2 ** 31 - 1, 1)));
  });
});

describe('a replay', () => {
  const mapData = JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8'));
  // As the page starts a game: the seats' strategies, each computer seeded from the game's seed.
  async function played(seed, seats) {
    const s = applyAction(createGame({ map: mapData, scenario: 'basic', players: ['ann', 'bob'] }), { type: 'setFirstPlayer', player: 'ann' }).state;
    const controllers = { ann: createController('computer', { seed: computerSeed(seed, 0), strategy: seats[0] }), bob: createController('computer', { seed: computerSeed(seed, 1), strategy: seats[1] }) };
    const actions = [];
    return { final: await createGameLoop({ state: s, controllers, onAction: (b, a) => actions.push(a) }).run(), actions };
  }

  test('the same seed and settings play the same computer game again', async () => {
    for (const seats of [['plan', 'random'], ['random', 'plan']]) {
      const a = await played(42, seats);
      const b = await played(42, seats);
      assert.deepEqual(b.actions, a.actions);
      assert.equal(a.final.step, 'over');
    }
  });
});

describe('the game-over screen', () => {
  test('shows the seed, for a replay', () => {
    const state = { step: 'over', result: { draw: true }, turn: 9, scenario: 'learning', ships: {}, players: ['ann', 'bob'], sides: { ann: 'A', bob: 'B' }, map: { stars: [] } };
    assert.match(renderGameOver(state, [], { seed: 42 }), /Seed 42/);
    assert.doesNotMatch(renderGameOver(state, []), /Seed/);
  });
});
