import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHex, validateOrder, validateOrders, resolveRound } from '../src/engine/combat.js';
import { roundDamage, applyHits } from '../src/engine/damage.js';

// Ship record as createShip builds it, plus the owner. Expected values below are typed
// from docs/rules/classic.md (§7, §7.1, §7.2 Table 1), not read from src.
const mk = (owner, stats, { WG = true, level = 0, built } = {}) => {
  const full = { PD: 0, B: 0, S: 0, T: 0, M: 0, SR: 0, ...stats };
  return { owner, WG, level, ...full, built: { ...(built ?? full) } };
};
const stats = (s) => ({ PD: s.PD, B: s.B, S: s.S, T: s.T, M: s.M, SR: s.SR });
const codes = (errors) => errors.map((e) => e.code);
const ownCodes = (ship, order) => codes(validateOrder(ship, order));

describe('order validation: §7.1.1 power allocation example', () => {
  // Built with PD 9, 3 hits taken: PD 6. Allocates D1, B2, S2, T0 (5 of 6).
  const ship = mk('A', { PD: 6, B: 3, S: 2, T: 1, M: 3 }, { built: { PD: 9, B: 3, S: 2, T: 1, M: 3, SR: 0 } });

  test('D=1, B=2, S=2, T=0 is legal, with 1 PD unallocated', () => {
    assert.deepEqual(ownCodes(ship, { tactic: 'attack', D: 1, B: 2, S: 2, T: 0 }), []);
  });

  test('it could not power its Tubes to fire Missiles while using Beam and Screens', () => {
    const order = { tactic: 'attack', D: 1, B: 2, S: 2, T: 1, missiles: [{ target: 'X', drive: 2 }] };
    assert.deepEqual(ownCodes(ship, order), ['MISSILES_WITH_BEAM_OR_SCREEN']);
  });

  test('allocating more than the current PD of 6 is rejected', () => {
    assert.deepEqual(ownCodes(ship, { tactic: 'attack', D: 2, B: 2, S: 2, T: 1 }), ['OVER_PD']);
  });
});

describe('order validation: §7.1.2 Beam fire example', () => {
  const order = { tactic: 'attack', D: 0, B: 3, S: 2, T: 0, beamTarget: 'S25' };

  test('W3 ATTACKS S25: D=0, B=3, S=2, T=0 needs PD of at least 5', () => {
    assert.deepEqual(ownCodes(mk('A', { PD: 5, B: 3, S: 2 }), order), []);
    assert.deepEqual(ownCodes(mk('A', { PD: 4, B: 3, S: 2 }), order), ['OVER_PD']);
  });

  test('W3 needs a Beam of at least 3 and a Screen of at least 2', () => {
    assert.deepEqual(ownCodes(mk('A', { PD: 6, B: 2, S: 2 }), order), ['OVER_BEAM']);
    assert.deepEqual(ownCodes(mk('A', { PD: 6, B: 3, S: 1 }), order), ['OVER_SCREEN']);
  });
});

