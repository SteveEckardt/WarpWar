import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, applyAction, previewMove, SCENARIOS } from '../src/engine/game.js';

// Phase 6b: turn sequence (§3), setup (§4), the Learning scenario (§4.1). Rulings D-007 to D-013, D-022.
// Expected values are worked out by hand from docs/rules/classic.md and docs/maps/classic-original.md.
const mapData = JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8'));
const newGame = () => createGame({ map: mapData, scenario: 'learning', players: ['ann', 'bob'] });

// Hexes on the original map (axial). Stars are named by id in jumps.
const URUK = { q: -2, r: 0 };
const GIRSU = { q: 2, r: 0 };
const NIPPUR = { q: 11, r: 0 };
const move = (q, r) => ({ type: 'move', to: { q, r } });
const jump = (to) => ({ type: 'jump', to });

// Applies actions in order; each must be accepted.
function play(state, ...actions) {
  for (const action of actions) {
    const r = applyAction(state, action);
    assert.equal(r.ok, true, `${action.type} by ${action.player} rejected: ${r.code}: ${r.message}`);
    state = r.state;
  }
  return state;
}

// The action must be rejected with the given code, and the state left as it was.
function rejects(state, action, code) {
  const before = structuredClone(state);
  const r = applyAction(state, action);
  assert.equal(r.ok, false, `${action.type} should be rejected with ${code}`);
  assert.equal(r.code, code, r.message);
  assert.deepEqual(state, before, 'a rejected action must not change the state');
}

const at = (state, id) => ({ q: state.ships[id].q, r: state.ships[id].r });
const stats = (s) => ({ PD: s.PD, B: s.B, S: s.S, T: s.T, M: s.M, SR: s.SR });

// --- Scripted Learning game won by A (ann) on game-turn 3 ---
// A1: WG, PD 12, B 12, S 11 = 40 BP. B1: WG, PD 10, B 10, S 5 = 30 BP. B2: WG, PD 3, B 2 = 10 BP.
const A1 = { WG: true, PD: 12, B: 12, S: 11 };
const B1 = { WG: true, PD: 10, B: 10, S: 5 };
const B2 = { WG: true, PD: 3, B: 2 };

const setupWin = () =>
  play(newGame(), { type: 'setFirstPlayer', player: 'ann' }, { type: 'chooseSide', player: 'bob', side: 'B' });

// Game-turn 1, A: build at Ur, jump Ur - Isin - Uruk (2 MP).
const winTurn1A = () =>
  play(
    setupWin(),
    { type: 'build', player: 'ann', ships: [{ id: 'A1', design: A1, at: 'ur' }] },
    { type: 'move', player: 'ann', ship: 'A1', path: [jump('isin'), jump('uruk')] },
    { type: 'endMovement', player: 'ann' },
  );

// Game-turn 1, B: build at Nippur, B1 jumps Nippur - Umma - Girsu and walks 4 hexes to Uruk (6 MP), where A1 stops it.
const winTurn1BMoved = () =>
  play(
    winTurn1A(),
    { type: 'endTurn', player: 'ann' },
    { type: 'build', player: 'bob', ships: [{ id: 'B1', design: B1, at: 'nippur' }, { id: 'B2', design: B2, at: 'nippur' }] },
    { type: 'move', player: 'bob', ship: 'B1', path: [jump('umma'), jump('girsu'), move(1, 0), move(0, 0), move(-1, 0), move(-2, 0)] },
    { type: 'endMovement', player: 'bob' },
  );

// Round 1 at Uruk. Both Attack at Drive 0: difference 0, CRT Attack/Attack (0, +1) = Hit + 2.
// A1 -> B1: Beam 10 + 2 = 12, B1 Screen 0: 12 effective. B1 -> A1: 10 + 2 = 12, A1 Screen 2: 10 effective.
const ROUND1_ORDERS = {
  ann: { A1: { tactic: 'attack', D: 0, B: 10, S: 2, T: 0, beamTarget: 'B1' } },
  bob: { B1: { tactic: 'attack', D: 0, B: 10, S: 0, T: 0, beamTarget: 'A1' } },
};
const winRound1Ordered = () =>
  play(
    winTurn1BMoved(),
    { type: 'chooseCombat', player: 'bob', star: 'uruk' },
    { type: 'orders', player: 'ann', orders: ROUND1_ORDERS.ann },
    { type: 'orders', player: 'bob', orders: ROUND1_ORDERS.bob },
  );

const winRound1Done = () =>
  play(
    winRound1Ordered(),
    { type: 'allocateHits', player: 'bob', allocations: { B1: { PD: 4, B: 3, S: 5 } } },
    { type: 'allocateHits', player: 'ann', allocations: { A1: { S: 9, PD: 1 } } },
  );

