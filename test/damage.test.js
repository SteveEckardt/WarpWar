import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hitDamage, screenAbsorption, roundDamage, applyHits, isDestroyed } from '../src/engine/damage.js';
import { lookupCRT } from '../src/engine/crt.js';

const HIT = { result: 'hit', bonus: 0 };
const MISS = { result: 'miss', bonus: 0 };
const beam = (power) => ({ type: 'beam', power });
const missile = { type: 'missile' };

// Ship record as createShip builds it (src/engine/ships.js).
const ship = (stats, level = 0) => {
  const full = { PD: 0, B: 0, S: 0, T: 0, M: 0, SR: 0, ...stats };
  return { WG: true, level, ...full, built: { ...full } };
};

describe('hitDamage (§5.2, §7.2.1)', () => {
  test('§5.2 tech example: level 2 Beam of 4 that hits does 6 hits', () => {
    assert.equal(hitDamage(beam(4), 2, HIT), 6);
  });

  test('a Beam hit does its power plus tech level', () => {
    assert.equal(hitDamage(beam(3), 0, HIT), 3);
    assert.equal(hitDamage(beam(3), 3, HIT), 6);
  });

  test('a Missile hit does 2 plus tech level', () => {
    assert.equal(hitDamage(missile, 0, HIT), 2);
    assert.equal(hitDamage(missile, 1, HIT), 3);
  });

  test('Hit +1 and Hit +2 add that many hits', () => {
    assert.equal(hitDamage(missile, 1, { result: 'hit', bonus: 2 }), 5);
    assert.equal(hitDamage(missile, 1, { result: 'hit', bonus: 1 }), 4);
    assert.equal(hitDamage(beam(2), 0, { result: 'hit', bonus: 2 }), 4);
  });

  test('a miss does no damage', () => {
    assert.equal(hitDamage(beam(4), 2, MISS), 0);
    assert.equal(hitDamage(missile, 3, MISS), 0);
  });

  test('a Beam must be powered at 1 or more to fire (D-030)', () => {
    assert.throws(() => hitDamage(beam(0), 2, HIT), RangeError);
    assert.throws(() => hitDamage(beam(0), 2, MISS), RangeError);
  });

  test('escapes results are rejected (D-025 is open)', () => {
    assert.throws(() => hitDamage(missile, 0, { result: 'escapes', bonus: 0 }), RangeError);
  });

  test('rejects bad weapons, levels, powers and cells', () => {
    assert.throws(() => hitDamage({ type: 'torpedo' }, 0, HIT), RangeError);
    assert.throws(() => hitDamage(undefined, 0, HIT), RangeError);
    assert.throws(() => hitDamage(missile, -1, HIT), RangeError);
    assert.throws(() => hitDamage(missile, 0.5, HIT), RangeError);
    assert.throws(() => hitDamage(beam(1.5), 0, HIT), RangeError);
    assert.throws(() => hitDamage(missile, 0, { result: 'boom', bonus: 0 }), RangeError);
    assert.throws(() => hitDamage(missile, 0, undefined), RangeError);
  });
});

describe('screenAbsorption (§5.2, §7.2.2)', () => {
  test('powered Screen absorbs power plus tech level', () => {
    assert.equal(screenAbsorption(3, 1), 4);
    assert.equal(screenAbsorption(1, 0), 1);
  });

  test('an unpowered Screen adds no tech level', () => {
    assert.equal(screenAbsorption(0, 2), 0);
  });

  test('rejects bad values', () => {
    assert.throws(() => screenAbsorption(-1, 0), RangeError);
    assert.throws(() => screenAbsorption(1, 1.5), RangeError);
  });
});

describe('roundDamage', () => {
  test('§5.2 tech example: 6 hits vs Screen 3 at level 1 leaves 2 effective', () => {
    assert.deepEqual(roundDamage([hitDamage(beam(4), 2, HIT)], 3, 1), { total: 6, absorbed: 4, effective: 2 });
  });

  test('§7.2.2 example: 7 hits vs Screen 4 at level 0 leaves 3 effective', () => {
    assert.deepEqual(roundDamage([7], 4, 0), { total: 7, absorbed: 4, effective: 3 });
  });

  test('hits from all weapons are summed and the Screen subtracts once', () => {
    assert.deepEqual(roundDamage([5, 4], 1, 0), { total: 9, absorbed: 1, effective: 8 });
  });

  test('effective hits never go below zero', () => {
    assert.deepEqual(roundDamage([2], 5, 1), { total: 2, absorbed: 2, effective: 0 });
  });

  test('no hits means no damage', () => {
    assert.deepEqual(roundDamage([], 3, 1), { total: 0, absorbed: 0, effective: 0 });
  });

  test('rejects bad hit counts', () => {
    assert.throws(() => roundDamage([-1], 0, 0), RangeError);
    assert.throws(() => roundDamage([1.5], 0, 0), RangeError);
  });
});