describe('order validation: §7.1.3 Missile fire example', () => {
  const order = { tactic: 'dodge', D: 4, B: 0, S: 0, T: 1, missiles: [{ target: 'W3', drive: 3 }] };

  test('S25 DODGE D=4, B=0, S=0, T=1 with a Missile at D=3 needs PD of at least 5', () => {
    assert.deepEqual(ownCodes(mk('B', { PD: 5, T: 1, M: 1 }, { WG: false }), order), []);
    assert.deepEqual(ownCodes(mk('B', { PD: 4, T: 1, M: 1 }, { WG: false }), order), ['OVER_PD']);
  });

  test('the Missile drive does not come out of PD', () => {
    const big = { ...order, missiles: [{ target: 'W3', drive: 9 }] };
    assert.deepEqual(ownCodes(mk('B', { PD: 5, T: 1, M: 1 }, { WG: false }), big), []);
  });

  test('the two example orders together name legal targets (W3 per D-005)', () => {
    const hex = createHex({
      W3: mk('A', { PD: 5, B: 3, S: 2 }),
      S25: mk('B', { PD: 5, T: 1, M: 1 }, { WG: false }),
    });
    const w3 = { tactic: 'attack', D: 0, B: 3, S: 2, T: 0, beamTarget: 'S25' };
    assert.deepEqual(validateOrders(hex, { W3: w3, S25: order }), []);
  });

  test('both examples resolve to misses (Table 1: attack -4 vs dodge, attack +3 vs attack)', () => {
    const hex = createHex({
      W3: mk('A', { PD: 5, B: 3, S: 2 }),
      S25: mk('B', { PD: 5, T: 1, M: 1 }, { WG: false }),
    });
    const w3 = { tactic: 'attack', D: 0, B: 3, S: 2, T: 0, beamTarget: 'S25' };
    const r = resolveRound(hex, { W3: w3, S25: order });
    assert.deepEqual(r.shots.map((s) => [s.from, s.to, s.weapon, s.result, s.damage]), [
      ['W3', 'S25', 'beam', 'miss', 0],
      ['S25', 'W3', 'missile', 'miss', 0],
    ]);
    assert.equal(r.hex.ships.S25.M, 0);
  });
});

describe('order validation: other rules', () => {
  const warp = mk('A', { PD: 6, B: 3, S: 2, T: 2, M: 3 });
  const sys = mk('A', { PD: 6, B: 3, S: 2, T: 2, M: 3 }, { WG: false });

  test('Systemships may not select Retreat; Warpships may', () => {
    assert.deepEqual(ownCodes(sys, { tactic: 'retreat' }), ['SYSTEMSHIP_RETREAT']);
    assert.deepEqual(ownCodes(warp, { tactic: 'retreat' }), []);
  });

  test('rejects unknown tactics and fields', () => {
    assert.deepEqual(ownCodes(warp, { tactic: 'Attack' }), ['BAD_TACTIC']);
    assert.deepEqual(ownCodes(warp, { tactic: 'attack', pickup: 'S1' }), ['UNKNOWN_FIELD']);
  });

  test('rejects negative and non-integer power', () => {
    assert.deepEqual(ownCodes(warp, { tactic: 'attack', D: -1 }), ['BAD_VALUE']);
    assert.deepEqual(ownCodes(warp, { tactic: 'attack', B: 1.5 }), ['BAD_VALUE']);
  });

  test('Tubes cannot be powered past the number built', () => {
    assert.deepEqual(ownCodes(warp, { tactic: 'attack', T: 3 }), ['OVER_TUBES']);
  });

  test('a Beam must be powered at 1 or more to fire (D-030)', () => {
    assert.deepEqual(ownCodes(warp, { tactic: 'attack', B: 0, beamTarget: 'X' }), ['UNPOWERED_BEAM']);
    assert.deepEqual(ownCodes(warp, { tactic: 'attack', B: 1, beamTarget: 'X' }), []);
  });

  test('one powered Tube per Missile', () => {
    const two = [{ target: 'X', drive: 1 }, { target: 'X', drive: 1 }];
    assert.deepEqual(ownCodes(warp, { tactic: 'dodge', T: 1, missiles: two }), ['TUBES']);
    assert.deepEqual(ownCodes(warp, { tactic: 'dodge', T: 2, missiles: two }), []);
  });

  test('a Missile drive setting must be 1 or more', () => {
    const zero = [{ target: 'X', drive: 0 }];
    assert.deepEqual(ownCodes(warp, { tactic: 'dodge', T: 1, missiles: zero }), ['BAD_MISSILE_DRIVE']);
  });

  test('cannot fire more Missiles than the stock', () => {
    const low = mk('A', { PD: 6, T: 2, M: 1 });
    const two = [{ target: 'X', drive: 1 }, { target: 'X', drive: 1 }];
    assert.deepEqual(ownCodes(low, { tactic: 'dodge', T: 2, missiles: two }), ['NO_MISSILES']);
  });

  test('Beam or Screen power alone blocks Missile fire', () => {
    const one = [{ target: 'X', drive: 1 }];
    assert.deepEqual(ownCodes(warp, { tactic: 'dodge', T: 1, B: 1, missiles: one }), ['MISSILES_WITH_BEAM_OR_SCREEN']);
    assert.deepEqual(ownCodes(warp, { tactic: 'dodge', T: 1, S: 1, missiles: one }), ['MISSILES_WITH_BEAM_OR_SCREEN']);
  });

  test('every ship needs an order, and targets must be enemy ships in the hex', () => {
    const hex = createHex({ A1: mk('A', { PD: 3, B: 1 }), A2: mk('A', { PD: 3 }), B1: mk('B', { PD: 3 }) });
    const fire = (target) => ({ tactic: 'attack', B: 1, beamTarget: target });
    assert.deepEqual(codes(validateOrders(hex, { A1: fire('A2'), A2: { tactic: 'dodge' }, B1: { tactic: 'dodge' } })), ['BAD_TARGET']);
    assert.deepEqual(codes(validateOrders(hex, { A1: fire('Z9'), A2: { tactic: 'dodge' }, B1: { tactic: 'dodge' } })), ['BAD_TARGET']);
    assert.deepEqual(codes(validateOrders(hex, { A1: fire('B1'), A2: { tactic: 'dodge' } })), ['MISSING_ORDER']);
    assert.deepEqual(codes(validateOrders(hex, { A1: fire('B1'), A2: { tactic: 'dodge' }, B1: { tactic: 'dodge' }, Q: { tactic: 'dodge' } })), ['UNKNOWN_SHIP']);
  });

  test('resolveRound refuses illegal orders', () => {
    const hex = createHex({ A1: mk('A', { PD: 1 }), B1: mk('B', { PD: 1 }) });
    assert.throws(() => resolveRound(hex, { A1: { tactic: 'dodge', D: 5 }, B1: { tactic: 'dodge' } }), /OVER_PD/);
  });

  test('createHex needs owners', () => {
    assert.throws(() => createHex({ A1: { PD: 1 } }), RangeError);
  });
});

