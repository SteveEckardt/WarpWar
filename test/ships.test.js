import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { shipCost, techLevel, validateShip, createShip } from '../src/engine/ships.js';

// Rulebook §5.1 example ships. Records as printed; WG added where the ship is a Warpship.
const W2 = { WG: true, PD: 5, B: 3, S: 2, T: 1, M: 3, SR: 0 };
const W7 = { WG: true, PD: 5, B: 0, S: 0, T: 0, M: 0, SR: 2 };
const S20 = { WG: false, PD: 7, B: 8, S: 5, T: 0, M: 0 };
const S55 = { WG: false, PD: 1, B: 0, S: 0, T: 1, M: 6 };

const codes = (errors) => errors.map((e) => e.code);

describe('shipCost (§5.1)', () => {
  test('W2: attributes total 12 BP, 17 BP with the warp generator', () => {
    assert.equal(shipCost({ ...W2, WG: false }), 12);
    assert.equal(shipCost(W2), 17);
  });

  test('W7 costs 12 BP', () => {
    assert.equal(shipCost(W7), 12);
  });

  test('S20 costs 20 BP', () => {
    assert.equal(shipCost(S20), 20);
  });

  test('S55 costs 4 BP', () => {
    assert.equal(shipCost(S55), 4);
  });

  test('omitted attributes count as zero', () => {
    assert.equal(shipCost({ PD: 3 }), 3);
    assert.equal(shipCost({ WG: true, PD: 1 }), 6);
  });

  test('Missiles cost ceil(M / 3) BP per ship (D-015)', () => {
    assert.equal(shipCost({ PD: 1, M: 1 }), 2);
    assert.equal(shipCost({ PD: 1, M: 3 }), 2);
    assert.equal(shipCost({ PD: 1, M: 4 }), 3);
    assert.equal(shipCost({ PD: 1, M: 7 }), 4);
  });
});

describe('techLevel (§5.2)', () => {
  test('Advanced: turns 1-4 are Level 0, 5-8 Level 1, 9-12 Level 2 (D-002), 13-16 Level 3', () => {
    const cases = [
      [1, 0], [4, 0], [5, 1], [8, 1], [9, 2], [12, 2], [13, 3], [16, 3], [17, 4],
    ];
    for (const [turn, level] of cases) {
      assert.equal(techLevel('advanced', turn), level, `turn ${turn}`);
    }
  });

  test('rulebook examples: W2 turn 3 → 0, W7 turn 6 → 1, S20 turn 2 → 0, S55 turn 9 → 2', () => {
    assert.equal(techLevel('advanced', 3), 0);
    assert.equal(techLevel('advanced', 6), 1);
    assert.equal(techLevel('advanced', 2), 0);
    assert.equal(techLevel('advanced', 9), 2);
  });

  test('Learning and Basic: always Level 0 (D-011)', () => {
    assert.equal(techLevel('learning', 9), 0);
    assert.equal(techLevel('basic', 20), 0);
  });

  test('rejects a turn that is not a positive integer', () => {
    assert.throws(() => techLevel('advanced', 0), RangeError);
    assert.throws(() => techLevel('advanced', 1.5), RangeError);
  });

  test('rejects an unknown scenario', () => {
    assert.throws(() => techLevel('epic', 1), RangeError);
  });
});

describe('validateShip', () => {
  test('rulebook example ships are valid in the Advanced scenario', () => {
    for (const ship of [W2, W7, S20, S55]) {
      assert.deepEqual(validateShip(ship, 'advanced'), []);
    }
  });

  test('attributes must be non-negative integers', () => {
    assert.deepEqual(codes(validateShip({ PD: -1, B: 2 }, 'advanced')), ['BAD_VALUE']);
    assert.deepEqual(codes(validateShip({ PD: 1.5 }, 'advanced')), ['BAD_VALUE']);
    assert.deepEqual(codes(validateShip({ PD: '3' }, 'advanced')), ['BAD_VALUE']);
  });

  test('WG must be a boolean', () => {
    assert.deepEqual(codes(validateShip({ WG: 1, PD: 1 }, 'advanced')), ['BAD_VALUE']);
  });

  test('unknown attributes are rejected', () => {
    assert.deepEqual(codes(validateShip({ PD: 1, X: 2 }, 'advanced')), ['UNKNOWN_ATTRIBUTE']);
  });

  test('Systemships may not have Systemship Racks (§5.1)', () => {
    assert.deepEqual(codes(validateShip({ PD: 2, SR: 1 }, 'advanced')), ['SR_ON_SYSTEMSHIP']);
  });

  test('a ship needs one attribute above zero besides the WG (D-014)', () => {
    assert.deepEqual(codes(validateShip({ WG: true }, 'advanced')), ['EMPTY_SHIP']);
    assert.deepEqual(codes(validateShip({ WG: false, PD: 0 }, 'advanced')), ['EMPTY_SHIP']);
    assert.deepEqual(validateShip({ WG: true, SR: 1 }, 'advanced'), []);
    assert.deepEqual(validateShip({ M: 1 }, 'advanced'), []);
  });

  test('Learning: Warpships only (§4.1)', () => {
    assert.deepEqual(codes(validateShip(S20, 'learning')), ['WARPSHIPS_ONLY']);
    assert.deepEqual(validateShip(W2, 'learning'), []);
  });

  test('Learning: no Systemship Racks (D-012)', () => {
    assert.deepEqual(codes(validateShip(W7, 'learning')), ['NO_SR_IN_LEARNING']);
  });

  test('Basic: Systemships and racks are allowed (§4.2)', () => {
    for (const ship of [W2, W7, S20, S55]) {
      assert.deepEqual(validateShip(ship, 'basic'), []);
    }
  });

  test('errors carry a message', () => {
    const [error] = validateShip({ WG: true }, 'advanced');
    assert.equal(typeof error.message, 'string');
    assert.ok(error.message.length > 0);
  });

  test('rejects an unknown scenario', () => {
    assert.throws(() => validateShip(W2, 'epic'), RangeError);
  });
});

describe('createShip', () => {
  test('W2 built on turn 3 of the Advanced scenario', () => {
    assert.deepEqual(createShip(W2, 'advanced', 3), {
      WG: true, level: 0, PD: 5, B: 3, S: 2, T: 1, M: 3, SR: 0,
      built: { PD: 5, B: 3, S: 2, T: 1, M: 3, SR: 0 },
    });
  });

  test('S55 built on turn 9 of the Advanced scenario', () => {
    assert.deepEqual(createShip(S55, 'advanced', 9), {
      WG: false, level: 2, PD: 1, B: 0, S: 0, T: 1, M: 6, SR: 0,
      built: { PD: 1, B: 0, S: 0, T: 1, M: 6, SR: 0 },
    });
  });

  test('built values record the original strengths, including the Missile resupply cap (D-015)', () => {
    const ship = createShip({ WG: true, PD: 2, M: 4 }, 'advanced', 1);
    assert.equal(ship.built.M, 4);
  });

  test('does not share or mutate the design', () => {
    const design = { ...W2 };
    const ship = createShip(design, 'advanced', 1);
    assert.deepEqual(design, W2);
    assert.notEqual(ship.built, design);
  });

  test('throws on an invalid design', () => {
    assert.throws(() => createShip({ WG: true }, 'advanced', 1), /EMPTY_SHIP/);
    assert.throws(() => createShip(S20, 'learning', 1), /WARPSHIPS_ONLY/);
  });
});