// Round 2. A1 (PD 11) Beam 11 + 2 = 13 hits on B1, which can take exactly 13 (PD 6, B 7, S 0): destroyed.
// B1 (PD 6) Beam 6 + 2 = 8 on A1, unscreened: 8 effective.
const winTurn1BDone = () =>
  play(
    winRound1Done(),
    { type: 'orders', player: 'bob', orders: { B1: { tactic: 'attack', D: 0, B: 6, S: 0, T: 0, beamTarget: 'A1' } } },
    { type: 'orders', player: 'ann', orders: { A1: { tactic: 'attack', D: 0, B: 11, S: 0, T: 0, beamTarget: 'B1' } } },
    { type: 'allocateHits', player: 'ann', allocations: { A1: { S: 2, B: 6 } } },
    { type: 'allocateHits', player: 'bob', allocations: { B1: { PD: 6, B: 7 } } },
  );

// Game-turn 2, A: A1 walks Uruk to Girsu (4), jumps Girsu - Umma - Nippur (2): 6 MP, stops on B2 at Nippur.
// B2 Retreats at Drive 3; A1 Attacks at Drive 0. Difference -3: Attack row "-3 or less" vs Retreating = Escapes.
const winTurn2ACombat = () =>
  play(
    winTurn1BDone(),
    { type: 'endTurn', player: 'bob' },
    { type: 'move', player: 'ann', ship: 'A1', path: [move(-1, 0), move(0, 0), move(1, 0), move(2, 0), jump('umma'), jump('nippur')] },
    { type: 'endMovement', player: 'ann' },
    { type: 'chooseCombat', player: 'ann', star: 'nippur' },
    { type: 'orders', player: 'ann', orders: { A1: { tactic: 'attack', D: 0, B: 6, S: 0, T: 0, beamTarget: 'B2' } } },
    { type: 'orders', player: 'bob', orders: { B2: { tactic: 'retreat', D: 3, B: 0, S: 0, T: 0 } } },
  );

describe('scripted Learning game: A wins by occupying Nippur (§4.1)', () => {
  test('setup: ann moves first, bob (second) picks side B, so ann is A', () => {
    const s = setupWin();
    assert.deepEqual(s.sides, { ann: 'A', bob: 'B' });
    assert.equal(s.turn, 1);
    assert.equal(s.active, 'A');
    assert.equal(s.step, 'build');
    assert.deepEqual(s.bp, { A: 40, B: 40 });
  });

  test('Learning uses only the middle bases, Ur and Nippur; the others are ordinary stars', () => {
    const s = setupWin();
    assert.deepEqual(s.bases, { A: ['ur'], B: ['nippur'] });
    const owner = (id) => s.map.stars.find((st) => st.id === id).baseOwner;
    assert.deepEqual(['ur', 'eridu', 'larsa', 'nippur', 'adab', 'akkad'].map(owner), ['A', null, null, 'B', null, null]);
  });

  test('turn 1, A: all 40 BP built and placed on Ur, then A1 moves to Uruk; no combat', () => {
    const s = winTurn1A();
    assert.equal(s.bp.A, 0);
    assert.deepEqual(stats(s.ships.A1), { PD: 12, B: 12, S: 11, T: 0, M: 0, SR: 0 });
    assert.equal(s.ships.A1.owner, 'A');
    assert.equal(s.ships.A1.level, 0); // D-011
    assert.deepEqual(at(s, 'A1'), URUK);
    assert.equal(s.step, 'rearrange'); // no contested star hex
  });

  test('turn 1, B: B1 and B2 built on Nippur; B1 is stopped at Uruk and combat begins', () => {
    const s = winTurn1BMoved();
    assert.equal(s.turn, 1);
    assert.equal(s.active, 'B');
    assert.equal(s.bp.B, 0);
    assert.deepEqual(at(s, 'B1'), URUK);
    assert.deepEqual(at(s, 'B2'), NIPPUR);
    assert.equal(s.step, 'combat');
    assert.deepEqual(s.contested, ['uruk']);
  });

  test('round 1: both owners must allocate their hits (12 on B1, 10 on A1)', () => {
    const s = winRound1Ordered();
    assert.equal(s.combat.stage, 'hits');
    assert.deepEqual(s.combat.owed, { A1: 10, B1: 12 });
  });

  test('round 1 applied: A1 PD 11, B 12, S 2; B1 PD 6, B 7, S 0', () => {
    const s = winRound1Done();
    assert.equal(s.combat.stage, 'orders');
    assert.equal(s.combat.round, 2);
    assert.deepEqual(stats(s.ships.A1), { PD: 11, B: 12, S: 2, T: 0, M: 0, SR: 0 });
    assert.deepEqual(stats(s.ships.B1), { PD: 6, B: 7, S: 0, T: 0, M: 0, SR: 0 });
  });

  test('round 2: B1 destroyed, A1 left with PD 11, B 6, S 0; combat over, on to rearrangement', () => {
    const s = winTurn1BDone();
    assert.equal(s.ships.B1, undefined);
    assert.deepEqual(stats(s.ships.A1), { PD: 11, B: 6, S: 0, T: 0, M: 0, SR: 0 });
    assert.deepEqual(s.lastRound.destroyed, ['B1']);
    assert.deepEqual(s.lastRound.end, { reason: 'all destroyed', owners: ['B'] });
    assert.equal(s.combat, null);
    assert.equal(s.step, 'rearrange');
  });

  test('turn 2, A: no victory point yet; Build is skipped in Learning after the first turn', () => {
    const s = play(winTurn1BDone(), { type: 'endTurn', player: 'bob' });
    assert.equal(s.turn, 2);
    assert.equal(s.active, 'A');
    assert.equal(s.step, 'movement');
    assert.equal(s.result, null);
  });

  test('turn 2, A: B2 escapes from Nippur and bob places it on an adjacent hex (D-022)', () => {
    let s = winTurn2ACombat();
    assert.equal(s.combat.stage, 'retreats');
    assert.deepEqual(Object.keys(s.combat.retreating), ['B2']);
    s = play(s, { type: 'placeRetreats', player: 'bob', destinations: { B2: { q: 12, r: 0 } } });
    assert.deepEqual(at(s, 'B2'), { q: 12, r: 0 });
    assert.deepEqual(at(s, 'A1'), NIPPUR);
    assert.equal(s.step, 'rearrange');
  });

  test('turn 3, A: A1 occupies Nippur at the start of the turn: one victory point wins (§3 event 1, D-010)', () => {
    let s = play(
      winTurn2ACombat(),
      { type: 'placeRetreats', player: 'bob', destinations: { B2: { q: 12, r: 0 } } },
      { type: 'endTurn', player: 'ann' },
    );
    assert.equal(s.active, 'B');
    assert.equal(s.result, null); // B occupies nothing; B2 is still effective
    s = play(s, { type: 'endMovement', player: 'bob' }, { type: 'endTurn', player: 'bob' });
    assert.equal(s.turn, 3);
    assert.equal(s.step, 'over');
    assert.deepEqual(s.result, { winner: 'A', player: 'ann', victoryPoints: 1 });
    rejects(s, { type: 'endMovement', player: 'ann' }, 'GAME_OVER');
  });
});

