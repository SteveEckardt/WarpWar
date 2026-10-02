import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, applyAction } from '../src/engine/game.js';
import { viewFor, actingPlayer } from '../src/engine/view.js';
import { distance } from '../src/engine/map.js';
import { createComputerController, STRATEGIES } from '../src/play/computer.js';
import { createGameLoop } from '../src/play/loop.js';

// Phase 9b-3: the planning computer player. It plays to win by rules of thumb, from its view alone; the engine
// still decides what is legal.
const mapData = JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8'));
const jump = (to) => ({ type: 'jump', to });
const move = (q, r) => ({ type: 'move', to: { q, r } });
const star = (s, id) => s.map.stars.find((st) => st.id === id);

function play(state, ...actions) {
  for (const action of actions) {
    const r = applyAction(state, action);
    assert.equal(r.ok, true, `${action.type} by ${action.player} rejected: ${r.code}: ${r.message}`);
    state = r.state;
  }
  return state;
}

const created = (scenario, modules = [], first = 'ann') =>
  play(createGame({ map: mapData, scenario, players: ['ann', 'bob'], modules }), { type: 'setFirstPlayer', player: first });
const started = (scenario, modules = []) => play(created(scenario, modules), { type: 'chooseSide', player: 'bob', side: 'B' });

// The planner's action for whoever must decide in s, from their view; it must be legal on the real state.
function decide(s, seed = 1) {
  const player = actingPlayer(s);
  const side = s.sides?.[player] ?? null;
  const action = createComputerController({ seed, strategy: 'plan' }).nextAction(viewFor(s, side), { side, player, rejection: null });
  const r = applyAction(s, action);
  assert.equal(r.ok, true, `${action.type} by ${player} refused: ${r.code}: ${r.message}`);
  return action;
}

// One computer game; strategies: { ann, bob }. Resolves to { final, refused }.
async function game(state, seed, strategies) {
  const refused = [];
  let loop = null;
  let n = 0;
  const seat = (s, strategy) => {
    const c = createComputerController({ seed: s, strategy });
    return { kind: c.kind, nextAction: (v, o) => c.nextAction(v, o), outcome: (r) => r.ok || refused.push(r) };
  };
  loop = createGameLoop({
    state,
    controllers: { ann: seat(seed, strategies.ann), bob: seat(seed + 100000, strategies.bob) },
    onAction() {
      if (++n >= 20000) loop.stop();
    },
  });
  return { final: await loop.run(), refused };
}

describe('the strategies', () => {
  test('random or plan; random by default', () => {
    assert.deepEqual(STRATEGIES, ['random', 'plan']);
    assert.equal(createComputerController({ seed: 1 }).strategy, 'random');
    assert.equal(createComputerController({ seed: 1, strategy: 'plan' }).strategy, 'plan');
    assert.throws(() => createComputerController({ seed: 1, strategy: 'clever' }), RangeError);
  });
});

describe('the planner against the random player', () => {
  // Each seed alternates who moves first, and the planner plays either player.
  const CONFIGS = [['learning', [], 20], ['basic', [], 20], ['learning', ['armor', 'cannons'], 10], ['advanced', ['armor', 'cannons', 'ecm'], 10]];
  for (const [scenario, modules, seeds] of CONFIGS) {
    test(`${scenario}${modules.length ? ` with ${modules.join(', ')}` : ''}: wins at least 90% of ${seeds} games`, async () => {
      let wins = 0;
      for (let seed = 1; seed <= seeds; seed += 1) {
        const planner = seed % 4 < 2 ? 'ann' : 'bob';
        const strategies = { ann: planner === 'ann' ? 'plan' : 'random', bob: planner === 'bob' ? 'plan' : 'random' };
        const { final, refused } = await game(created(scenario, modules, seed % 2 ? 'ann' : 'bob'), seed, strategies);
        assert.deepEqual(refused, [], `seed ${seed}`);
        assert.equal(final.step, 'over', `seed ${seed}`);
        if (final.result.player === planner) wins += 1;
      }
      assert.ok(wins >= seeds * 0.9, `${wins} of ${seeds}`);
    });
  }
});

describe('the planner against itself', () => {
  for (const [scenario, modules] of [['learning', []], ['basic', ['armor', 'cannons']], ['advanced', ['armor', 'cannons', 'ecm']]]) {
    test(`${scenario}: every game ends, without a refused action, across 10 seeds`, async () => {
      for (let seed = 1; seed <= 10; seed += 1) {
        const { final, refused } = await game(created(scenario, modules, seed % 2 ? 'ann' : 'bob'), seed, { ann: 'plan', bob: 'plan' });
        assert.deepEqual(refused, [], `seed ${seed}`);
        assert.equal(final.step, 'over', `seed ${seed}`);
      }
    });
  }

  test('the same seed plays the same game', async () => {
    const a = await game(created('basic'), 3, { ann: 'plan', bob: 'plan' });
    const b = await game(created('basic'), 3, { ann: 'plan', bob: 'plan' });
    assert.deepEqual(b.final, a.final);
  });
});

// Learning: ann's A-W1 and bob's B-W1, 40 BP each, built at their bases; bob to move.
const W = { WG: true, PD: 15, B: 10, S: 10 };
const bobToMove = (annDesign = W, bobDesign = W) => play(
  started('learning'),
  { type: 'build', player: 'ann', ships: [{ id: 'A-W1', design: annDesign, at: 'ur' }] },
  { type: 'endMovement', player: 'ann' }, { type: 'endTurn', player: 'ann' },
  { type: 'build', player: 'bob', ships: [{ id: 'B-W1', design: bobDesign, at: 'nippur' }] },
);
const placed = (s, where) => {
  const c = structuredClone(s);
  for (const [id, at] of Object.entries(where)) Object.assign(c.ships[id], at);
  return c;
};

