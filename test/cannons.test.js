import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, applyAction, MODULES } from '../src/engine/game.js';
import { validateShip, shipCost } from '../src/engine/ships.js';
import { createHex, validateOrder, validateOrders, hitsOwed, resolveRound, checkHitAllocation } from '../src/engine/combat.js';
import { applyHits } from '../src/engine/damage.js';

// Phase 8c: the Cannons and Shells module (fan §10.2.3, §10.2.4, §5.1, §5.3.1, §5.4, §5.6, §7.5).
// Rulings D-048 (one target, a burst per Cannon), D-049 (Cannons count like Beams for escape),
// D-050 (Shells by the six), D-051 (an option per game).
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
const idle = { tactic: 'attack', D: 0, B: 0, S: 0, T: 0 };

describe('the module (D-051)', () => {
  test('cannons is a module; Cannons and Shells are attributes only with it', () => {
    assert.ok(MODULES.includes('cannons'));
    assert.deepEqual(codes(validateShip({ WG: true, PD: 1, C: 1, SH: 6 }, 'learning')), ['UNKNOWN_ATTRIBUTE', 'UNKNOWN_ATTRIBUTE']);
    assert.deepEqual(validateShip({ WG: true, PD: 1, C: 1, SH: 6 }, 'learning', ['cannons']), []);
    assert.deepEqual(validateShip({ PD: 1, C: 1, SH: 12 }, 'basic', ['cannons', 'armor']), []);
  });
});

describe('building (fan §10.2.3, §10.2.4, D-050)', () => {
  test('1 BP a Cannon; Shells 6 to the BP, rounded up', () => {
    assert.equal(shipCost({ PD: 1, C: 1, SH: 12 }, 1), 4, 'S55: TL1 PD=1 C=1 SH=12 costs 4 BP (fan §3.3.1)');
    assert.equal(shipCost({ C: 2, SH: 7 }), 4);
  });

  test('in a game, the record keeps C and SH; ships without them have neither', () => {
    const s = play(
      createGame({ map: mapData, scenario: 'learning', players: ['ann', 'bob'], modules: ['cannons'] }),
      { type: 'setFirstPlayer', player: 'ann' },
      { type: 'chooseSide', player: 'bob', side: 'B' },
      { type: 'build', player: 'ann', ships: [{ id: 'A1', design: { WG: true, PD: 30, C: 2, SH: 18 }, at: 'ur' }] }, // 5 + 32 + 3
    );
    assert.deepEqual([s.ships.A1.C, s.ships.A1.SH, s.ships.A1.built.SH], [2, 18, 18]);
  });
});

describe('Cannon orders (fan §5.1, §10.2.3, §5.6)', () => {
  const s32 = mk('A', { PD: 5, C: 2, SH: 12 }, { WG: false, level: 1 });
  const fire = (extra) => ({ tactic: 'attack', D: 3, B: 0, S: 0, T: 0, C: 2, shells: [3, 1], cannonTarget: 'W3', ...extra });

  test('S32 ATTACKS W3: D=3 C=1 (firing 3 shells) C=1 (firing 1 shell): needs PD 5', () => {
    assert.deepEqual(codes(validateOrder(s32, fire())), []);
    assert.deepEqual(codes(validateOrder({ ...s32, PD: 4 }, fire())), ['OVER_PD']);
  });

  test('one to three Shells a Cannon, no more Cannons than built, no more Shells than carried', () => {
    assert.deepEqual(codes(validateOrder(s32, fire({ shells: [4, 1] }))), ['BAD_SHELLS']);
    assert.deepEqual(codes(validateOrder(s32, fire({ shells: [0, 1] }))), ['BAD_SHELLS']);
    assert.deepEqual(codes(validateOrder(s32, fire({ C: 3, shells: [1, 1, 1], D: 2 }))), ['OVER_CANNONS']);
    assert.deepEqual(codes(validateOrder({ ...s32, SH: 3 }, fire())), ['NO_SHELLS']);
    assert.deepEqual(codes(validateOrder(s32, fire({ C: 1 }))), ['BAD_SHELLS'], 'one entry per Cannon powered');
  });

  test('Cannons are powered only to fire, at a target', () => {
    assert.deepEqual(codes(validateOrder(s32, { ...idle, C: 1, shells: [] })), ['BAD_SHELLS']);
    assert.deepEqual(codes(validateOrder(s32, { ...idle, C: 1, shells: [2] })), ['UNAIMED_CANNONS']);
  });

  test('not with a Beam or Screen; with Missiles, yes', () => {
    const both = mk('A', { PD: 9, B: 2, S: 2, T: 1, M: 3, C: 1, SH: 6 });
    const order = { tactic: 'attack', D: 0, C: 1, shells: [2], cannonTarget: 'X', T: 0 };
    assert.deepEqual(codes(validateOrder(both, { ...order, B: 1, beamTarget: 'X' })), ['CANNONS_WITH_BEAM_OR_SCREEN']);
    assert.deepEqual(codes(validateOrder(both, { ...order, S: 1 })), ['CANNONS_WITH_BEAM_OR_SCREEN']);
    assert.deepEqual(codes(validateOrder(both, { ...order, T: 1, missiles: [{ target: 'X', drive: 2 }] })), []);
  });

  test('no Cannons while picking up or dropping a Systemship (fan §5.6)', () => {
    const carrier = mk('A', { PD: 3, SR: 1, C: 1, SH: 6 });
    assert.deepEqual(codes(validateOrder(carrier, { tactic: 'dodge', D: 0, S: 0, B: 0, T: 0, C: 1, shells: [1], cannonTarget: 'X', pickup: 'S9' })), ['CARRY_NO_CANNONS']);
  });

  test('the target must be an enemy ship in the hex', () => {
    const hex = createHex({ G: mk('A', { PD: 3, C: 1, SH: 6 }), F: mk('A', { PD: 1 }), X: mk('B', { PD: 1 }) });
    const errors = validateOrders(hex, { G: { ...idle, C: 1, shells: [1], cannonTarget: 'F' }, F: idle, X: idle });
    assert.deepEqual(codes(errors), ['BAD_TARGET']);
  });
});

