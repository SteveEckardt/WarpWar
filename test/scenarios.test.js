import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, applyAction, SCENARIOS } from '../src/engine/game.js';

// Phase 6c: the Basic and Advanced scenarios (§4.2, §4.3), tech levels (§5.2), repair and resupply (§5.3).
// Rulings: D-007 (income per game-turn, in each player's own Build event), D-009 (draws), D-010 and D-041
// (victory points are a running total), D-011 (Level 0 outside Advanced), D-013 (controlled bases).
const mapData = JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8'));
const jump = (to) => ({ type: 'jump', to });
const move = (q, r) => ({ type: 'move', to: { q, r } });

function play(state, ...actions) {
  for (const action of actions) {
    const r = applyAction(state, action);
    assert.equal(r.ok, true, `${action.type} by ${action.player} rejected: ${r.code}: ${r.message}`);
    state = r.state;
  }
  return state;
}

function rejects(state, action, code) {
  const before = structuredClone(state);
  const r = applyAction(state, action);
  assert.equal(r.ok, false, `${action.type} should be rejected with ${code}`);
  assert.equal(r.code, code, r.message);
  assert.deepEqual(state, before, 'a rejected action must not change the state');
}

// ann moves first; bob (second) picks side B, so ann is A and builds first.
const started = (scenario) =>
  play(
    createGame({ map: mapData, scenario, players: ['ann', 'bob'] }),
    { type: 'setFirstPlayer', player: 'ann' },
    { type: 'chooseSide', player: 'bob', side: 'B' },
  );

const build = (player, ships = [], extra = {}) => ({ type: 'build', player, ships, ...extra });
// A player-turn with no moves: Build (if any), then end movement and the turn.
const pass = (s, player, buildAction = null) =>
  play(s, ...(buildAction ? [buildAction] : []), { type: 'endMovement', player }, { type: 'endTurn', player });
const stats = (sh) => ({ PD: sh.PD, B: sh.B, S: sh.S, T: sh.T, M: sh.M, SR: sh.SR });

describe('the scenarios (§4.1 to §4.3)', () => {
  test('starting Build Points, bases and victory levels', () => {
    assert.equal(SCENARIOS.basic.bp, 50);
    assert.equal(SCENARIOS.advanced.bp, 20);
    assert.equal(SCENARIOS.advanced.income, 10);
    assert.deepEqual([SCENARIOS.learning.victoryPoints, SCENARIOS.basic.victoryPoints, SCENARIOS.advanced.victoryPoints], [1, 2, 3]);
    assert.deepEqual(SCENARIOS.basic.bases, { A: ['ur'], B: ['nippur'] });
    assert.deepEqual(SCENARIOS.advanced.bases, { A: ['ur', 'eridu', 'larsa'], B: ['nippur', 'adab', 'akkad'] });
  });

  test('a new game has each side at 0 victory points; an unknown scenario is refused', () => {
    assert.deepEqual(started('basic').vp, { A: 0, B: 0 });
    assert.throws(() => createGame({ map: mapData, scenario: 'epic', players: ['ann', 'bob'] }), /epic/);
  });

  test('Basic and Learning keep only the middle base; Advanced keeps all six', () => {
    const bases = (s) => s.map.stars.filter((st) => st.baseOwner).map((st) => st.id).sort();
    assert.deepEqual(bases(started('basic')), ['nippur', 'ur']);
    assert.deepEqual(bases(started('advanced')), ['adab', 'akkad', 'eridu', 'larsa', 'nippur', 'ur']);
  });
});

