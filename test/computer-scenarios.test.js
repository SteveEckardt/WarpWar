import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, applyAction } from '../src/engine/game.js';
import { viewFor, actingPlayer } from '../src/engine/view.js';
import { createComputerController } from '../src/play/controllers.js';
import { createGameLoop } from '../src/play/loop.js';

// Phase 9b-2: the random legal computer player in Basic and Advanced, and with the fan modules.
const mapData = JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8'));
const jump = (to) => ({ type: 'jump', to });
const move = (q, r) => ({ type: 'move', to: { q, r } });
const pickup = (ship) => ({ type: 'pickup', ship });
const drop = (ship) => ({ type: 'drop', ship });

function play(state, ...actions) {
  for (const action of actions) {
    const r = applyAction(state, action);
    assert.equal(r.ok, true, `${action.type} by ${action.player} rejected: ${r.code}: ${r.message}`);
    state = r.state;
  }
  return state;
}

const created = (scenario, modules = []) =>
  play(createGame({ map: mapData, scenario, players: ['ann', 'bob'], modules }), { type: 'setFirstPlayer', player: 'ann' });
const started = (scenario, modules = []) => play(created(scenario, modules), { type: 'chooseSide', player: 'bob', side: 'B' });

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

// The computer's action for whoever must decide in s, from their view; it must be legal on the real state.
function decide(s, seed) {
  const player = actingPlayer(s);
  const side = s.sides?.[player] ?? null;
  const action = createComputerController({ seed }).nextAction(viewFor(s, side), { side, player, rejection: null });
  const r = applyAction(s, action);
  assert.equal(r.ok, true, `seed ${seed}: ${action.type} by ${player} refused: ${r.code}: ${r.message}`);
  return action;
}
const decisions = (s) => SEEDS.map((seed) => decide(s, seed));

// Computer vs computer from `state` until the game is over or `until(state)`. Returns { final, actions, refused }.
async function computerGame(state, seed, until = () => false) {
  const actions = [];
  const refused = [];
  let loop = null;
  const seat = (s) => {
    const c = createComputerController({ seed: s });
    return { kind: c.kind, nextAction: (v, o) => c.nextAction(v, o), outcome: (r) => r.ok || refused.push(r) };
  };
  loop = createGameLoop({
    state,
    controllers: { ann: seat(seed), bob: seat(seed + 100000) },
    onAction(before, action, after) {
      actions.push(action);
      if (actions.length >= 20000 || until(after)) loop.stop();
    },
  });
  return { final: await loop.run(), actions, refused };
}

describe('computer vs computer: Basic, Advanced and the fan modules', () => {
  test('Basic plays to a win or a draw without a refused action, across 10 seeds', async () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const { final, actions, refused } = await computerGame(created('basic'), seed);
      assert.deepEqual(refused, [], `seed ${seed}`);
      assert.equal(final.step, 'over', `seed ${seed}: not over after ${actions.length} actions`);
    }
  });

  test('Learning and Basic with Armor and Cannons play to the end, across 5 seeds each', async () => {
    for (const scenario of ['learning', 'basic']) {
      for (const seed of SEEDS.slice(0, 5)) {
        const { final, refused } = await computerGame(created(scenario, ['armor', 'cannons']), seed);
        assert.deepEqual(refused, [], `${scenario} seed ${seed}`);
        assert.equal(final.step, 'over', `${scenario} seed ${seed}`);
      }
    }
  });

  // Random players in Advanced build every turn and seldom take three bases, so the game is followed for 20
  // game-turns: every decision in them must be legal.
  test('Advanced with every module: 20 game-turns without a refused action, across 10 seeds', async () => {
    const made = new Set();
    for (const seed of SEEDS.slice(0, 10)) {
      const { final, actions, refused } = await computerGame(created('advanced', ['armor', 'cannons', 'ecm']), seed, (s) => s.turn > 20);
      assert.deepEqual(refused, [], `seed ${seed}`);
      assert.ok(final.turn > 20 || final.step === 'over', `seed ${seed}`);
      actions.forEach((a) => made.add(a.type));
    }
    for (const type of ['build', 'move', 'rearrange', 'endTurn']) assert.ok(made.has(type), type);
  });

  // Both fleets, built by the computers with 80 BP each, put on Uruk as side B ends movement: the combat that
  // random movement on the open map seldom brings about.
  test('Advanced with every module: whole fleets meet in combat, without a refused action, across 20 seeds', async () => {
    const made = new Set();
    for (const seed of SEEDS.slice(0, 20)) {
      const fresh = structuredClone(created('advanced', ['armor', 'cannons', 'ecm']));
      fresh.bp = { A: 80, B: 80 };
      const built = structuredClone((await computerGame(fresh, seed, (s) => s.hasBuilt.B)).final);
      const uruk = built.map.stars.find((st) => st.id === 'uruk');
      for (const sh of Object.values(built.ships)) Object.assign(sh, { q: uruk.q, r: uruk.r });
      const meet = play(built, { type: 'endMovement', player: actingPlayer(built) });
      const { actions, refused } = await computerGame(meet, seed, (s) => s.turn > meet.turn + 2);
      assert.deepEqual(refused, [], `seed ${seed}`);
      actions.forEach((a) => made.add(a.type));
    }
    for (const type of ['chooseCombat', 'orders', 'allocateEcm', 'allocateHits', 'placeRetreats', 'withdraw']) assert.ok(made.has(type), type);
  });
});