// --- Scripted Learning game ending in a draw ---
// ann moves first; bob (second) picks side A, so ann is B. Both build X: WG, PD 10, B 10, S 15 = 40 BP.
const X = { WG: true, PD: 10, B: 10, S: 15 };
const idle = { tactic: 'attack', D: 0, B: 0, S: 0, T: 0 };

const drawCombat = () =>
  play(
    newGame(),
    { type: 'setFirstPlayer', player: 'ann' },
    { type: 'chooseSide', player: 'bob', side: 'A' },
    { type: 'build', player: 'ann', ships: [{ id: 'B1', design: X, at: 'nippur' }] },
    { type: 'move', player: 'ann', ship: 'B1', path: [jump('umma'), jump('girsu')] },
    { type: 'endMovement', player: 'ann' },
    { type: 'endTurn', player: 'ann' },
    { type: 'build', player: 'bob', ships: [{ id: 'A1', design: X, at: 'ur' }] },
    { type: 'move', player: 'bob', ship: 'A1', path: [jump('isin'), jump('uruk'), move(-1, 0), move(0, 0), move(1, 0), move(2, 0)] },
    { type: 'endMovement', player: 'bob' },
    { type: 'chooseCombat', player: 'bob', star: 'girsu' },
    // Round 1: Hit + 2 both ways, 12 effective each. Both owners take 10 on PD, 2 on Screens.
    { type: 'orders', player: 'bob', orders: { A1: { tactic: 'attack', D: 0, B: 10, S: 0, T: 0, beamTarget: 'B1' } } },
    { type: 'orders', player: 'ann', orders: { B1: { tactic: 'attack', D: 0, B: 10, S: 0, T: 0, beamTarget: 'A1' } } },
    { type: 'allocateHits', player: 'bob', allocations: { A1: { PD: 10, S: 2 } } },
    { type: 'allocateHits', player: 'ann', allocations: { B1: { PD: 10, S: 2 } } },
    // Rounds 2-4: neither ship has power, so nothing is damaged.
    { type: 'orders', player: 'bob', orders: { A1: idle } },
    { type: 'orders', player: 'ann', orders: { B1: idle } },
    { type: 'orders', player: 'bob', orders: { A1: idle } },
    { type: 'orders', player: 'ann', orders: { B1: idle } },
    { type: 'orders', player: 'bob', orders: { A1: idle } },
    { type: 'orders', player: 'ann', orders: { B1: idle } },
  );