describe('Basic scenario (§4.2)', () => {
  test('50 BP, all spent in the first Build event, on Warpships and/or Systemships with racks', () => {
    const s = started('basic');
    assert.deepEqual(s.bp, { A: 50, B: 50 });
    rejects(s, build('ann', [{ id: 'A1', design: { WG: true, PD: 10 }, at: 'ur' }]), 'BP_NOT_SPENT');
    const built = play(s, build('ann', [
      { id: 'A1', design: { WG: true, PD: 10, B: 10, S: 10, SR: 2 }, at: 'ur' }, // 37
      { id: 'S1', design: { PD: 5, B: 4, S: 4 }, at: 'ur' }, // 13
    ]));
    assert.equal(built.bp.A, 0);
    assert.equal(built.ships.S1.WG, false);
    assert.equal(built.step, 'movement');
  });

  test('no repair or resupply (§4.2)', () => {
    const s = started('basic');
    rejects(s, build('ann', [{ id: 'A1', design: { WG: true, PD: 45 }, at: 'ur' }], { repairs: { A1: { PD: 1 } } }), 'NO_REPAIR');
    rejects(s, build('ann', [{ id: 'A1', design: { WG: true, PD: 45 }, at: 'ur' }], { resupply: { A1: 1 } }), 'NO_REPAIR');
  });

  test('one Build event only: the second turn starts at Movement, ships stay Level 0 (D-011)', () => {
    let s = pass(started('basic'), 'ann', build('ann', [{ id: 'A1', design: { WG: true, PD: 45 }, at: 'ur' }]));
    s = pass(s, 'bob', build('bob', [{ id: 'B1', design: { WG: true, PD: 45 }, at: 'nippur' }]));
    assert.equal(s.turn, 2);
    assert.equal(s.step, 'movement');
    assert.equal(s.ships.A1.level, 0);
  });

  // ann's A1 (PD 45) reaches Nippur on game-turn 2 by Ur - Isin - Uruk, four hexes to Girsu, then
  // Girsu - Shuruppak - Adab - Nippur (9 MP). bob's B1 has left for Umma, so there is no combat.
  const occupying = () => {
    let s = pass(started('basic'), 'ann', build('ann', [{ id: 'A1', design: { WG: true, PD: 45 }, at: 'ur' }]));
    s = play(s, build('bob', [{ id: 'B1', design: { WG: true, PD: 45 }, at: 'nippur' }]), { type: 'move', player: 'bob', ship: 'B1', path: [jump('umma')] });
    s = play(s, { type: 'endMovement', player: 'bob' }, { type: 'endTurn', player: 'bob' });
    s = play(s, { type: 'move', player: 'ann', ship: 'A1', path: [jump('isin'), jump('uruk'), move(-1, 0), move(0, 0), move(1, 0), move(2, 0), jump('shuruppak'), jump('adab'), jump('nippur')] });
    s = pass(s, 'ann');
    return pass(s, 'bob');
  };

  test('two victory points win, as a running total (D-041): one at game-turn 3, the second at game-turn 4', () => {
    let s = occupying();
    assert.equal(s.turn, 3);
    assert.equal(s.step, 'movement');
    assert.deepEqual(s.vp, { A: 1, B: 0 });
    assert.equal(s.result, null);
    s = pass(pass(s, 'ann'), 'bob');
    assert.equal(s.step, 'over');
    assert.deepEqual(s.result, { winner: 'A', player: 'ann', victoryPoints: 2 });
  });

  test('points are kept after the base is left (D-041)', () => {
    let s = occupying();
    s = play(s, { type: 'move', player: 'ann', ship: 'A1', path: [jump('adab')] });
    s = pass(pass(s, 'ann'), 'bob');
    assert.deepEqual(s.vp, { A: 1, B: 0 });
    assert.equal(s.step, 'movement');
  });

  test('a draw when neither player has an effective ship (D-009, D-036)', () => {
    let s = pass(started('basic'), 'ann', build('ann', [{ id: 'A1', design: { WG: true, B: 45 }, at: 'ur' }]));
    s = pass(s, 'bob', build('bob', [{ id: 'B1', design: { WG: true, B: 45 }, at: 'nippur' }]));
    assert.equal(s.step, 'over');
    assert.deepEqual(s.result, { draw: true });
  });
});

describe('Advanced scenario: Build Points (§4.3, D-007)', () => {
  test('20 BP at the first Build event; BP may be saved; building is optional', () => {
    const s = started('advanced');
    assert.deepEqual(s.bp, { A: 20, B: 20 });
    const saved = play(s, build('ann', [{ id: 'A1', design: { WG: true, PD: 10 }, at: 'ur' }]));
    assert.equal(saved.bp.A, 5);
    assert.equal(play(s, build('ann')).bp.A, 20, 'an empty Build event spends nothing');
    rejects(s, build('ann', [{ id: 'A1', design: { WG: true, PD: 16 }, at: 'ur' }]), 'OVER_BP');
  });

  test('10 new BP at each later Build event of each player', () => {
    let s = pass(started('advanced'), 'ann', build('ann', [{ id: 'A1', design: { WG: true, PD: 10 }, at: 'ur' }]));
    s = pass(s, 'bob', build('bob'));
    assert.equal(s.turn, 2);
    assert.equal(s.step, 'build');
    assert.deepEqual(s.bp, { A: 15, B: 20 }, "ann's income comes in her own Build event; bob's in his");
    s = pass(s, 'ann', build('ann'));
    assert.deepEqual(s.bp, { A: 15, B: 30 });
  });

  test('new ships go on any of the three bases the player controls (D-013)', () => {
    const s = started('advanced');
    const built = play(s, build('ann', [
      { id: 'A1', design: { WG: true, PD: 1 }, at: 'eridu' },
      { id: 'A2', design: { WG: true, PD: 1 }, at: 'larsa' },
    ]));
    assert.deepEqual([built.ships.A1.q, built.ships.A1.r], [-9, -4]);
    assert.deepEqual([built.ships.A2.q, built.ships.A2.r], [-13, 4]);
    rejects(s, build('ann', [{ id: 'A1', design: { WG: true, PD: 1 }, at: 'adab' }]), 'NOT_A_BASE');
  });

  test('a ship built on game-turn 5 is Level 1 (§5.2)', () => {
    let s = started('advanced');
    for (let turn = 1; turn <= 4; turn++) s = pass(pass(s, 'ann', build('ann')), 'bob', build('bob'));
    assert.equal(s.turn, 5);
    s = play(s, build('ann', [{ id: 'A5', design: { WG: true, PD: 1 }, at: 'ur' }]));
    assert.equal(s.ships.A5.level, 1);
  });

  test('no draw in Advanced (§3 event 1): players can still build', () => {
    let s = pass(started('advanced'), 'ann', build('ann', [{ id: 'A1', design: { WG: true, B: 1 }, at: 'ur' }]));
    s = pass(s, 'bob', build('bob', [{ id: 'B1', design: { WG: true, B: 1 }, at: 'nippur' }]));
    assert.equal(s.step, 'build');
    assert.equal(s.result, null);
  });
});

