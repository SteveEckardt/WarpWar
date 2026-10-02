import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, applyAction, MODULES } from '../src/engine/game.js';
import { validateShip, shipCost } from '../src/engine/ships.js';
import { createHex, validateOrder, hitsOwed, resolveRound, incomingMissiles, needsEcm, checkEcm } from '../src/engine/combat.js';

// Phase 8d: the ECM module (fan §7.1.1, §7.2, §5.1, §5.2, §5.6). Rulings D-052 (raise or lower, never below 1),
// D-053 (tech-level modifier only on Missiles given ECM), D-054 (Advanced only).
const mapData = JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8'));
const codes = (errors) => errors.map((e) => e.code);

function play(state, ...actions) {
  for (const action of actions) {
    const r = applyAction(state, action);
    assert.equal(r.ok, true, `${action.type} by ${action.player} rejected: ${r.code}: ${r.message}`);
    state = r.state;
  }
  return state;
}

const mk = (owner, stats, { WG = true, level = 0 } = {}) => {
  const full = { PD: 0, B: 0, S: 0, T: 0, M: 0, SR: 0, ...stats };
  return { owner, WG, level, ...full, built: { ...full } };
};

describe('the module (D-054)', () => {
  test('ecm is a module, for Advanced games only', () => {
    assert.ok(MODULES.includes('ecm'));
    assert.deepEqual(createGame({ map: mapData, scenario: 'advanced', players: ['ann', 'bob'], modules: ['ecm'] }).modules, ['ecm']);
    for (const scenario of ['learning', 'basic']) {
      assert.throws(() => createGame({ map: mapData, scenario, players: ['ann', 'bob'], modules: ['ecm'] }), /Advanced only \(D-054\)/);
    }
  });

  test('E is an attribute only with the module; 1 BP a point', () => {
    assert.deepEqual(codes(validateShip({ WG: true, PD: 1, E: 1 }, 'advanced')), ['UNKNOWN_ATTRIBUTE']);
    assert.deepEqual(validateShip({ PD: 7, B: 5, S: 5, E: 3 }, 'advanced', ['ecm']), []);
    assert.equal(shipCost({ PD: 7, B: 5, S: 5, E: 3 }), 20, 'S20: TL0 PD=7 B=5 S=5 E=3 costs 20 BP (fan §3.3.1)');
  });
});

describe('powering ECM (fan §5.1, §5.2)', () => {
  test('ECM is powered from PD, up to the ECM built, with any other system', () => {
    const w4 = mk('A', { PD: 6, B: 3, S: 2, T: 1, M: 3, E: 1 });
    assert.deepEqual(codes(validateOrder(w4, { tactic: 'attack', D: 2, B: 2, S: 1, T: 0, E: 1, beamTarget: 'X' })), [], 'W4: ATTACK D=2 B=2 S=1 E=1');
    assert.deepEqual(codes(validateOrder(w4, { tactic: 'attack', D: 3, B: 2, S: 1, T: 0, E: 1, beamTarget: 'X' })), ['OVER_PD']);
    assert.deepEqual(codes(validateOrder(w4, { tactic: 'attack', D: 0, B: 0, S: 0, T: 0, E: 2 })), ['OVER_ECM']);
  });
});

