import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { lookupCRT, TACTICS } from '../src/engine/crt.js';

const M = { result: 'miss', bonus: 0 };
const H = { result: 'hit', bonus: 0 };
const H1 = { result: 'hit', bonus: 1 };
const H2 = { result: 'hit', bonus: 2 };
const E = { result: 'escapes', bonus: 0 };

// Rulebook §7.2 Table 1, transcribed independently of the implementation.
// Each row: firing tactic, [lo, hi] (null = open end), cells for target [attack, dodge, retreat].
const ROWS = [
  ['attack', [null, -3], [M, M, E]],
  ['attack', [-2, -1], [H, M, E]],
  ['attack', [0, 1], [H2, M, M]],
  ['attack', [2, 2], [H1, H1, M]],
  ['attack', [3, 4], [M, H, H]],
  ['attack', [5, null], [M, M, M]],
  ['dodge', [null, -4], [M, M, E]],
  ['dodge', [-3, -2], [M, H, E]],
  ['dodge', [-1, 0], [H, H, E]],
  ['dodge', [1, 2], [H, M, E]],
  ['dodge', [3, null], [M, M, E]],
  ['retreat', [null, -2], [M, M, E]],
  ['retreat', [-1, 0], [H, M, E]],
  ['retreat', [1, null], [M, M, E]],
];

const label = ([lo, hi]) => `${lo ?? '-inf'}..${hi ?? '+inf'}`;

describe('lookupCRT every cell (§7.2)', () => {
  for (const [firing, range, cells] of ROWS) {
    const [lo, hi] = range;
    // A representative difference inside the band; open ends use 3 past the bound.
    const mid = lo === null ? hi - 3 : hi === null ? lo + 3 : lo;
    TACTICS.forEach((target, i) => {
      test(`${firing} vs ${target}, ${label(range)}`, () => {
        assert.deepEqual(lookupCRT(firing, target, mid), cells[i]);
      });
    });
  }
});

describe('lookupCRT row boundaries', () => {
  for (const [firing, range, cells] of ROWS) {
    const [lo, hi] = range;
    // Both ends of the band, plus far into any open-ended side.
    const inside = [lo ?? hi - 10, lo ?? hi, hi ?? lo, hi ?? lo + 10];
    TACTICS.forEach((target, i) => {
      test(`${firing} vs ${target}, ${label(range)} edges`, () => {
        for (const diff of inside) {
          assert.deepEqual(lookupCRT(firing, target, diff), cells[i], `diff ${diff}`);
        }
      });
    });
  }

  test('the value just outside each band belongs to the neighbouring row', () => {
    for (const firing of TACTICS) {
      const rows = ROWS.filter((r) => r[0] === firing);
      rows.forEach(([, [lo, hi]], idx) => {
        if (hi !== null) {
          const next = rows[idx + 1][2];
          TACTICS.forEach((target, i) => {
            assert.deepEqual(lookupCRT(firing, target, hi + 1), next[i]);
          });
        }
        if (lo !== null) {
          const prev = rows[idx - 1][2];
          TACTICS.forEach((target, i) => {
            assert.deepEqual(lookupCRT(firing, target, lo - 1), prev[i]);
          });
        }
      });
    }
  });

  test('bands cover every difference from -10 to +10', () => {
    for (const firing of TACTICS) {
      for (const target of TACTICS) {
        for (let d = -10; d <= 10; d++) {
          assert.ok(['miss', 'hit', 'escapes'].includes(lookupCRT(firing, target, d).result));
        }
      }
    }
  });
});

describe('worked examples (§7.2.1)', () => {
  test('Beam: Dodge at Drive 3 vs Attack at Drive 2 (+1) is a Hit', () => {
    assert.deepEqual(lookupCRT('dodge', 'attack', 3 - 2), { result: 'hit', bonus: 0 });
  });

  test('Beam: the same row is read at +2', () => {
    assert.deepEqual(lookupCRT('dodge', 'attack', 2), { result: 'hit', bonus: 0 });
  });

  test('Missile: Drive 4 vs Attack at Drive 3 (+1) is Hit +2', () => {
    assert.deepEqual(lookupCRT('attack', 'attack', 4 - 3), { result: 'hit', bonus: 2 });
  });
});

describe('lookupCRT results are independent copies', () => {
  test('mutating a result does not change later lookups', () => {
    const first = lookupCRT('attack', 'attack', 0);
    first.bonus = 99;
    assert.deepEqual(lookupCRT('attack', 'attack', 0), { result: 'hit', bonus: 2 });
  });
});

describe('lookupCRT validation', () => {
  test('rejects invalid firing tactics', () => {
    for (const bad of ['Attack', 'retreating', 'flee', '', null, undefined, 1]) {
      assert.throws(() => lookupCRT(bad, 'attack', 0), RangeError, String(bad));
    }
  });

  test('rejects invalid target tactics', () => {
    for (const bad of ['Dodge', 'attacking', 'flee', '', null, undefined, 1]) {
      assert.throws(() => lookupCRT('attack', bad, 0), RangeError, String(bad));
    }
  });

  test('rejects non-integer differences', () => {
    for (const bad of [1.5, -0.5, NaN, Infinity, -Infinity, '1', null, undefined, {}]) {
      assert.throws(() => lookupCRT('attack', 'attack', bad), RangeError, String(bad));
    }
  });
});