describe('Cannon fire (fan §5.3.1, §5.4, §10.2.3, §10.2.4, D-048)', () => {
  test('the fan example: Dodge at Drive 3 against Attack at Drive 2 reads Dodge +1, a Hit: both Shells hit', () => {
    const hex = createHex({ G: mk('A', { PD: 4, C: 1, SH: 6 }), X: mk('B', { PD: 5 }) });
    const orders = { G: { tactic: 'dodge', D: 3, B: 0, S: 0, T: 0, C: 1, shells: [2], cannonTarget: 'X' }, X: { ...idle, D: 2 } };
    const { shots, damage } = hitsOwed(hex, orders);
    assert.deepEqual(shots, [{ from: 'G', to: 'X', weapon: 'cannon', shells: 2, result: 'hit', bonus: 0, damage: 2 }]);
    assert.equal(damage.X.effective, 2);
  });

  test('each Cannon is a burst: Hit bonus and tech level once per burst, not per Shell', () => {
    const hex = createHex({ G: mk('A', { PD: 5, C: 2, SH: 12 }, { level: 1 }), X: mk('B', { PD: 5 }) });
    const orders = { G: { tactic: 'attack', D: 0, B: 0, S: 0, T: 0, C: 2, shells: [3, 1], cannonTarget: 'X' }, X: idle };
    const { shots, damage } = hitsOwed(hex, orders);
    assert.deepEqual(shots.map((s) => s.damage), [3 + 1 + 2, 1 + 1 + 2]);
    assert.equal(damage.X.effective, 10);
  });

  test('Shells fired leave the stock before hits are taken; a hit on Shells takes out 6, or all of 1 to 5 (D-050)', () => {
    const hex = createHex({ G: mk('A', { PD: 2, C: 1, SH: 9 }), X: mk('B', { PD: 9, B: 2 }) });
    const orders = { G: { ...idle, C: 1, shells: [3], cannonTarget: 'X' }, X: { tactic: 'attack', D: 0, B: 2, S: 0, T: 0, beamTarget: 'G' } };
    // X's Beam 2 + 2 = 4 hits on G, which has PD 2, C 1 and 6 Shells left: room for 4 (Shells are one hit's worth).
    assert.equal(hitsOwed(hex, orders).owed.G, 4);
    const r = resolveRound(hex, orders, { G: { PD: 2, C: 1, SH: 1 }, X: { PD: 5 } });
    assert.deepEqual(r.destroyed, ['G']);
    assert.deepEqual(applyHits(mk('A', { SH: 12 }), { SH: 1 }).SH, 6);
    assert.deepEqual(applyHits(mk('A', { SH: 4 }), { SH: 1 }).SH, 0);
  });

  test('Cannons stop an escape like a Beam (D-049)', () => {
    const hex = () => createHex({ G: mk('A', { PD: 4, C: 1, SH: 6 }), R: mk('B', { PD: 6 }) });
    const away = resolveRound(hex(), { G: { ...idle, C: 1, shells: [1], cannonTarget: 'R' }, R: { tactic: 'retreat', D: 3, B: 0, S: 0, T: 0 } }, {});
    assert.deepEqual(Object.keys(away.escaped), ['R'], 'Attack -3 or less against Retreat: Escapes');
    const held = resolveRound(hex(), { G: { ...idle, D: 0, C: 1, shells: [1], cannonTarget: 'R' }, R: { tactic: 'retreat', D: 0, B: 0, S: 0, T: 0 } }, {});
    assert.deepEqual(Object.keys(held.escaped), [], 'Attack 0 against Retreat: Miss, so no escape');
  });

  test('hits on Cannons come one per Cannon', () => {
    const hex = createHex({ G: mk('A', { PD: 1, C: 3, SH: 6 }), X: mk('B', { PD: 9, B: 1 }) });
    const orders = { G: idle, X: { tactic: 'attack', D: 0, B: 1, S: 0, T: 0, beamTarget: 'G' } }; // 3 hits
    checkHitAllocation(hex, orders, 'G', { C: 3 });
  });
});

