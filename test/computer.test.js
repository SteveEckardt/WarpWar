import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, applyAction } from '../src/engine/game.js';
import { viewFor } from '../src/engine/view.js';
import { createController, createComputerController, createLocalController } from '../src/play/controllers.js';
import { createGameLoop } from '../src/play/loop.js';
import { createRandom } from '../src/play/random.js';

// Phase 9b-1: a random legal computer player for the Learning scenario. It is handed only its view, keeps the
// candidate actions applyAction accepts on a copy of that view, and picks one with a seeded random number generator.
const mapData = JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8'));

// ann moves first; bob, moving second, chooses the side inside the loop (§4).
const learning = () => {
  const r = applyAction(createGame({ map: mapData, scenario: 'learning', players: ['ann', 'bob'] }), { type: 'setFirstPlayer', player: 'ann' });
  assert.equal(r.ok, true);
  return r.state;
};

const MAX_ACTIONS = 20000;

// A computer vs computer Learning game. Returns { final, actions, refused, asked }: every accepted action, every
// refused one, and every { player, side, view, state } a controller was asked with.
async function computerGame(seed, wrap = (c) => c) {
  const actions = [];
  const refused = [];
  const asked = [];
  let loop = null;
  const seat = (player, s) => {
    const computer = wrap(createComputerController({ seed: s }));
    return {
      kind: computer.kind,
      nextAction(view, options) {
        asked.push({ player, side: options.side, view, state: loop.state });
        return computer.nextAction(view, options);
      },
      outcome(r) {
        if (!r.ok) refused.push({ player, ...r });
        computer.outcome?.(r);
      },
    };
  };
  loop = createGameLoop({
    state: learning(),
    controllers: { ann: seat('ann', seed), bob: seat('bob', seed + 100000) },
    onAction(before, action) {
      actions.push(action);
      if (actions.length >= MAX_ACTIONS) loop.stop();
    },
  });
  const final = await loop.run();
  return { final, actions, refused, asked };
}

describe('the seeded random number generator', () => {
  test('a seed always gives the same numbers, in [0, 1)', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    const xs = Array.from({ length: 100 }, () => a.next());
    assert.deepEqual(xs, Array.from({ length: 100 }, () => b.next()));
    assert.ok(xs.every((x) => x >= 0 && x < 1));
    assert.notDeepEqual(xs, Array.from({ length: 100 }, (() => { const c = createRandom(43); return () => c.next(); })()));
  });

  test('a seed is an integer', () => {
    assert.throws(() => createRandom(1.5), RangeError);
    assert.throws(() => createRandom('1'), RangeError);
    assert.throws(() => createComputerController({}), RangeError, 'the computer needs a seed');
  });
});

describe('computer vs computer: the Learning scenario', () => {
  const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);
  const games = new Map();
  before(async () => {
    for (const seed of SEEDS) games.set(seed, await computerGame(seed));
  });

  test(`plays to a win or a draw without a refused action, across ${SEEDS.length} seeds`, () => {
    for (const [seed, { final, actions, refused }] of games) {
      assert.deepEqual(refused, [], `seed ${seed}: refused actions`);
      assert.equal(final.step, 'over', `seed ${seed}: not over after ${actions.length} actions`);
      assert.ok(final.result.draw === true || ['ann', 'bob'].includes(final.result.player), `seed ${seed}: ${JSON.stringify(final.result)}`);
    }
  });

  test('between them the games make every kind of Learning decision', () => {
    const made = new Set([...games.values()].flatMap((g) => g.actions.map((a) => a.type)));
    for (const type of ['chooseSide', 'build', 'move', 'endMovement', 'chooseCombat', 'orders', 'allocateHits', 'placeRetreats', 'withdraw', 'endTurn']) {
      assert.ok(made.has(type), type);
    }
  });

  test('the same seed plays the same game', async () => {
    for (const seed of [1, 7]) {
      const again = await computerGame(seed);
      assert.deepEqual(again.actions, games.get(seed).actions);
      assert.deepEqual(again.final, games.get(seed).final);
    }
    assert.notDeepEqual(games.get(1).actions, games.get(2).actions, 'another seed, another game');
  });

  test('the computer is handed its view and nothing else', async () => {
    const { asked } = await computerGame(3);
    let hidden = 0;
    for (const { side, view, state } of asked) {
      assert.deepEqual(view, viewFor(state, side));
      assert.notEqual(view, state);
      const enemy = Object.values(view.ships).filter((sh) => sh.owner !== side);
      for (const sh of enemy) assert.equal(sh.PD, undefined, 'enemy ships are counters only (D-039)');
      if (enemy.length > 0) hidden += 1;
    }
    assert.ok(hidden > 0, 'some decisions were made with enemy ships on the map');
  });

  test('a computer second player chooses its side through its controller', async () => {
    const { actions, asked } = await computerGame(5);
    assert.equal(actions[0].type, 'chooseSide');
    assert.equal(actions[0].player, 'bob');
    assert.deepEqual({ player: asked[0].player, side: asked[0].side }, { player: 'bob', side: null });
    assert.deepEqual(asked[0].view, viewFor(asked[0].state, null), 'setup is open: the public view');
  });

  test('a refused action: the computer is told why and asked again', async () => {
    let first = true;
    const once = (c) => ({
      kind: c.kind,
      nextAction(view, options) {
        if (first) {
          first = false;
          return { type: 'chooseSide', player: options.player, side: 'C' };
        }
        return c.nextAction(view, options);
      },
    });
    const { final, refused } = await computerGame(9, once);
    assert.equal(refused.length, 1);
    assert.equal(refused[0].code, 'BAD_SIDE');
    assert.equal(final.step, 'over');
  });
});

describe('the computer against a local player', () => {
  test('a local second player is asked to choose the side; then the computer builds', async () => {
    const bob = createLocalController();
    const loop = createGameLoop({ state: learning(), controllers: { ann: createController('computer', { seed: 11 }), bob } });
    loop.run();
    assert.equal(bob.request.side, null);
    assert.deepEqual(bob.request.view, viewFor(loop.state, null));
    assert.deepEqual(await bob.submit({ type: 'chooseSide', player: 'bob', side: 'B' }), { ok: true });
    assert.equal(loop.state.sides.ann, 'A');
    // The computer builds for side A, spends its 40 BP (§4.1) and moves on; bob is not asked until it is his turn.
    for (let i = 0; i < 1000 && !bob.request; i += 1) await new Promise((done) => setImmediate(done));
    assert.equal(loop.state.hasBuilt.A, true);
    assert.equal(loop.state.bp.A, 0);
    assert.equal(loop.state.active, 'B');
    assert.equal(bob.request.side, 'B');
    loop.stop();
  });
});

describe('the setup screen', () => {
  test('each player is Human or Computer; Human by default', async () => {
    const { renderNewGame } = await import('../src/ui/setup.js');
    const html = renderNewGame({});
    for (const n of [1, 2]) {
      assert.match(html, new RegExp(`<select name="seat${n}"[^>]*><option value="local" selected>Human</option><option value="computer">Computer</option></select>`));
    }
    assert.match(renderNewGame({ seats: ['local', 'computer'] }), /<select name="seat2"[^>]*><option value="local">Human<\/option><option value="computer" selected>Computer/);
  });
});