describe('spreading ECM over incoming Missiles (fan §7.1.1, D-052, D-053)', () => {
  // The fan ECM example: a TL2 ship, attacking at Drive 3 with 2 PD on ECM, is attacked by a TL3 Missile at Drive 3.
  const example = () => createHex({ X: mk('A', { PD: 6, E: 2 }, { level: 2 }), Y: mk('B', { PD: 2, T: 1, M: 3 }, { level: 3 }) });
  const orders = {
    X: { tactic: 'attack', D: 3, B: 0, S: 0, T: 0, E: 2 },
    Y: { tactic: 'dodge', D: 0, B: 0, S: 0, T: 1, missiles: [{ target: 'X', drive: 3 }] },
  };

  test('the Missiles a ship faces, and which sides have ECM to spread', () => {
    assert.deepEqual(incomingMissiles(example(), orders, 'X'), [{ ref: 'Y:0', from: 'Y', drive: 3, level: 3 }]);
    assert.deepEqual(needsEcm(example(), orders), ['A']);
    assert.deepEqual(needsEcm(example(), { ...orders, X: { ...orders.X, E: 0 } }), []);
  });

  test('2 points less 1 for the tech gap is 1 working point: Drive 3 down to 2, Hit +2 becomes Hit', () => {
    assert.equal(hitsOwed(example(), orders).shots[0].damage, 2 + 3 + 2, 'without ECM: Hit +2, TL3 Missile');
    const ecm = { X: { 'Y:0': { points: 2, shift: -1 } } };
    checkEcm(example(), orders, 'A', ecm);
    const [shot] = hitsOwed(example(), orders, ecm).shots;
    assert.deepEqual([shot.result, shot.bonus, shot.damage, shot.ecm], ['hit', 0, 2 + 3, -1]);
  });

  test('no more than the working points; up as well as down (D-052)', () => {
    assert.throws(() => checkEcm(example(), orders, 'A', { X: { 'Y:0': { points: 2, shift: -2 } } }), /1 working point/);
    const level = () => createHex({ X: mk('A', { PD: 6, E: 2 }), Y: mk('B', { PD: 2, T: 1, M: 3 }) });
    const up = { X: { 'Y:0': { points: 2, shift: 2 } } };
    checkEcm(level(), orders, 'A', up);
    const far = { ...orders, X: { ...orders.X, D: 0 } };
    assert.equal(hitsOwed(level(), far, { X: { 'Y:0': { points: 2, shift: 2 } } }).shots[0].result, 'miss', 'Drive 5 against 0: +5 or more, a Miss');
  });

  test('a working point need not be used; the Drive never goes below 1 (D-052)', () => {
    const level = createHex({ X: mk('A', { PD: 6, E: 2 }), Y: mk('B', { PD: 2, T: 1, M: 3 }) });
    checkEcm(level, orders, 'A', { X: { 'Y:0': { points: 2, shift: 0 } } });
    const slow = { ...orders, Y: { ...orders.Y, missiles: [{ target: 'X', drive: 1 }] } };
    assert.throws(() => checkEcm(level, slow, 'A', { X: { 'Y:0': { points: 1, shift: -1 } } }), /below 1/);
  });

  test('W4: one point against a TL1 Missile from a TL0 ship is worth nothing (fan §5.5.1)', () => {
    const hex = createHex({ W4: mk('A', { PD: 6, E: 1 }), S35: mk('B', { PD: 6, T: 2, M: 9 }, { level: 1 }) });
    const o = { W4: { tactic: 'attack', D: 2, B: 0, S: 0, T: 0, E: 1 }, S35: { tactic: 'dodge', D: 4, B: 0, S: 0, T: 2, missiles: [{ target: 'W4', drive: 3 }, { target: 'W4', drive: 4 }] } };
    checkEcm(hex, o, 'A', { W4: { 'S35:0': { points: 1, shift: 0 } } });
    assert.throws(() => checkEcm(hex, o, 'A', { W4: { 'S35:0': { points: 1, shift: -1 } } }), /0 working points/);
  });

  test('a tech lead adds to points put on a Missile, not to Missiles given none (D-053)', () => {
    const hex = createHex({ X: mk('A', { PD: 6, E: 1 }, { level: 2 }), Y: mk('B', { PD: 2, T: 1, M: 3 }) });
    checkEcm(hex, orders, 'A', { X: { 'Y:0': { points: 1, shift: -2 } } }, 'one point placed, three working');
    assert.throws(() => checkEcm(hex, orders, 'A', { X: { 'Y:0': { points: 0, shift: -2 } } }), /whole number of points, 1 or more/);
  });

  test('only the ECM powered, only Missiles at that ship, only your own ships', () => {
    assert.throws(() => checkEcm(example(), orders, 'A', { X: { 'Y:0': { points: 3, shift: 0 } } }), /3 ECM points but 2 powered/);
    assert.throws(() => checkEcm(example(), orders, 'A', { X: { 'Y:1': { points: 1, shift: 0 } } }), /not a Missile fired at X/);
    assert.throws(() => checkEcm(example(), orders, 'B', { X: { 'Y:0': { points: 1, shift: 0 } } }), /not yours/);
  });

  test('the round resolves with the Missiles where ECM put them', () => {
    const r = resolveRound(example(), orders, { X: { PD: 5 } }, { X: { 'Y:0': { points: 2, shift: -1 } } });
    assert.equal(r.hex.ships.X.PD, 1);
  });
});

