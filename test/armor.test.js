import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, applyAction, MODULES } from '../src/engine/game.js';
import { validateShip, shipCost, createShip } from '../src/engine/ships.js';
import { createHex, hitsOwed, resolveRound, checkHitAllocation } from '../src/engine/combat.js';

// Phase 8b: the Armor module (fan §10.2.2, §5.5, §7.5). Rulings D-042 to D-047.
// Armor is an option a game is created with; without it every rule plays as before.
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

// A ship record as createShip builds it, plus the owner; armor adds A to the record and to built.
const mk = (owner, stats, { WG = true, A = 0, carrying } = {}) => {
  const full = { PD: 0, B: 0, S: 0, T: 0, M: 0, SR: 0, ...stats };
  const rec = { owner, WG, level: 0, ...full, built: { ...full } };
  if (A > 0) Object.assign(rec, { A, built: { ...rec.built, A } });
  if (carrying) rec.carrying = carrying;
  return rec;
};
const withoutOwner = ({ owner, ...rec }) => rec;

describe('switching the module on (D-045)', () => {
  test('a game lists its modules; none by default; unknown ones are refused', () => {
    assert.deepEqual(MODULES, ['armor']);
    const plain = createGame({ map: mapData, scenario: 'learning', players: ['ann', 'bob'] });
    assert.deepEqual(plain.modules, []);
    const armored = createGame({ map: mapData, scenario: 'basic', players: ['ann', 'bob'], modules: ['armor'] });
    assert.deepEqual(armored.modules, ['armor']);
    assert.throws(() => createGame({ map: mapData, scenario: 'learning', players: ['ann', 'bob'], modules: ['shields'] }), /shields/);
  });
});

describe('building with Armor (fan §10.2.2, D-043, D-047)', () => {
  test('Armor is an attribute only when the module is on', () => {
    assert.deepEqual(codes(validateShip({ WG: true, PD: 1, A: 2 }, 'learning')), ['UNKNOWN_ATTRIBUTE']);
    assert.deepEqual(validateShip({ WG: true, PD: 1, A: 2 }, 'learning', ['armor']), []);
    assert.deepEqual(codes(validateShip({ WG: true, A: -1 }, 'learning', ['armor'])), ['BAD_VALUE']);
    assert.deepEqual(codes(validateShip({ WG: true, A: 1.5 }, 'learning', ['armor'])), ['BAD_VALUE']);
  });

  test('a ship may be built with nothing but Armor (D-047)', () => {
    assert.deepEqual(validateShip({ WG: true, A: 2 }, 'learning', ['armor']), []);
  });

  test('1 BP buys 2 + TL points; any number, rounded up to whole BP (D-043)', () => {
    assert.equal(shipCost({ A: 2 }), 1);
    assert.equal(shipCost({ A: 3 }), 2);
    assert.equal(shipCost({ A: 8 }, 2), 2, 'W7: TL2, A=8 (fan §3.2.1)');
    assert.equal(shipCost({ WG: true, PD: 6, A: 8, SR: 3 }, 2), 16, 'W7 without its Hold and Repair Bay');
  });

  test('the record keeps Armor and its built strength; ships without Armor have no A at all', () => {
    const ship = createShip({ WG: true, PD: 1, A: 3 }, 'learning', 1, ['armor']);
    assert.equal(ship.A, 3);
    assert.equal(ship.built.A, 3);
    assert.equal('A' in createShip({ WG: true, PD: 1 }, 'learning', 1, ['armor']), false);
  });

  test('in a game: Learning with Armor, 2 points per BP (D-011, D-045)', () => {
    const s = play(
      createGame({ map: mapData, scenario: 'learning', players: ['ann', 'bob'], modules: ['armor'] }),
      { type: 'setFirstPlayer', player: 'ann' },
      { type: 'chooseSide', player: 'bob', side: 'B' },
      { type: 'build', player: 'ann', ships: [{ id: 'A1', design: { WG: true, PD: 10, B: 10, S: 12, A: 5 }, at: 'ur' }] }, // 5 + 32 + 3
    );
    assert.equal(s.ships.A1.A, 5);
    assert.equal(s.bp.A, 0);
    const plain = play(
      createGame({ map: mapData, scenario: 'learning', players: ['ann', 'bob'] }),
      { type: 'setFirstPlayer', player: 'ann' },
      { type: 'chooseSide', player: 'bob', side: 'B' },
    );
    const r = applyAction(plain, { type: 'build', player: 'ann', ships: [{ id: 'A1', design: { WG: true, PD: 10, B: 10, S: 12, A: 5 }, at: 'ur' }] });
    assert.equal(r.code, 'UNKNOWN_ATTRIBUTE');
  });
});