describe('applyHits (§7.2.2)', () => {
  // D-001: the printed example powers Screens at 4 on W4's S=3 record, which is an error.
  // Same arithmetic on a ship built with S=4.
  test('§7.2.2 example round: 7 hits, Screen 4, 3 effective taken in PD, S and M', () => {
    const before = ship({ PD: 7, B: 3, S: 4, T: 1, M: 6, SR: 1 });
    const { effective } = roundDamage([7], 4, 0);
    assert.equal(effective, 3);
    const after = applyHits(before, { PD: 1, S: 1, M: 1 });
    assert.deepEqual(
      { PD: after.PD, B: after.B, S: after.S, T: after.T, M: after.M, SR: after.SR },
      { PD: 6, B: 3, S: 3, T: 1, M: 3, SR: 1 },
    );
  });

  // W4 at the end of the first round, as printed in §7.2.2.
  const W4 = ship({ PD: 6, B: 3, S: 2, T: 1, M: 3, SR: 1 });
  // S35 (level 1) dodges at Drive 4 (D-004), firing Missiles at Drive 3 and 4 at W4.
  // W4 attacks at Drive 2 with its Beam at 3 and Screen at 1.
  const missiles = [3, 4].map((drive) => hitDamage(missile, 1, lookupCRT('attack', 'attack', drive - 2)));
  const beamResult = hitDamage(beam(3), 0, lookupCRT('attack', 'dodge', 2 - 4));

  test('§7.2.2 second round: Missiles inflict 5 and 4 hits, 9 total', () => {
    assert.deepEqual(missiles, [5, 4]);
  });

  test('§7.2.2 second round: W4 misses S35 with its Beam, so S35 takes no damage', () => {
    assert.equal(beamResult, 0);
    assert.deepEqual(roundDamage([beamResult], 0, 1), { total: 0, absorbed: 0, effective: 0 });
  });

  test('§7.2.2 second round: Screen 1 absorbs 1 of 9, leaving 8 effective', () => {
    assert.deepEqual(roundDamage(missiles, 1, W4.level), { total: 9, absorbed: 1, effective: 8 });
  });

  test('§7.2.2 second round: W4 takes 8 hits and keeps its PD', () => {
    const allocation = { B: 3, S: 2, T: 1, M: 1, SR: 1 };
    assert.equal(Object.values(allocation).reduce((a, b) => a + b, 0), 8);
    const after = applyHits(W4, allocation);
    assert.deepEqual(
      { PD: after.PD, B: after.B, S: after.S, T: after.T, M: after.M, SR: after.SR },
      { PD: 6, B: 0, S: 0, T: 0, M: 0, SR: 0 },
    );
    assert.equal(isDestroyed(after), false);
  });

  test('a hit in Missiles takes 3 when 3 or more remain', () => {
    assert.equal(applyHits(ship({ M: 6 }), { M: 1 }).M, 3);
    assert.equal(applyHits(ship({ M: 7 }), { M: 1 }).M, 4);
    assert.equal(applyHits(ship({ M: 7 }), { M: 3 }).M, 0);
  });

  test('a hit in Missiles takes the last 1 or 2', () => {
    assert.equal(applyHits(ship({ M: 2 }), { M: 1 }).M, 0);
    assert.equal(applyHits(ship({ M: 1 }), { M: 1 }).M, 0);
  });

  test('rejects more hits than an attribute can take', () => {
    assert.throws(() => applyHits(ship({ PD: 2 }), { PD: 3 }), RangeError);
    assert.throws(() => applyHits(ship({ M: 2 }), { M: 2 }), RangeError);
    assert.throws(() => applyHits(ship({ PD: 2 }), { B: 1 }), RangeError);
  });

  test('the Warp Generator cannot be hit, and unknown attributes are rejected', () => {
    assert.throws(() => applyHits(ship({ PD: 2 }), { WG: 1 }), RangeError);
    assert.throws(() => applyHits(ship({ PD: 2 }), { level: 1 }), RangeError);
    assert.throws(() => applyHits(ship({ PD: 2 }), { built: 1 }), RangeError);
  });

  test('rejects negative and non-integer hits', () => {
    assert.throws(() => applyHits(ship({ PD: 2 }), { PD: -1 }), RangeError);
    assert.throws(() => applyHits(ship({ PD: 2 }), { PD: 0.5 }), RangeError);
  });

  test('keeps WG, level and original strengths, and does not mutate the input', () => {
    const before = ship({ PD: 5, B: 3 }, 2);
    const snapshot = structuredClone(before);
    const after = applyHits(before, { PD: 2 });
    assert.deepEqual(before, snapshot);
    assert.equal(after.WG, true);
    assert.equal(after.level, 2);
    assert.deepEqual(after.built, { PD: 5, B: 3, S: 0, T: 0, M: 0, SR: 0 });
    assert.equal(after.PD, 3);
    assert.notEqual(after.built, before.built);
  });
});

describe('isDestroyed (§7.2.2)', () => {
  test('a ship is destroyed when every attribute but the Warp Generator is 0', () => {
    assert.equal(isDestroyed(ship({ PD: 0, B: 0, S: 0, T: 0, M: 0, SR: 0 })), true);
    assert.equal(isDestroyed(ship({ PD: 0, B: 0, S: 0, T: 0, M: 0, SR: 1 })), false);
    assert.equal(isDestroyed(ship({ PD: 1 })), false);
  });

  test('applying all remaining hits destroys the ship', () => {
    const after = applyHits(ship({ PD: 2, B: 1, M: 4 }), { PD: 2, B: 1, M: 2 });
    assert.equal(isDestroyed(after), true);
  });
});