describe('build', () => {
  test('Learning and Basic: one Warpship for every BP, at a base', () => {
    for (const scenario of ['learning', 'basic']) {
      const a = decide(started(scenario));
      assert.equal(a.ships.length, 1);
      assert.equal(a.ships[0].design.WG, true);
      assert.ok(a.ships[0].design.B > 0 && a.ships[0].design.S > 0);
      assert.equal(a.ships[0].at, 'ur');
    }
  });

  test('Advanced: repairs a damaged ship at a base in full, then saves while under 25 BP', () => {
    let s = play(started('advanced'),
      { type: 'build', player: 'ann', ships: [{ id: 'A-W1', design: { WG: true, PD: 10, B: 5 }, at: 'ur' }] },
      { type: 'endMovement', player: 'ann' }, { type: 'endTurn', player: 'ann' },
      { type: 'build', player: 'bob', ships: [] }, { type: 'endMovement', player: 'bob' }, { type: 'endTurn', player: 'bob' });
    s = structuredClone(s);
    s.ships['A-W1'].PD = 7;
    const a = decide(s);
    assert.deepEqual(a.repairs, { 'A-W1': { PD: 3 } });
    assert.deepEqual(a.ships, [], `${s.bp.A} BP less the repair is under 25: saved`);
  });
});

describe('movement', () => {
  test('heads for the enemy base, as far as the engine allows (D-008 holds it back on the first turn)', () => {
    const s = bobToMove();
    const a = decide(s);
    assert.equal(a.type, 'move');
    const after = play(s, a);
    const ur = star(s, 'ur');
    assert.ok(distance(after.ships['B-W1'], ur) < distance(s.ships['B-W1'], ur));
  });

  test("covers its own base when an enemy Warpship away from home could reach it", () => {
    const girsu = star(bobToMove(), 'girsu');
    const s = placed(bobToMove(), { 'A-W1': { q: 10, r: 0 }, 'B-W1': { q: girsu.q, r: girsu.r } });
    const after = play(s, decide(s));
    assert.deepEqual([after.ships['B-W1'].q, after.ships['B-W1'].r], [star(s, 'nippur').q, star(s, 'nippur').r]);
  });

  test('stays on an enemy base it holds, unless its own base must be retaken', () => {
    const s = structuredClone(bobToMove());
    s.turn = 2;
    Object.assign(s.ships['B-W1'], { q: star(s, 'ur').q, r: star(s, 'ur').r });
    const alone = structuredClone(s);
    delete alone.ships['A-W1'];
    assert.deepEqual(decide(alone), { type: 'endMovement', player: 'bob' });
    // ann's ship on Nippur would win at the start of her turn: bob's goes back to fight it.
    Object.assign(s.ships['A-W1'], { q: star(s, 'nippur').q, r: star(s, 'nippur').r });
    const after = play(s, decide(s));
    assert.deepEqual([after.ships['B-W1'].q, after.ships['B-W1'].r], [star(s, 'nippur').q, star(s, 'nippur').r]);
  });
});

describe('combat', () => {
  // Both ships at Uruk, bob's End movement starts the combat there.
  const atUruk = (annDesign, bobDesign) => {
    const s = bobToMove(annDesign, bobDesign);
    const uruk = star(s, 'uruk');
    return play(placed(s, { 'A-W1': { q: uruk.q, r: uruk.r }, 'B-W1': { q: uruk.q, r: uruk.r } }),
      { type: 'endMovement', player: 'bob' }, { type: 'chooseCombat', player: 'bob', star: 'uruk' });
  };

  test('an armed ship attacks the enemy with Beam and Screen', () => {
    const o = decide(atUruk()).orders['B-W1'];
    assert.equal(o.tactic, 'attack');
    assert.equal(o.beamTarget, 'A-W1');
    assert.ok(o.B > 0);
  });

  test('a Warpship with no weapon retreats at full Drive; on a target star it Dodges and holds on', () => {
    const unarmed = { WG: true, PD: 35 };
    assert.deepEqual(decide(atUruk(W, unarmed)).orders['B-W1'], { D: 35, B: 0, S: 0, T: 0, tactic: 'retreat' });
    const s = bobToMove(W, unarmed);
    const ur = star(s, 'ur');
    const atUr = play(placed(s, { 'B-W1': { q: ur.q, r: ur.r } }), { type: 'endMovement', player: 'bob' }, { type: 'chooseCombat', player: 'bob', star: 'ur' });
    assert.equal(decide(atUr).orders['B-W1'].tactic, 'dodge');
  });

  test('hits go first on Missiles and Tubes, last on Beam and PD', () => {
    const missiles = { WG: true, PD: 20, B: 5, S: 4, T: 2, M: 12 };
    const s = atUruk(missiles, W);
    const hits = play(s,
      { type: 'orders', player: 'bob', orders: { 'B-W1': { tactic: 'attack', D: 0, B: 10, S: 0, T: 0, beamTarget: 'A-W1' } } },
      { type: 'orders', player: 'ann', orders: { 'A-W1': { tactic: 'attack', D: 0, B: 0, S: 0, T: 0 } } });
    assert.equal(hits.combat.owed['A-W1'], 12);
    assert.deepEqual(decide(hits).allocations['A-W1'], { M: 4, T: 2, S: 4, B: 2 });
  });
});