describe('Advanced scenario: repair and resupply (§5.3)', () => {
  // ann builds on game-turn 1, then her ships are damaged (plain-data edits stand in for combat), and her
  // game-turn 2 Build event opens with the 5 BP she saved plus 10 BP income.
  const damagedAtBase = (ships, damage) => {
    let s = pass(started('advanced'), 'ann', build('ann', ships));
    for (const [id, edit] of Object.entries(damage)) Object.assign(s.ships[id], edit);
    s = pass(s, 'bob', build('bob'));
    assert.equal(s.step, 'build');
    return s;
  };

  test('the PD 7 ship damaged to PD 2 is repaired to 7 for 5 BP, and never past 7', () => {
    const s = damagedAtBase([{ id: 'A1', design: { WG: true, PD: 7, B: 3 }, at: 'ur' }], { A1: { PD: 2 } }); // 15 BP, 5 saved
    assert.equal(s.bp.A, 15);
    const repaired = play(s, build('ann', [], { repairs: { A1: { PD: 5 } } }));
    assert.equal(repaired.ships.A1.PD, 7);
    assert.equal(repaired.bp.A, 10);
    assert.equal(repaired.ships.A1.level, 0, 'its technological level remains what it originally was');
    rejects(s, build('ann', [], { repairs: { A1: { PD: 6 } } }), 'OVER_BUILT');
    assert.equal(play(s, build('ann', [], { repairs: { A1: { PD: 3 } } })).ships.A1.PD, 5, 'partial repair');
  });

  test('one BP resupplies three ships with one Missile each; fractions are not saved', () => {
    const sys = (id) => ({ id, design: { PD: 1, T: 1, M: 3 }, at: 'ur' }); // 3 BP each
    const s = damagedAtBase([sys('S1'), sys('S2'), sys('S3')], { S1: { M: 2 }, S2: { M: 2 }, S3: { M: 0 } }); // 11 saved + 10
    assert.equal(s.bp.A, 21);
    assert.equal(play(s, build('ann', [], { resupply: { S1: 1, S2: 1 } })).bp.A, 20);
    assert.equal(play(s, build('ann', [], { resupply: { S1: 1, S2: 1, S3: 1 } })).bp.A, 20);
    const four = play(s, build('ann', [], { resupply: { S1: 1, S2: 1, S3: 2 } }));
    assert.equal(four.bp.A, 19, 'four Missiles cost 2 BP');
    assert.equal(four.ships.S3.M, 2);
    rejects(s, build('ann', [], { resupply: { S1: 2 } }), 'OVER_BUILT');
  });

  test('Missiles come back by resupply, not repair', () => {
    const s = damagedAtBase([{ id: 'S1', design: { PD: 1, T: 1, M: 3 }, at: 'ur' }], { S1: { M: 0 } });
    rejects(s, build('ann', [], { repairs: { S1: { M: 3 } } }), 'BAD_REPAIR');
  });

  test('repairs and new ships are paid from the same Build Points', () => {
    const s = damagedAtBase([{ id: 'A1', design: { WG: true, PD: 7, B: 3 }, at: 'ur' }], { A1: { PD: 2 } });
    rejects(s, build('ann', [{ id: 'A2', design: { WG: true, PD: 6 } , at: 'ur' }], { repairs: { A1: { PD: 5 } } }), 'OVER_BP');
    const both = play(s, build('ann', [{ id: 'A2', design: { WG: true, PD: 5 }, at: 'ur' }], { repairs: { A1: { PD: 5 } } }));
    assert.equal(both.bp.A, 0);
  });

  test('only a ship that started the turn on one of its own bases (the Build event comes before movement)', () => {
    let s = damagedAtBase([{ id: 'A1', design: { WG: true, PD: 7, B: 3 }, at: 'ur' }], { A1: { PD: 2 } });
    const away = structuredClone(s);
    Object.assign(away.ships.A1, { q: -7, r: 0 }); // Isin
    rejects(away, build('ann', [], { repairs: { A1: { PD: 1 } } }), 'NOT_AT_BASE');
    const eridu = structuredClone(s);
    Object.assign(eridu.ships.A1, { q: -9, r: -4 });
    assert.equal(play(eridu, build('ann', [], { repairs: { A1: { PD: 1 } } })).ships.A1.PD, 3, 'any of its own bases');
    const enemyBase = structuredClone(s);
    Object.assign(enemyBase.ships.A1, { q: 11, r: 0 });
    rejects(enemyBase, build('ann', [], { repairs: { A1: { PD: 1 } } }), 'NOT_AT_BASE');
  });

  test('a Systemship may be repaired while loaded on a Warpship at a base', () => {
    let s = damagedAtBase([
      { id: 'W1', design: { WG: true, PD: 1, SR: 1 }, at: 'ur' }, // 7
      { id: 'S1', design: { PD: 2, B: 1 }, at: 'ur' }, // 3
    ], {});
    s = structuredClone(s);
    const { owner, q, r, ...record } = s.ships.S1;
    s.ships.W1.carrying = { S1: { ...record, PD: 0 } };
    delete s.ships.S1;
    const repaired = play(s, build('ann', [], { repairs: { S1: { PD: 2 } } }));
    assert.deepEqual(stats(repaired.ships.W1.carrying.S1), { PD: 2, B: 1, S: 0, T: 0, M: 0, SR: 0 });
  });

  test("only the player's own ships, with whole positive amounts", () => {
    let s = damagedAtBase([{ id: 'A1', design: { WG: true, PD: 7, B: 3 }, at: 'ur' }], { A1: { PD: 2 } });
    rejects(s, build('ann', [], { repairs: { X9: { PD: 1 } } }), 'UNKNOWN_SHIP');
    rejects(s, build('ann', [], { repairs: { A1: { PD: 0 } } }), 'BAD_REPAIR');
    rejects(s, build('ann', [], { repairs: { A1: { PD: 1.5 } } }), 'BAD_REPAIR');
    rejects(s, build('ann', [], { resupply: { A1: -1 } }), 'BAD_REPAIR');
    s = structuredClone(s);
    s.ships.B9 = { ...s.ships.A1, owner: 'B' };
    rejects(s, build('ann', [], { repairs: { B9: { PD: 1 } } }), 'NOT_YOUR_SHIP');
  });
});