describe('scripted Learning game: a draw (D-009)', () => {
  test('setup: the second player picked A, so the first player is B and moves first', () => {
    const s = play(newGame(), { type: 'setFirstPlayer', player: 'ann' }, { type: 'chooseSide', player: 'bob', side: 'A' });
    assert.deepEqual(s.sides, { ann: 'B', bob: 'A' });
    assert.equal(s.active, 'B');
  });

  test('three rounds without damage: bob, whose turn it is, must withdraw (§7 step 6(c))', () => {
    const s = drawCombat();
    assert.equal(s.combat.stage, 'withdraw');
    assert.equal(s.combat.hex.quietRounds, 3);
    assert.deepEqual(stats(s.ships.A1), { PD: 0, B: 10, S: 13, T: 0, M: 0, SR: 0 });
    assert.deepEqual(stats(s.ships.B1), { PD: 0, B: 10, S: 13, T: 0, M: 0, SR: 0 });
  });

  test('neither player has an effective ship at the start of the next player-turn: draw', () => {
    let s = play(drawCombat(), { type: 'withdraw', player: 'bob', destinations: { A1: { q: 1, r: 0 } } });
    assert.deepEqual(at(s, 'A1'), { q: 1, r: 0 });
    assert.deepEqual(at(s, 'B1'), GIRSU);
    assert.equal(s.step, 'rearrange');
    s = play(s, { type: 'endTurn', player: 'bob' });
    assert.equal(s.turn, 2);
    assert.equal(s.step, 'over');
    assert.deepEqual(s.result, { draw: true });
  });
});

describe('illegal actions: setup (§4)', () => {
  test('the second player must choose a side, and only A or B', () => {
    const s = play(newGame(), { type: 'setFirstPlayer', player: 'ann' });
    rejects(s, { type: 'chooseSide', player: 'ann', side: 'A' }, 'WRONG_PLAYER');
    rejects(s, { type: 'chooseSide', player: 'bob', side: 'C' }, 'BAD_SIDE');
  });

  test('unknown players and out-of-order setup actions', () => {
    const s = newGame();
    rejects(s, { type: 'setFirstPlayer', player: 'cy' }, 'UNKNOWN_PLAYER');
    rejects(s, { type: 'chooseSide', player: 'bob', side: 'A' }, 'OUT_OF_ORDER');
    rejects(s, { type: 'build', player: 'ann', ships: [] }, 'OUT_OF_ORDER');
    rejects(s, { type: 'warp', player: 'ann' }, 'UNKNOWN_ACTION');
  });

  test('only the Learning scenario is built', () => {
    assert.throws(() => createGame({ map: mapData, scenario: 'basic', players: ['ann', 'bob'] }), /learning/i);
  });
});

describe('illegal actions: Build (§3 event 2, §4.1, D-012, D-013)', () => {
  const s = setupWin();
  const build = (ships, player = 'ann') => ({ type: 'build', player, ships });

  test('only the active player builds', () => {
    rejects(s, build([{ id: 'B1', design: A1, at: 'nippur' }], 'bob'), 'NOT_YOUR_TURN');
  });

  test('all 40 BP must be spent, no more', () => {
    rejects(s, build([{ id: 'A1', design: { WG: true, PD: 10, B: 10 }, at: 'ur' }]), 'BP_NOT_SPENT');
    rejects(s, build([{ id: 'A1', design: { WG: true, PD: 20, B: 20 }, at: 'ur' }]), 'OVER_BP');
  });

  test('Warpships only, and no Systemship Racks in Learning', () => {
    rejects(s, build([{ id: 'S1', design: { PD: 20, B: 20 }, at: 'ur' }]), 'WARPSHIPS_ONLY');
    rejects(s, build([{ id: 'A1', design: { WG: true, PD: 12, B: 12, S: 10, SR: 1 }, at: 'ur' }]), 'NO_SR_IN_LEARNING');
  });

  test('new ships go on the middle base only: Eridu is an ordinary star in Learning', () => {
    rejects(s, build([{ id: 'A1', design: A1, at: 'eridu' }]), 'NOT_A_BASE');
    rejects(s, build([{ id: 'A1', design: A1, at: 'nippur' }]), 'NOT_A_BASE');
  });

  test('ship ids must be unique', () => {
    const half = { WG: true, PD: 8, B: 7 };
    rejects(s, build([{ id: 'A1', design: half, at: 'ur' }, { id: 'A1', design: half, at: 'ur' }]), 'DUPLICATE_ID');
  });

  test('a base star with enemy ships on it is not controlled (D-013)', () => {
    const occupied = structuredClone(s);
    occupied.ships.X9 = { owner: 'B', WG: true, level: 0, PD: 1, B: 0, S: 0, T: 0, M: 0, SR: 0, built: {}, q: -11, r: 0 };
    rejects(occupied, build([{ id: 'A1', design: A1, at: 'ur' }]), 'BASE_NOT_CONTROLLED');
  });

  test('moving or ending movement before building is out of order', () => {
    rejects(s, { type: 'endMovement', player: 'ann' }, 'OUT_OF_ORDER');
    rejects(s, { type: 'endTurn', player: 'ann' }, 'OUT_OF_ORDER');
  });
});