// Basic, from test/ui-carrying.test.js. ann (A): W1 (PD 10, B 5, S 5, SR 2), Systemships S01, S02 at Ur.
const annBuilt = () => play(started('basic'), {
  type: 'build', player: 'ann', ships: [
    { id: 'A-W1', design: { WG: true, PD: 10, B: 5, S: 5, SR: 2 }, at: 'ur' },
    { id: 'A-S01', design: { PD: 4, B: 4, S: 4 }, at: 'ur' },
    { id: 'A-S02', design: { PD: 5, B: 3, S: 3 }, at: 'ur' },
  ],
});
// ann's W1 carries S01 to Isin and puts S02 down there; bob's W1 brings his S01 to Isin. Combat at Isin.
const annMoved = () => play(annBuilt(), { type: 'move', player: 'ann', ship: 'A-W1', path: [pickup('A-S01'), pickup('A-S02'), jump('isin'), drop('A-S02')] });
const atCombat = () => play(
  annMoved(),
  { type: 'endMovement', player: 'ann' },
  { type: 'endTurn', player: 'ann' },
  {
    type: 'build', player: 'bob', ships: [
      { id: 'B-W1', design: { WG: true, PD: 30, SR: 1 }, at: 'nippur' },
      { id: 'B-S01', design: { PD: 7, B: 7 }, at: 'nippur' },
    ],
  },
  { type: 'move', player: 'bob', ship: 'B-W1', path: [pickup('B-S01'), jump('umma'), jump('girsu'), move(1, 0), move(0, 0), move(-1, 0), move(-2, 0), jump('isin'), drop('B-S01')] },
  { type: 'endMovement', player: 'bob' },
  { type: 'chooseCombat', player: 'bob', star: 'isin' },
);
const blank = (s, side) => Object.fromEntries(Object.entries(s.combat.hex.ships)
  .filter(([, sh]) => sh.owner === side).map(([id]) => [id, { tactic: 'attack', D: 0, B: 0, S: 0, T: 0 }]));

// Learning with Cannons, from test/ui-cannons.test.js: ann's W1 (PD 30, C 2, SH 18) and bob's W1 at Uruk.
const cannonsAtOrders = () => play(
  started('learning', ['cannons', 'armor']),
  { type: 'build', player: 'ann', ships: [{ id: 'A-W1', design: { WG: true, PD: 30, C: 2, SH: 18 }, at: 'ur' }] },
  { type: 'move', player: 'ann', ship: 'A-W1', path: [jump('isin'), jump('uruk')] },
  { type: 'endMovement', player: 'ann' }, { type: 'endTurn', player: 'ann' },
  { type: 'build', player: 'bob', ships: [{ id: 'B-W1', design: { WG: true, PD: 12, B: 10, S: 12, A: 2 }, at: 'nippur' }] },
  { type: 'move', player: 'bob', ship: 'B-W1', path: [jump('umma'), jump('girsu'), move(1, 0), move(0, 0), move(-1, 0), move(-2, 0)] },
  { type: 'endMovement', player: 'bob' },
  { type: 'chooseCombat', player: 'bob', star: 'uruk' },
  { type: 'orders', player: 'bob', orders: { 'B-W1': { tactic: 'attack', D: 0, B: 10, S: 0, T: 0, beamTarget: 'A-W1' } } },
);

// Advanced with ECM, from test/ui-ecm.test.js: ann's A-W1 (E 2) and bob's B-W1 (a Missile) at Isin.
function ecmAtOrders() {
  let s = play(
    started('advanced', ['ecm']),
    { type: 'build', player: 'ann', ships: [{ id: 'A-W1', design: { WG: true, PD: 6, E: 2 }, at: 'ur' }] },
    { type: 'endMovement', player: 'ann' }, { type: 'endTurn', player: 'ann' },
    { type: 'build', player: 'bob', ships: [{ id: 'B-W1', design: { WG: true, PD: 3, T: 1, M: 3 }, at: 'nippur' }] },
  );
  s = structuredClone(s);
  Object.assign(s.ships['A-W1'], { q: -7, r: 0 });
  Object.assign(s.ships['B-W1'], { q: -7, r: 0 });
  return play(s, { type: 'endMovement', player: 'bob' }, { type: 'chooseCombat', player: 'bob', star: 'isin' });
}