describe('Advanced scenario: victory (§4.3, D-010, D-041)', () => {
  // Both build on game-turn 1; then ann's ship is placed on enemy bases (a plain-data edit stands in for moves).
  const holding = (bases) => {
    let s = pass(started('advanced'), 'ann', build('ann', [{ id: 'A1', design: { WG: true, PD: 1 }, at: 'ur' }, { id: 'A2', design: { WG: true, PD: 1 }, at: 'ur' }]));
    s = structuredClone(s);
    const at = { nippur: [11, 0], adab: [9, 4] };
    bases.forEach((b, i) => Object.assign(s.ships[`A${i + 1}`], { q: at[b][0], r: at[b][1] }));
    return pass(s, 'bob', build('bob'));
  };

  test('one enemy base held for three of your turns wins at the third', () => {
    let s = holding(['nippur']);
    assert.deepEqual(s.vp, { A: 1, B: 0 });
    s = pass(pass(s, 'ann', build('ann')), 'bob', build('bob'));
    assert.deepEqual(s.vp, { A: 2, B: 0 });
    s = pass(pass(s, 'ann', build('ann')), 'bob', build('bob'));
    assert.equal(s.step, 'over');
    assert.deepEqual(s.result, { winner: 'A', player: 'ann', victoryPoints: 3 });
  });

  test('two enemy bases count two points a turn', () => {
    let s = holding(['nippur', 'adab']);
    assert.deepEqual(s.vp, { A: 2, B: 0 });
    s = pass(pass(s, 'ann', build('ann')), 'bob', build('bob'));
    assert.deepEqual(s.result, { winner: 'A', player: 'ann', victoryPoints: 4 });
  });
});