describe('illegal actions: Movement (§6, D-008)', () => {
  const s = play(setupWin(), { type: 'build', player: 'ann', ships: [{ id: 'A1', design: A1, at: 'ur' }] });

  test('a path the Phase 5 validator rejects is rejected', () => {
    const far = [jump('isin'), jump('uruk'), ...[-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((q) => move(q, 0))];
    rejects(s, { type: 'move', player: 'ann', ship: 'A1', path: far }, 'OVER_MP');
  });

  test('no ship may enter an enemy base on game-turn 1, but inactive bases are ordinary stars (D-008, §4.1)', () => {
    const bob = play(
      s,
      { type: 'endMovement', player: 'ann' },
      { type: 'endTurn', player: 'ann' },
      { type: 'build', player: 'bob', ships: [{ id: 'B1', design: { WG: true, PD: 35 }, at: 'nippur' }] },
    );
    const toUr = [jump('umma'), jump('girsu'), ...[1, 0, -1, -2].map((q) => move(q, 0)), jump('isin'), jump('ur')];
    rejects(bob, { type: 'move', player: 'bob', ship: 'B1', path: toUr }, 'FIRST_TURN_BASE');
    const toLarsa = [jump('umma'), jump('girsu'), ...[1, 0, -1, -2].map((q) => move(q, 0)), jump('borsippa'), jump('larsa')];
    play(bob, { type: 'move', player: 'bob', ship: 'B1', path: toLarsa });
  });

  test('a player moves only their own Warpships, each once', () => {
    rejects(s, { type: 'move', player: 'ann', ship: 'B1', path: [] }, 'UNKNOWN_SHIP');
    const moved = play(s, { type: 'move', player: 'ann', ship: 'A1', path: [jump('isin')] });
    rejects(moved, { type: 'move', player: 'ann', ship: 'A1', path: [jump('uruk')] }, 'ALREADY_MOVED');
    rejects(moved, { type: 'move', player: 'bob', ship: 'A1', path: [] }, 'NOT_YOUR_TURN');
  });

  test('combat and turn-end actions during movement are out of order', () => {
    rejects(s, { type: 'chooseCombat', player: 'ann', star: 'uruk' }, 'OUT_OF_ORDER');
    rejects(s, { type: 'endTurn', player: 'ann' }, 'OUT_OF_ORDER');
    rejects(s, { type: 'build', player: 'ann', ships: [] }, 'OUT_OF_ORDER');
  });
});

describe('previewMove: the same check the move action makes', () => {
  test('a legal path: cost and end, nothing changed', () => {
    const s = play(setupWin(), { type: 'build', player: 'ann', ships: [{ id: 'A1', design: A1, at: 'ur' }] });
    const before = structuredClone(s);
    const r = previewMove(s, 'A1', [jump('isin'), jump('uruk')]);
    assert.deepEqual(r.errors, []);
    assert.equal(r.cost, 2);
    assert.deepEqual(r.end, URUK);
    assert.deepEqual(s, before);
  });

  test('sees the other ships: must stop on a star with an enemy ship (§6.1 rule 1)', () => {
    const s = play(winTurn1A(), { type: 'endTurn', player: 'ann' }, { type: 'build', player: 'bob', ships: [{ id: 'B1', design: B1, at: 'nippur' }, { id: 'B2', design: B2, at: 'nippur' }] });
    const path = [jump('umma'), jump('girsu'), move(1, 0), move(0, 0), move(-1, 0), move(-2, 0)];
    assert.deepEqual(previewMove(s, 'B1', path).errors, []);
    assert.deepEqual(previewMove(s, 'B1', [...path, move(-3, 0)]).errors.map((e) => e.code), ['MUST_STOP']);
  });

  test('an unknown ship is null', () => {
    assert.equal(previewMove(setupWin(), 'nope', []), null);
  });
});

describe('illegal actions: Combat (§7, D-022)', () => {
  test('the phasing player picks the contested star; only a contested star', () => {
    const s = winTurn1BMoved();
    rejects(s, { type: 'chooseCombat', player: 'ann', star: 'uruk' }, 'NOT_YOUR_TURN');
    rejects(s, { type: 'chooseCombat', player: 'bob', star: 'girsu' }, 'NOT_CONTESTED');
    rejects(s, { type: 'orders', player: 'bob', orders: ROUND1_ORDERS.bob }, 'OUT_OF_ORDER');
    rejects(s, { type: 'endTurn', player: 'bob' }, 'OUT_OF_ORDER');
    rejects(s, { type: 'move', player: 'bob', ship: 'B2', path: [] }, 'OUT_OF_ORDER');
  });

  test('orders: own ships only, every own ship, legal per §7.1, once per round', () => {
    const s = play(winTurn1BMoved(), { type: 'chooseCombat', player: 'bob', star: 'uruk' });
    rejects(s, { type: 'orders', player: 'bob', orders: { ...ROUND1_ORDERS.bob, ...ROUND1_ORDERS.ann } }, 'NOT_YOUR_SHIP');
    rejects(s, { type: 'orders', player: 'bob', orders: {} }, 'MISSING_ORDER');
    rejects(s, { type: 'orders', player: 'bob', orders: { B1: { tactic: 'attack', D: 5, B: 10, S: 0, T: 0 } } }, 'OVER_PD');
    rejects(s, { type: 'orders', player: 'bob', orders: { B1: { tactic: 'attack', D: 0, B: 1, beamTarget: 'B2' } } }, 'BAD_TARGET');
    const once = play(s, { type: 'orders', player: 'bob', orders: ROUND1_ORDERS.bob });
    rejects(once, { type: 'orders', player: 'bob', orders: ROUND1_ORDERS.bob }, 'ALREADY_SUBMITTED');
    rejects(once, { type: 'allocateHits', player: 'bob', allocations: { B1: { PD: 12 } } }, 'OUT_OF_ORDER');
  });

  test('hit allocations: own ships that owe hits, each the exact total', () => {
    const s = winRound1Ordered();
    rejects(s, { type: 'allocateHits', player: 'bob', allocations: { B1: { PD: 11 } } }, 'BAD_ALLOCATION');
    rejects(s, { type: 'allocateHits', player: 'bob', allocations: { B1: { PD: 11, B: 1 }, A1: { S: 10 } } }, 'NOT_YOUR_SHIP');
    rejects(s, { type: 'allocateHits', player: 'bob', allocations: {} }, 'MISSING_ALLOCATION');
    rejects(s, { type: 'orders', player: 'bob', orders: ROUND1_ORDERS.bob }, 'OUT_OF_ORDER');
    const once = play(s, { type: 'allocateHits', player: 'bob', allocations: { B1: { PD: 10, S: 2 } } });
    rejects(once, { type: 'allocateHits', player: 'bob', allocations: { B1: { PD: 10, S: 2 } } }, 'ALREADY_SUBMITTED');
  });

  test('retreat hexes: the retreating owner picks an adjacent hex, not a star with enemy ships (D-022)', () => {
    const s = winTurn2ACombat();
    rejects(s, { type: 'placeRetreats', player: 'ann', destinations: { B2: { q: 12, r: 0 } } }, 'NOT_YOUR_SHIP');
    rejects(s, { type: 'placeRetreats', player: 'bob', destinations: { B2: { q: 13, r: 0 } } }, 'NOT_ADJACENT');
    rejects(s, { type: 'placeRetreats', player: 'bob', destinations: {} }, 'MISSING_DESTINATION');
    rejects(s, { type: 'endTurn', player: 'ann' }, 'OUT_OF_ORDER');
    // A star next to Nippur with an A ship on it (added to the plain-data state for this check).
    const crowded = structuredClone(s);
    crowded.map.stars.push({ id: 'x', name: 'X', q: 12, r: -1, baseOwner: null });
    crowded.ships.A9 = { ...crowded.ships.A1, q: 12, r: -1 };
    rejects(crowded, { type: 'placeRetreats', player: 'bob', destinations: { B2: { q: 12, r: -1 } } }, 'ENEMY_STAR');
  });

  test('retreat and withdrawal hexes must be on the map (D-040)', () => {
    // Bounds pulled in so that column 12 (q 12, r 0, next to Nippur) is off the map.
    const s = winTurn2ACombat();
    s.map.bounds = { x: [-13, 11], r: [-8, 8] };
    rejects(s, { type: 'placeRetreats', player: 'bob', destinations: { B2: { q: 12, r: 0 } } }, 'OFF_MAP');
    play(s, { type: 'placeRetreats', player: 'bob', destinations: { B2: { q: 10, r: 1 } } });
    // Forced withdrawal from Girsu (column 2) with column 3 cut off.
    const w = drawCombat();
    w.map.bounds = { x: [-13, 2], r: [-8, 8] };
    rejects(w, { type: 'withdraw', player: 'bob', destinations: { A1: { q: 3, r: 0 } } }, 'OFF_MAP');
    play(w, { type: 'withdraw', player: 'bob', destinations: { A1: { q: 1, r: 0 } } });
  });

  test('a retreat may not end on the enemy base on game-turn 1 (D-022)', () => {
    // B1 Retreats on round 1 at Uruk; an A base star is placed next to Uruk for this check.
    let s = play(winTurn1BMoved(), { type: 'chooseCombat', player: 'bob', star: 'uruk' });
    s.map.stars.push({ id: 'y', name: 'Y', q: -3, r: 0, baseOwner: 'A' });
    s.bases.A.push('y');
    s = play(
      s,
      { type: 'orders', player: 'ann', orders: { A1: { tactic: 'attack', D: 0, B: 1, S: 0, T: 0, beamTarget: 'B1' } } },
      { type: 'orders', player: 'bob', orders: { B1: { tactic: 'retreat', D: 10, B: 0, S: 0, T: 0 } } },
    );
    assert.equal(s.combat.stage, 'retreats');
    rejects(s, { type: 'placeRetreats', player: 'bob', destinations: { B1: { q: -3, r: 0 } } }, 'FIRST_TURN_BASE');
    play(s, { type: 'placeRetreats', player: 'bob', destinations: { B1: { q: -2, r: 1 } } });
  });

  test('forced withdrawal: only the phasing player, to adjacent hexes, every ship placed (§7 step 6(c), D-022)', () => {
    const s = drawCombat();
    rejects(s, { type: 'withdraw', player: 'ann', destinations: { B1: { q: 3, r: 0 } } }, 'NOT_YOUR_TURN');
    rejects(s, { type: 'withdraw', player: 'bob', destinations: { A1: { q: 0, r: 0 } } }, 'NOT_ADJACENT');
    rejects(s, { type: 'withdraw', player: 'bob', destinations: {} }, 'MISSING_DESTINATION');
    rejects(s, { type: 'orders', player: 'bob', orders: { A1: idle } }, 'OUT_OF_ORDER');
  });
});

describe('Systemship rearrangement (§3 event 5, §8)', () => {
  // Learning has no Systemships; the event is still wired. A carrier and a Systemship are added to the
  // plain-data state to show it.
  const withCargo = () => {
    const s = winTurn1A();
    const rec = { WG: false, level: 0, PD: 2, B: 1, S: 0, T: 0, M: 0, SR: 0, built: {} };
    s.ships.S1 = { ...rec, owner: 'A', q: -2, r: 0 };
    s.ships.A1 = { ...s.ships.A1, SR: 1 };
    return s;
  };

  test('a player may load a Systemship onto a Warpship at a star hex', () => {
    const s = play(withCargo(), { type: 'rearrange', player: 'ann', star: 'uruk', assignment: { A1: ['S1'] } });
    assert.equal(s.ships.S1, undefined);
    assert.deepEqual(Object.keys(s.ships.A1.carrying), ['S1']);
    assert.equal(s.step, 'rearrange');
  });

  test('illegal rearrangements and out-of-order actions are rejected', () => {
    const s = withCargo();
    rejects(s, { type: 'rearrange', player: 'ann', star: 'uruk', assignment: { A1: ['S7'] } }, 'BAD_REARRANGEMENT');
    rejects(s, { type: 'rearrange', player: 'ann', star: 'nippur', assignment: {} }, 'NO_SHIPS_HERE');
    rejects(s, { type: 'rearrange', player: 'bob', star: 'uruk', assignment: {} }, 'NOT_YOUR_TURN');
    rejects(s, { type: 'move', player: 'ann', ship: 'A1', path: [] }, 'OUT_OF_ORDER');
    rejects(s, { type: 'endMovement', player: 'ann' }, 'OUT_OF_ORDER');
  });
});

describe('End of turn (§3 event 6, D-007)', () => {
  test('only the active player ends the turn; the game-turn advances after both have played', () => {
    const s = winTurn1A();
    rejects(s, { type: 'endTurn', player: 'bob' }, 'NOT_YOUR_TURN');
    const b = play(s, { type: 'endTurn', player: 'ann' });
    assert.equal(b.turn, 1);
    assert.equal(b.active, 'B');
    assert.equal(b.step, 'build');
  });

  test('applyAction does not change the state it was given', () => {
    const s = winTurn1A();
    const before = structuredClone(s);
    applyAction(s, { type: 'endTurn', player: 'ann' });
    assert.deepEqual(s, before);
  });
});

describe('Learning bases are named by the scenario, not computed (§4.1)', () => {
  test('the scenario names Ur for A and Nippur for B', () => {
    assert.deepEqual(SCENARIOS.learning.bases, { A: ['ur'], B: ['nippur'] });
  });

  test('the shipped map agrees: Ur is an A base star and Nippur a B base star', () => {
    // Fails if data/maps/classic-original.json changes these stars without the scenario changing too.
    const star = (id) => mapData.stars.find((s) => s.id === id);
    assert.equal(star('ur')?.baseOwner, 'A');
    assert.equal(star('nippur')?.baseOwner, 'B');
    assert.deepEqual(newGame().bases, { A: ['ur'], B: ['nippur'] });
  });

  test('a map that disagrees with the scenario is refused', () => {
    const missing = structuredClone(mapData);
    missing.stars.find((s) => s.id === 'ur').id = 'ur2';
    missing.warplines = missing.warplines.map((line) => line.map((id) => (id === 'ur' ? 'ur2' : id)));
    assert.throws(() => createGame({ map: missing, scenario: 'learning', players: ['ann', 'bob'] }), /ur, which is not on the map/);
    const swapped = structuredClone(mapData);
    swapped.stars.find((s) => s.id === 'nippur').baseOwner = 'A';
    assert.throws(() => createGame({ map: swapped, scenario: 'learning', players: ['ann', 'bob'] }), /nippur as a side B base/);
  });
});

describe('Draw and victory at the start of a turn (D-036, D-037, D-038)', () => {
  test('no draw check until both players have built: ann builds only ineffective ships (D-036)', () => {
    const s = play(
      setupWin(),
      { type: 'build', player: 'ann', ships: [{ id: 'A1', design: { WG: true, PD: 0, B: 35 }, at: 'ur' }] },
      { type: 'endMovement', player: 'ann' },
      { type: 'endTurn', player: 'ann' },
    );
    assert.equal(s.result, null);
    assert.equal(s.step, 'build');
  });

  test('victory is checked first and wins over a draw (D-037)', () => {
    // A1 sits on Nippur with PD 0 and B2 has PD 0: nobody is effective, but A occupies B's base.
    const s = structuredClone(winTurn1BDone());
    s.ships.A1 = { ...s.ships.A1, PD: 0, q: 11, r: 0 };
    s.ships.B2 = { ...s.ships.B2, PD: 0 };
    const t = play(s, { type: 'endTurn', player: 'bob' });
    assert.deepEqual(t.result, { winner: 'A', player: 'ann', victoryPoints: 1 });
  });

  // After the draw script's withdrawal both Warpships have PD 0. A carried Systemship decides it.
  const withdrawn = () => play(drawCombat(), { type: 'withdraw', player: 'bob', destinations: { A1: { q: 1, r: 0 } } });
  const carrying = (s, design) => {
    s.ships.A1.carrying = { S1: { WG: false, level: 0, PD: 0, B: 0, S: 0, T: 0, M: 0, SR: 0, ...design, built: {} } };
    return s;
  };

  test('a carried Systemship with PD 1 and a Beam is effective, so no draw (D-038)', () => {
    const s = play(carrying(withdrawn(), { PD: 1, B: 1 }), { type: 'endTurn', player: 'bob' });
    assert.equal(s.result, null);
  });

  test('a carried Systemship with Tubes and Missiles is effective; with PD but no weapon it is not (D-038)', () => {
    assert.equal(play(carrying(withdrawn(), { PD: 1, T: 1, M: 1 }), { type: 'endTurn', player: 'bob' }).result, null);
    const t = play(carrying(withdrawn(), { PD: 3, S: 2 }), { type: 'endTurn', player: 'bob' });
    assert.deepEqual(t.result, { draw: true });
    const u = play(carrying(withdrawn(), { PD: 1, T: 1, M: 0 }), { type: 'endTurn', player: 'bob' });
    assert.deepEqual(u.result, { draw: true });
  });
});

describe('Victory points count only active enemy bases (D-010, §4.1)', () => {
  test('a ship on Adab (an ordinary star in Learning) scores nothing', () => {
    const s = structuredClone(winTurn1BDone());
    s.ships.A1 = { ...s.ships.A1, q: 9, r: 4 }; // Adab
    const t = play(s, { type: 'endTurn', player: 'bob' });
    assert.equal(t.result, null);
    assert.equal(t.step, 'movement');
  });
});