describe('in a game: the ECM step comes between revealing orders and taking hits', () => {
  // Advanced with ECM. ann builds A1 (PD 6, E 2: 13 BP); bob builds B1 (PD 3, T 1, M 3: 10 BP). Both are put at
  // Isin (a plain-data edit stands in for movement), so bob's End movement starts a combat there.
  const atOrders = () => {
    let s = play(
      createGame({ map: mapData, scenario: 'advanced', players: ['ann', 'bob'], modules: ['ecm'] }),
      { type: 'setFirstPlayer', player: 'ann' },
      { type: 'chooseSide', player: 'bob', side: 'B' },
      { type: 'build', player: 'ann', ships: [{ id: 'A1', design: { WG: true, PD: 6, E: 2 }, at: 'ur' }] },
      { type: 'endMovement', player: 'ann' }, { type: 'endTurn', player: 'ann' },
      { type: 'build', player: 'bob', ships: [{ id: 'B1', design: { WG: true, PD: 3, T: 1, M: 3 }, at: 'nippur' }] },
    );
    s = structuredClone(s);
    Object.assign(s.ships.A1, { q: -7, r: 0 });
    Object.assign(s.ships.B1, { q: -7, r: 0 });
    return play(s, { type: 'endMovement', player: 'bob' }, { type: 'chooseCombat', player: 'bob', star: 'isin' });
  };
  const ordered = () => play(
    atOrders(),
    { type: 'orders', player: 'bob', orders: { B1: { tactic: 'attack', D: 0, B: 0, S: 0, T: 1, missiles: [{ target: 'A1', drive: 3 }] } } },
    { type: 'orders', player: 'ann', orders: { A1: { tactic: 'attack', D: 3, B: 0, S: 0, T: 0, E: 2 } } },
  );

  test('only the sides with ECM to spread are asked', () => {
    const s = ordered();
    assert.equal(s.combat.stage, 'ecm');
    assert.deepEqual(s.combat.needEcm, ['A']);
    const r = applyAction(s, { type: 'allocateEcm', player: 'bob', ecm: {} });
    assert.equal(r.code, 'NO_ECM_NEEDED');
    assert.equal(applyAction(s, { type: 'allocateEcm', player: 'ann', ecm: { A1: { 'B1:0': { points: 2, shift: -3 } } } }).code, 'BAD_ECM');
  });

  test('then hits, worked out with the Missile where ECM put it; the last round keeps the ECM', () => {
    let s = play(ordered(), { type: 'allocateEcm', player: 'ann', ecm: { A1: { 'B1:0': { points: 2, shift: -1 } } } });
    // Drive 2 against 3: Attack -1, a Hit: 2 hits on A1.
    assert.equal(s.combat.stage, 'hits');
    assert.deepEqual(s.combat.owed, { A1: 2, B1: 0 });
    s = play(s, { type: 'allocateHits', player: 'ann', allocations: { A1: { PD: 2 } } });
    assert.deepEqual(s.lastRound.ecm, { A1: { 'B1:0': { points: 2, shift: -1 } } });
    assert.equal(s.lastRound.shots[0].ecm, -1);
  });

  test('without Missiles at an ECM ship, there is no ECM step', () => {
    const s = play(
      atOrders(),
      { type: 'orders', player: 'bob', orders: { B1: { tactic: 'attack', D: 0, B: 0, S: 0, T: 0 } } },
      { type: 'orders', player: 'ann', orders: { A1: { tactic: 'attack', D: 3, B: 0, S: 0, T: 0, E: 2 } } },
    );
    assert.notEqual(s.combat.stage, 'ecm');
  });
});

describe('hits on ECM (fan §5.5.1, D-056)', () => {
  // A's W fires Beam 5 at B's X, both Attack at Drive 0: Hit +2, 7 hits; X has no Screen up.
  const fight = (target) => {
    const hex = createHex({ W: mk('A', { PD: 5, B: 5 }), X: mk('B', target) });
    const orders = {
      W: { tactic: 'attack', D: 0, B: 5, S: 0, T: 0, beamTarget: 'X' },
      X: { tactic: 'attack', D: 0, B: 0, S: 0, T: 0 },
    };
    return { hex, orders };
  };

  test('ECM takes hits like the other attributes: it counts toward the hits a ship must take', () => {
    const { hex, orders } = fight({ PD: 2, E: 2 });
    assert.equal(hitsOwed(hex, orders).owed.X, 4, 'PD 2 + E 2');
    const r = resolveRound(hex, orders, { X: { PD: 2, E: 2 } });
    assert.ok(r.destroyed.includes('X'));
  });

  test('the owner places them: ECM, or the other attributes first', () => {
    const { hex, orders } = fight({ PD: 6, E: 2 });
    const r = resolveRound(hex, orders, { X: { PD: 5, E: 2 } });
    assert.deepEqual([r.hex.ships.X.PD, r.hex.ships.X.E], [1, 0]);
  });

  test('a ship with nothing left but ECM is destroyed by a hit on it, and the combat ends', () => {
    const { hex, orders } = fight({ PD: 0, E: 1 });
    assert.equal(hitsOwed(hex, orders).owed.X, 1);
    const r = resolveRound(hex, orders, { X: { E: 1 } });
    assert.ok(r.destroyed.includes('X'));
    assert.equal(r.end.reason, 'all destroyed');
  });
});