describe('the §7.2.2 combat, two rounds', () => {
  // Round 1: W4 (Level 0) takes 7 hits against Screens of 4, leaving 3 effective, taken one each in
  // PD, Screens and Missiles. D-001: the printed record has S=3, which cannot power a Screen at 4,
  // so the same arithmetic is run on a ship built with S=4. The rulebook gives no orders for this
  // round, so it is checked at the damage level.
  test('round 1: 7 hits, Screen 4, 3 effective; one hit each in PD, S and M', () => {
    const before = mk('A', { PD: 7, B: 3, S: 4, T: 1, M: 6, SR: 1 });
    assert.deepEqual(roundDamage([7], 4, 0), { total: 7, absorbed: 4, effective: 3 });
    const after = applyHits(before, { PD: 1, S: 1, M: 1 });
    assert.deepEqual(stats(after), { PD: 6, B: 3, S: 3, T: 1, M: 3, SR: 1 });
  });

  // Round 2 starts from W4's printed record at the end of round 1.
  const W4 = mk('A', { PD: 6, B: 3, S: 2, T: 1, M: 3, SR: 1 }, { built: { PD: 7, B: 3, S: 3, T: 1, M: 6, SR: 1 } });
  const S35 = mk('B', { PD: 6, B: 2, S: 3, T: 2, M: 7 }, { WG: false, level: 1, built: { PD: 6, B: 2, S: 3, T: 2, M: 9, SR: 0 } });
  const orders = {
    // S35 (Level 1): DODGE PD=4 (a Drive of 4, D-004), B=0, S=0, T=2. Two Missiles at W4, D=3 and D=4.
    S35: { tactic: 'dodge', D: 4, B: 0, S: 0, T: 2, missiles: [{ target: 'W4', drive: 3 }, { target: 'W4', drive: 4 }] },
    // W4 (Level 0): ATTACK D=2, B=3, S=1, T=0, Beam at S35.
    W4: { tactic: 'attack', D: 2, B: 3, S: 1, T: 0, beamTarget: 'S35' },
  };
  const hex = createHex({ W4, S35 });

  test('both orders are legal', () => {
    assert.deepEqual(validateOrders(hex, orders), []);
  });

  test('W4 misses with its Beam (-2); the Missiles are Hit +2 and Hit +1 for 5 and 4 hits', () => {
    const { shots } = resolveRound(hex, orders, { W4: { B: 3, S: 2, T: 1, M: 1, SR: 1 } });
    const byWeapon = (from) => shots.filter((s) => s.from === from).map((s) => [s.result, s.bonus, s.damage]);
    assert.deepEqual(byWeapon('W4'), [['miss', 0, 0]]);
    assert.deepEqual(byWeapon('S35'), [['hit', 2, 5], ['hit', 1, 4]]);
  });

  test('9 hits, Screen 1 absorbs 1, 8 effective on W4; S35 takes none', () => {
    const { damage } = resolveRound(hex, orders, { W4: { B: 3, S: 2, T: 1, M: 1, SR: 1 } });
    assert.deepEqual(damage.W4, { total: 9, absorbed: 1, effective: 8 });
    assert.deepEqual(damage.S35, { total: 0, absorbed: 0, effective: 0 });
  });

  test('W4 ends with PD=6 and everything else 0; S35 has 2 fewer Missiles and no damage', () => {
    const r = resolveRound(hex, orders, { W4: { B: 3, S: 2, T: 1, M: 1, SR: 1 } });
    assert.deepEqual(stats(r.hex.ships.W4), { PD: 6, B: 0, S: 0, T: 0, M: 0, SR: 0 });
    assert.deepEqual(stats(r.hex.ships.S35), { PD: 6, B: 2, S: 3, T: 2, M: 5, SR: 0 });
    assert.deepEqual(r.destroyed, []);
    assert.deepEqual(r.escaped, {});
    assert.equal(r.end, null);
    assert.equal(r.hex.quietRounds, 0);
  });

  test('the hit allocation is required and must total the 8 effective hits', () => {
    assert.throws(() => resolveRound(hex, orders), RangeError);
    assert.throws(() => resolveRound(hex, orders, { W4: { B: 3, S: 2, T: 1, M: 1 } }), RangeError);
    assert.throws(() => resolveRound(hex, orders, { W4: { B: 3, S: 2, T: 1, M: 1, SR: 1, PD: 1 } }), RangeError);
    assert.throws(() => resolveRound(hex, orders, { W4: { B: 3, S: 2, T: 1, M: 1, SR: 1 }, Q: {} }), RangeError);
  });

  test('the input hex is not changed', () => {
    const snapshot = structuredClone(hex);
    resolveRound(hex, orders, { W4: { B: 3, S: 2, T: 1, M: 1, SR: 1 } });
    assert.deepEqual(hex, snapshot);
  });
});