describe('Armor in combat (D-042, D-046, D-047)', () => {
  // X: Screen 2, Armor 4. Y: Beam 10. Both Attack at Drive 0: Hit +2 both ways.
  const hex = () => createHex({ X: mk('A', { PD: 10, B: 5, S: 2 }, { A: 4 }), Y: mk('B', { PD: 12, B: 10 }) });
  const orders = {
    X: { tactic: 'attack', D: 0, B: 5, S: 2, T: 0, beamTarget: 'Y' },
    Y: { tactic: 'attack', D: 0, B: 10, S: 0, T: 0, beamTarget: 'X' },
  };

  test('after Screens, Armor takes the hits first; the owner places only what is left', () => {
    const { damage, owed } = hitsOwed(hex(), orders);
    assert.deepEqual(damage.X, { total: 12, absorbed: 2, effective: 10, armor: 4 });
    assert.equal(owed.X, 6);
    assert.equal(owed.Y, 7);
    const r = resolveRound(hex(), orders, { X: { PD: 6 }, Y: { PD: 7 } });
    assert.equal(r.hex.ships.X.A, 0);
    assert.equal(r.hex.ships.X.PD, 4);
  });

  test('Armor is not placed by hand on the ship it protects', () => {
    assert.throws(() => checkHitAllocation(hex(), orders, 'X', { A: 2, PD: 4 }), /Armor takes hits on its own \(D-042\)/);
  });

  test('Armor that soaks every hit leaves nothing to place; the round still counts as damage (§7 step 6(c))', () => {
    const thick = createHex({ X: mk('A', { PD: 10, B: 5, S: 2 }, { A: 20 }), Y: mk('B', { PD: 12, B: 10 }) });
    assert.equal(hitsOwed(thick, orders).owed.X, 0);
    const r = resolveRound(thick, orders, { Y: { PD: 7 } });
    assert.equal(r.hex.ships.X.A, 10);
    assert.equal(r.hex.quietRounds, 0);
  });

  test('a ship with only Armor survives until its Armor is gone (D-047)', () => {
    const order = { Y: { tactic: 'attack', D: 0, B: 2, S: 0, T: 0, beamTarget: 'Z' }, Z: { tactic: 'attack', D: 0, B: 0, S: 0, T: 0 } };
    const hull = (A) => createHex({ Z: mk('A', {}, { A }), Y: mk('B', { PD: 12, B: 10 }) });
    const survives = resolveRound(hull(5), order, {}); // Beam 2 + 2 = 4 hits, all on Armor
    assert.equal(survives.hex.ships.Z.A, 1);
    assert.deepEqual(survives.destroyed, []);
    const sunk = resolveRound(hull(4), order, {});
    assert.deepEqual(sunk.destroyed, ['Z']);
  });

  test("hits put on a carried Systemship go to its Armor first (D-046)", () => {
    const cargo = withoutOwner(mk('A', { PD: 3 }, { WG: false, A: 2 }));
    const h = () => createHex({ W: mk('A', { PD: 2, SR: 1 }, { carrying: { S: cargo } }), Y: mk('B', { PD: 12, B: 2 }) });
    const o = { W: { tactic: 'attack', D: 0, B: 0, S: 0, T: 0 }, Y: { tactic: 'attack', D: 0, B: 2, S: 0, T: 0, beamTarget: 'W' } }; // 4 hits
    assert.equal(hitsOwed(h(), o).owed.W, 4);
    assert.throws(() => checkHitAllocation(h(), o, 'W', { PD: 2, carried: { S: { PD: 2 } } }), /Armor first \(D-046\)/);
    checkHitAllocation(h(), o, 'W', { PD: 2, carried: { S: { A: 2 } } });
    checkHitAllocation(h(), o, 'W', { carried: { S: { A: 2, PD: 2 } } });
    const r = resolveRound(h(), o, { W: { carried: { S: { A: 2, PD: 2 } } } });
    assert.deepEqual([r.hex.ships.W.carrying.S.A, r.hex.ships.W.carrying.S.PD], [0, 1]);
  });
});

describe('repairing Armor (fan §7.5, D-044)', () => {
  // Advanced with Armor. ann builds W1 (PD 5, A 4: 12 BP) and W2 (PD 1, A 2: 7 BP), saving 1. Both are damaged
  // (plain-data edits stand in for combat); her game-turn 2 Build event has 1 + 10 = 11 BP.
  const damaged = () => {
    let s = play(
      createGame({ map: mapData, scenario: 'advanced', players: ['ann', 'bob'], modules: ['armor'] }),
      { type: 'setFirstPlayer', player: 'ann' },
      { type: 'chooseSide', player: 'bob', side: 'B' },
      { type: 'build', player: 'ann', ships: [{ id: 'W1', design: { WG: true, PD: 5, A: 4 }, at: 'ur' }, { id: 'W2', design: { WG: true, PD: 1, A: 2 }, at: 'ur' }] },
      { type: 'endMovement', player: 'ann' }, { type: 'endTurn', player: 'ann' },
      { type: 'build', player: 'bob', ships: [] }, { type: 'endMovement', player: 'bob' }, { type: 'endTurn', player: 'bob' },
    );
    s = structuredClone(s);
    Object.assign(s.ships.W1, { A: 2, PD: 4 });
    Object.assign(s.ships.W2, { A: 1 });
    assert.equal(s.bp.A, 11);
    return s;
  };
  const repair = (repairs) => ({ type: 'build', player: 'ann', ships: [], repairs });

  test('1 BP per 2 points, pooled across ships, rounded up', () => {
    assert.equal(play(damaged(), repair({ W1: { A: 1 }, W2: { A: 1 } })).bp.A, 10);
    assert.equal(play(damaged(), repair({ W1: { A: 2 } })).bp.A, 10);
    assert.equal(play(damaged(), repair({ W1: { A: 2 }, W2: { A: 1 } })).bp.A, 9);
    assert.equal(play(damaged(), repair({ W1: { A: 1, PD: 1 } })).bp.A, 9, 'PD 1 BP, Armor 1 BP');
  });

  test('never past the Armor it was built with', () => {
    const r = applyAction(damaged(), repair({ W2: { A: 2 } }));
    assert.equal(r.code, 'OVER_BUILT');
  });

  test('without the module, there is no Armor to repair', () => {
    const s = structuredClone(damaged());
    s.modules = [];
    assert.equal(applyAction(s, repair({ W1: { A: 1 } })).code, 'BAD_REPAIR');
  });
});