describe('each kind of decision, from its view, is legal on the real state (30 seeds each)', () => {
  test('setup: the side', () => {
    assert.deepEqual(new Set(decisions(created('basic')).map((a) => a.side)), new Set(['A', 'B']));
  });

  test('Basic build: Warpships, Systemships and racks for exactly 50 BP (§4.2)', () => {
    const builds = decisions(started('basic'));
    assert.ok(builds.some((a) => a.ships.some((sh) => !sh.design.WG)), 'some Systemships');
    assert.ok(builds.some((a) => a.ships.some((sh) => sh.design.SR > 0)), 'some racks');
  });

  test('Advanced build: repair, resupply and saving BP (§4.3, §5.3)', () => {
    let s = play(started('advanced'),
      { type: 'build', player: 'ann', ships: [{ id: 'A-W1', design: { WG: true, PD: 7, B: 3 }, at: 'ur' }, { id: 'A-S01', design: { PD: 1, T: 1, M: 3 }, at: 'ur' }] },
      { type: 'endMovement', player: 'ann' }, { type: 'endTurn', player: 'ann' },
      { type: 'build', player: 'bob', ships: [] }, { type: 'endMovement', player: 'bob' }, { type: 'endTurn', player: 'bob' });
    s = structuredClone(s);
    s.ships['A-W1'].PD = 2;
    s.ships['A-S01'].M = 1;
    const builds = decisions(s);
    assert.ok(builds.some((a) => a.repairs?.['A-W1']), 'some repair');
    assert.ok(builds.some((a) => a.resupply?.['A-S01']), 'some resupply');
    assert.ok(builds.some((a) => applyAction(s, a).state.bp.A > 0), 'some save BP');
  });

  test('movement: pickups and drops on the way (§6.2)', () => {
    const moves = decisions(play(annBuilt()));
    assert.ok(moves.some((a) => a.type === 'move' && a.path.some((st) => st.type === 'pickup')));
  });

  test('after combat: rearranging Systemships (§8)', () => {
    const after = decisions(play(annMoved(), { type: 'endMovement', player: 'ann' }));
    assert.ok(after.some((a) => a.type === 'rearrange'));
    assert.ok(after.some((a) => a.type === 'endTurn'));
  });

  test('combat orders: pickups and drops (§7.3), for both sides', () => {
    const bob = decisions(atCombat());
    const ann = decisions(play(atCombat(), { type: 'orders', player: 'bob', orders: blank(atCombat(), 'B') }));
    assert.ok([...bob, ...ann].some((a) => Object.values(a.orders).some((o) => o.pickup || o.drop)));
  });

  test('hits on a carried Systemship (D-021)', () => {
    const s = atCombat();
    const hits = play(s,
      { type: 'orders', player: 'bob', orders: { ...blank(s, 'B'), 'B-S01': { tactic: 'attack', D: 0, B: 7, S: 0, T: 0, beamTarget: 'A-W1' } } },
      { type: 'orders', player: 'ann', orders: blank(s, 'A') });
    assert.equal(hits.combat.stage, 'hits');
    assert.ok(decisions(hits).some((a) => a.allocations['A-W1'].carried));
  });

  test('forced withdrawal carries loose Systemships off (D-023)', () => {
    let s = atCombat();
    for (let i = 0; i < 3; i++) s = play(s, { type: 'orders', player: 'bob', orders: blank(s, 'B') }, { type: 'orders', player: 'ann', orders: blank(s, 'A') });
    assert.equal(s.combat.stage, 'withdraw');
    for (const a of decisions(s)) assert.deepEqual(a.pickups, { 'B-W1': ['B-S01'] });
  });

  test('Cannons: orders that fire them (fan §10.2.3)', () => {
    assert.ok(decisions(cannonsAtOrders()).some((a) => a.orders['A-W1'].C > 0));
  });

  test("hits after enemy Cannon fire, on an Armored ship, from a view that hides the enemy's Cannons (D-039, D-042)", () => {
    const s = play(cannonsAtOrders(), { type: 'orders', player: 'ann', orders: { 'A-W1': { tactic: 'attack', D: 0, B: 0, S: 0, T: 0, C: 2, shells: [3, 3], cannonTarget: 'B-W1' } } });
    assert.equal(s.combat.stage, 'hits');
    assert.ok(s.combat.needHits.includes('B'));
    decisions(s);
  });

  test('ECM: powering it, then spreading it over incoming Missiles (fan §7.1.1)', () => {
    const s = ecmAtOrders();
    const withMissile = { 'B-W1': { tactic: 'attack', D: 0, B: 0, S: 0, T: 1, missiles: [{ target: 'A-W1', drive: 3 }] } };
    const ordered = play(s, { type: 'orders', player: 'bob', orders: withMissile });
    assert.ok(decisions(ordered).some((a) => a.orders['A-W1'].E > 0));
    const ecm = play(ordered, { type: 'orders', player: 'ann', orders: { 'A-W1': { tactic: 'attack', D: 3, B: 0, S: 0, T: 0, E: 2 } } });
    assert.equal(ecm.combat.stage, 'ecm');
    assert.ok(decisions(ecm).some((a) => Object.keys(a.ecm).length > 0));
  });
});