describe('Missiles fired leave the stock before hits apply (D-029)', () => {
  // B1 has M=4 and fires one, leaving 3. A Beam hit of 2 lands: a hit in Missiles takes all 3.
  const hex = createHex({ A1: mk('A', { PD: 3, B: 1 }), B1: mk('B', { PD: 1, T: 1, M: 4 }) });
  const orders = {
    A1: { tactic: 'attack', D: 2, B: 1, beamTarget: 'B1' }, // attack +2 vs dodge: Hit +1, 1 + 1 = 2 hits
    B1: { tactic: 'dodge', T: 1, missiles: [{ target: 'A1', drive: 5 }] }, // attack +3 vs attack: Miss
  };

  test('a hit in Missiles takes the 3 left, not 3 of the 4 held before firing', () => {
    const r = resolveRound(hex, orders, { B1: { M: 1, PD: 1 } });
    assert.deepEqual(stats(r.hex.ships.B1), { PD: 0, B: 0, S: 0, T: 1, M: 0, SR: 0 });
  });

  test('only one hit can go in the 3 Missiles that remain', () => {
    assert.throws(() => resolveRound(hex, orders, { B1: { M: 2 } }), RangeError);
  });
});

describe('retreat and escape (§7.2.1; D-024, D-025, D-026)', () => {
  const dodge = { tactic: 'dodge' };
  const retreat = (D = 0) => ({ tactic: 'retreat', D });

  test('D-024: no enemy Beam fire on a retreating ship, it escapes', () => {
    const hex = createHex({ A1: mk('A', { PD: 1 }), B1: mk('B', { PD: 1 }) });
    const r = resolveRound(hex, { A1: dodge, B1: retreat() });
    assert.deepEqual(Object.keys(r.escaped), ['B1']);
    assert.deepEqual(Object.keys(r.hex.ships), ['A1']);
    assert.deepEqual(r.end, { reason: 'all escaped', owners: ['B'] });
  });

  test('Beam Escapes: attack -2 vs retreat', () => {
    const hex = createHex({ A1: mk('A', { PD: 4, B: 3 }), B1: mk('B', { PD: 3 }) });
    const orders = { A1: { tactic: 'attack', D: 1, B: 3, beamTarget: 'B1' }, B1: retreat(3) };
    const r = resolveRound(hex, orders);
    assert.deepEqual(r.shots.map((s) => [s.result, s.damage]), [['escapes', 0]]);
    assert.deepEqual(Object.keys(r.escaped), ['B1']);
  });

  test('Beam Miss: attack 0 vs retreat does not let it escape, and does no damage', () => {
    const hex = createHex({ A1: mk('A', { PD: 5, B: 3 }), B1: mk('B', { PD: 2 }) });
    const orders = { A1: { tactic: 'attack', D: 2, B: 3, beamTarget: 'B1' }, B1: retreat(2) };
    const r = resolveRound(hex, orders);
    assert.deepEqual(r.shots.map((s) => [s.result, s.damage]), [['miss', 0]]);
    assert.deepEqual(r.escaped, {});
    assert.deepEqual(Object.keys(r.hex.ships), ['A1', 'B1']);
    assert.equal(r.end, null);
  });

  test('must escape every enemy Beam at once: one Escapes and one Miss is no escape', () => {
    const hex = createHex({
      A1: mk('A', { PD: 4, B: 3 }),
      A2: mk('A', { PD: 6, B: 3 }),
      B1: mk('B', { PD: 3 }),
    });
    const orders = {
      A1: { tactic: 'attack', D: 1, B: 3, beamTarget: 'B1' }, // -2: Escapes
      A2: { tactic: 'attack', D: 3, B: 3, beamTarget: 'B1' }, // 0: Miss
      B1: retreat(3),
    };
    const r = resolveRound(hex, orders);
    assert.deepEqual(r.shots.map((s) => s.result), ['escapes', 'miss']);
    assert.deepEqual(r.escaped, {});
  });

  test('D-025: a Missile Escapes is a Miss and does not affect escape', () => {
    const hex = createHex({ A1: mk('A', { PD: 1, T: 1, M: 1 }), B1: mk('B', { PD: 3 }) });
    const orders = {
      A1: { tactic: 'dodge', T: 1, missiles: [{ target: 'B1', drive: 1 }] }, // attack -2 vs retreat: Escapes
      B1: retreat(3),
    };
    const r = resolveRound(hex, orders);
    assert.deepEqual(r.shots.map((s) => [s.result, s.damage]), [['escapes', 0]]);
    assert.deepEqual(r.damage.B1, { total: 0, absorbed: 0, effective: 0 });
    assert.deepEqual(Object.keys(r.escaped), ['B1']);
  });

  test('D-026: a retreating ship hit by a Missile takes the damage and still escapes', () => {
    const hex = createHex({ A1: mk('A', { PD: 1, T: 1, M: 1 }), B1: mk('B', { PD: 5 }) });
    const orders = {
      A1: { tactic: 'dodge', T: 1, missiles: [{ target: 'B1', drive: 5 }] }, // attack +4 vs retreat: Hit, 2 hits
      B1: retreat(1),
    };
    const r = resolveRound(hex, orders, { B1: { PD: 2 } });
    assert.deepEqual(r.shots.map((s) => [s.result, s.damage]), [['hit', 2]]);
    assert.deepEqual(Object.keys(r.escaped), ['B1']);
    assert.equal(r.escaped.B1.PD, 3);
  });

  test('a retreating ship that is destroyed does not escape', () => {
    const hex = createHex({ A1: mk('A', { PD: 6, B: 3 }), B1: mk('B', { PD: 1 }) });
    const orders = { A1: { tactic: 'attack', D: 3, B: 3, beamTarget: 'B1' }, B1: retreat(0) }; // +3 vs retreat: Hit
    const r = resolveRound(hex, orders, { B1: { PD: 1 } });
    assert.deepEqual(r.destroyed, ['B1']);
    assert.deepEqual(r.escaped, {});
    assert.deepEqual(r.end, { reason: 'all destroyed', owners: ['B'] });
  });
});