describe('Shells and Cannons in the rest of the game', () => {
  test('a Systemship with Cannons and Shells is effective (D-038): no draw in Basic', () => {
    const start = () => play(
      createGame({ map: mapData, scenario: 'basic', players: ['ann', 'bob'], modules: ['cannons'] }),
      { type: 'setFirstPlayer', player: 'ann' },
      { type: 'chooseSide', player: 'bob', side: 'B' },
    );
    const pass = (s, player, ships) => play(s, { type: 'build', player, ships }, { type: 'endMovement', player }, { type: 'endTurn', player });
    let s = pass(start(), 'ann', [{ id: 'A1', design: { PD: 48, C: 1, SH: 6 }, at: 'ur' }]);
    s = pass(s, 'bob', [{ id: 'B1', design: { PD: 48, C: 1, SH: 6 }, at: 'nippur' }]);
    assert.equal(s.step, 'movement');
    let unarmed = pass(start(), 'ann', [{ id: 'A1', design: { PD: 49, C: 1 }, at: 'ur' }]);
    unarmed = pass(unarmed, 'bob', [{ id: 'B1', design: { PD: 49, C: 1 }, at: 'nippur' }]);
    assert.deepEqual(unarmed.result, { draw: true }, 'Cannons with no Shells are no weapon');
  });

  describe('repair and resupply (fan §7.5, D-050)', () => {
    // Advanced with Cannons. ann builds W1 (PD 1, C 1, SH 6: 8 BP) and W2 (PD 1, C 1, SH 6, T 1, M 3: 10 BP),
    // saving 2; both fire and lose a Cannon (plain-data edits stand in for combat); 2 + 10 = 12 BP at turn 2.
    const damaged = () => {
      let s = play(
        createGame({ map: mapData, scenario: 'advanced', players: ['ann', 'bob'], modules: ['cannons'] }),
        { type: 'setFirstPlayer', player: 'ann' },
        { type: 'chooseSide', player: 'bob', side: 'B' },
        { type: 'build', player: 'ann', ships: [{ id: 'W1', design: { WG: true, PD: 1, C: 1, SH: 6 }, at: 'ur' }, { id: 'W2', design: { WG: true, PD: 1, C: 1, SH: 6, T: 1, M: 3 }, at: 'ur' }] },
        { type: 'endMovement', player: 'ann' }, { type: 'endTurn', player: 'ann' },
        { type: 'build', player: 'bob', ships: [] }, { type: 'endMovement', player: 'bob' }, { type: 'endTurn', player: 'bob' },
      );
      s = structuredClone(s);
      Object.assign(s.ships.W1, { SH: 2, C: 0 });
      Object.assign(s.ships.W2, { SH: 5, M: 2 });
      assert.equal(s.bp.A, 12);
      return s;
    };
    const build = (extra) => ({ type: 'build', player: 'ann', ships: [], ...extra });

    test('Shells by the six, pooled across ships; Missiles in their own pool', () => {
      assert.equal(play(damaged(), build({ resupply: { W1: { SH: 4 }, W2: { SH: 1 } } })).bp.A, 11);
      assert.equal(play(damaged(), build({ resupply: { W1: { SH: 4 }, W2: { SH: 1, M: 1 } } })).bp.A, 10);
      assert.equal(play(damaged(), build({ resupply: { W2: 1 } })).bp.A, 11, 'a number still means Missiles');
      assert.equal(applyAction(damaged(), build({ resupply: { W1: { SH: 5 } } })).code, 'OVER_BUILT');
    });

    test('a Cannon is repaired at 1 BP; Shells come back by resupply, not repair', () => {
      assert.equal(play(damaged(), build({ repairs: { W1: { C: 1 } } })).bp.A, 11);
      assert.equal(applyAction(damaged(), build({ repairs: { W1: { SH: 4 } } })).code, 'BAD_REPAIR');
    });
  });
});