describe('end conditions (§7 step 6)', () => {
  test('all of one side destroyed ends the combat', () => {
    const hex = createHex({ A1: mk('A', { PD: 3, B: 3 }), B1: mk('B', { PD: 1 }) });
    const orders = { A1: { tactic: 'attack', B: 3, beamTarget: 'B1' }, B1: { tactic: 'attack' } }; // 0: Hit +2
    const r = resolveRound(hex, orders, { B1: { PD: 1 } });
    assert.deepEqual(r.destroyed, ['B1']);
    assert.deepEqual(r.end, { reason: 'all destroyed', owners: ['B'] });
  });

  test('the combat continues while both sides still have ships', () => {
    const hex = createHex({ A1: mk('A', { PD: 1 }), B1: mk('B', { PD: 1 }) });
    const r = resolveRound(hex, { A1: { tactic: 'dodge' }, B1: { tactic: 'dodge' } });
    assert.equal(r.end, null);
  });

  test('three consecutive rounds with no unabsorbed damage is a forced withdrawal', () => {
    const quiet = { A1: { tactic: 'dodge' }, B1: { tactic: 'dodge' } };
    let hex = createHex({ A1: mk('A', { PD: 1 }), B1: mk('B', { PD: 1 }) });
    const ends = [];
    const counts = [];
    for (let i = 0; i < 3; i++) {
      const r = resolveRound(hex, quiet);
      ends.push(r.end);
      counts.push(r.hex.quietRounds);
      hex = r.hex;
    }
    assert.deepEqual(counts, [1, 2, 3]);
    assert.deepEqual(ends, [null, null, { reason: 'forced withdrawal' }]);
  });

  test('damage absorbed by Screens counts as no damage', () => {
    // Hit +2 from a Beam of 1 is 3 hits; B1's Screen of 3 absorbs all 3.
    const hex = createHex({ A1: mk('A', { PD: 1, B: 1 }), B1: mk('B', { PD: 3, S: 3 }) });
    const orders = { A1: { tactic: 'attack', B: 1, beamTarget: 'B1' }, B1: { tactic: 'attack', S: 3 } };
    const r = resolveRound(hex, orders);
    assert.deepEqual(r.damage.B1, { total: 3, absorbed: 3, effective: 0 });
    assert.equal(r.hex.quietRounds, 1);
  });

  test('a round with unabsorbed damage restarts the count', () => {
    const hex = { ...createHex({ A1: mk('A', { PD: 1, B: 1 }), B1: mk('B', { PD: 5 }) }), quietRounds: 2 };
    const orders = { A1: { tactic: 'attack', B: 1, beamTarget: 'B1' }, B1: { tactic: 'attack' } };
    const r = resolveRound(hex, orders, { B1: { PD: 3 } });
    assert.equal(r.hex.quietRounds, 0);
    assert.equal(r.end, null);
  });
});
