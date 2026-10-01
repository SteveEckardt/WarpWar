import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  neighbors,
  distance,
  isAdjacent,
  sameHex,
  validateMap,
  loadMap,
  starAt,
  starById,
  hasWarpline,
  onMap,
} from '../src/engine/map.js';

const raw = JSON.parse(readFileSync(new URL('./fixtures/test-map.json', import.meta.url), 'utf8'));
const codes = (errors) => errors.map((e) => e.code);
const star = (id, q, r, extra = {}) => ({ id, name: id.toUpperCase(), q, r, ...extra });

describe('axial geometry', () => {
  test('a hex has the six axial neighbours', () => {
    const expected = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const got = neighbors({ q: 0, r: 0 }).map((h) => [h.q, h.r]);
    assert.deepEqual(got.sort(), expected.sort());
    assert.deepEqual(
      neighbors({ q: 3, r: -2 }).map((h) => [h.q, h.r]).sort(),
      [[4, -2], [4, -3], [3, -3], [2, -2], [2, -1], [3, -1]].sort(),
    );
  });

  test('distance counts single-hex moves', () => {
    assert.equal(distance({ q: 0, r: 0 }, { q: 0, r: 0 }), 0);
    assert.equal(distance({ q: 0, r: 0 }, { q: 1, r: 0 }), 1);
    assert.equal(distance({ q: 0, r: 0 }, { q: 1, r: -1 }), 1);
    assert.equal(distance({ q: 0, r: 0 }, { q: 1, r: 1 }), 2);
    assert.equal(distance({ q: 9, r: 0 }, { q: 9, r: 3 }), 3);
    assert.equal(distance({ q: 0, r: 0 }, { q: 9, r: 3 }), 12);
    assert.equal(distance({ q: -2, r: 3 }, { q: 3, r: -1 }), 5);
  });

  test('distance is symmetric', () => {
    const a = { q: -4, r: 2 };
    const b = { q: 3, r: -5 };
    assert.equal(distance(a, b), distance(b, a));
    assert.equal(distance(a, b), 7);
  });

  test('adjacent means distance 1', () => {
    assert.equal(isAdjacent({ q: 0, r: 0 }, { q: 1, r: -1 }), true);
    assert.equal(isAdjacent({ q: 0, r: 0 }, { q: 1, r: 1 }), false);
    assert.equal(isAdjacent({ q: 0, r: 0 }, { q: 0, r: 0 }), false);
    assert.equal(isAdjacent({ q: 0, r: 0 }, { q: 2, r: 0 }), false);
  });

  test('sameHex compares coordinates', () => {
    assert.equal(sameHex({ q: 1, r: 2 }, { q: 1, r: 2 }), true);
    assert.equal(sameHex({ q: 1, r: 2 }, { q: 2, r: 1 }), false);
  });
});

describe('the test map', () => {
  const map = loadMap(raw);

  test('loads and is legal', () => {
    assert.deepEqual(validateMap(raw), []);
    assert.equal(map.stars.length, 7);
    assert.equal(map.warplines.length, 4);
  });

  test('has base stars for both players', () => {
    const owners = (o) => map.stars.filter((s) => s.baseOwner === o).map((s) => s.id).sort();
    assert.deepEqual(owners('A'), ['eridu', 'ur']);
    assert.deepEqual(owners('B'), ['adab', 'nippur']);
  });

  test('the Umma-Girsu warpline crosses space hexes', () => {
    const umma = starById(map, 'umma');
    const girsu = starById(map, 'girsu');
    assert.equal(distance(umma, girsu), 8);
    // The hex at (4, 0) is on a shortest path between the two ends, and holds no star.
    const crossed = { q: 4, r: 0 };
    assert.equal(distance(umma, crossed) + distance(crossed, girsu), 8);
    assert.equal(starAt(map, crossed), null);
  });
});

describe('lookups', () => {
  const map = loadMap(raw);

  test('starAt and starById find stars', () => {
    assert.equal(starAt(map, { q: 1, r: 0 }).id, 'umma');
    assert.equal(starAt(map, { q: 2, r: 0 }), null);
    assert.equal(starById(map, 'kish').name, 'Kish');
    assert.equal(starById(map, 'nowhere'), null);
  });

  test('warplines work in both directions and only between linked stars', () => {
    assert.equal(hasWarpline(map, 'umma', 'girsu'), true);
    assert.equal(hasWarpline(map, 'girsu', 'umma'), true);
    assert.equal(hasWarpline(map, 'umma', 'kish'), false);
    assert.equal(hasWarpline(map, 'umma', 'umma'), false);
  });
});

describe('map validation', () => {
  test('rejects data without a star list', () => {
    assert.deepEqual(codes(validateMap(null)), ['BAD_MAP']);
    assert.deepEqual(codes(validateMap({})), ['BAD_MAP']);
  });

  test('rejects unknown fields', () => {
    assert.deepEqual(codes(validateMap({ stars: [], hexes: [] })), ['UNKNOWN_FIELD']);
    assert.deepEqual(codes(validateMap({ stars: [star('a', 0, 0, { owner: 'A' })] })), ['UNKNOWN_FIELD']);
  });

  test('rejects bad stars', () => {
    assert.deepEqual(codes(validateMap({ stars: [{ id: 'a', q: 0, r: 0 }] })), ['BAD_STAR']);
    assert.deepEqual(codes(validateMap({ stars: [star('a', 0.5, 0)] })), ['BAD_STAR']);
    assert.deepEqual(codes(validateMap({ stars: [star('a', 0, 0, { baseOwner: 3 })] })), ['BAD_STAR']);
    assert.deepEqual(codes(validateMap({ stars: [{ name: 'X', q: 0, r: 0 }] })), ['BAD_STAR']);
  });

  test('rejects duplicate ids and two stars on one hex', () => {
    assert.deepEqual(codes(validateMap({ stars: [star('a', 0, 0), star('a', 1, 0)] })), ['DUPLICATE_STAR']);
    assert.deepEqual(codes(validateMap({ stars: [star('a', 0, 0), star('b', 0, 0)] })), ['STAR_HEX_TAKEN']);
  });

  test('rejects bad and duplicate warplines', () => {
    const stars = [star('a', 0, 0), star('b', 3, 0)];
    assert.deepEqual(codes(validateMap({ stars, warplines: [['a', 'z']] })), ['BAD_WARPLINE']);
    assert.deepEqual(codes(validateMap({ stars, warplines: [['a', 'a']] })), ['BAD_WARPLINE']);
    assert.deepEqual(codes(validateMap({ stars, warplines: [['a']] })), ['BAD_WARPLINE']);
    assert.deepEqual(codes(validateMap({ stars, warplines: [['a', 'b'], ['b', 'a']] })), ['DUPLICATE_WARPLINE']);
  });

  test('a map with no warplines is legal', () => {
    assert.deepEqual(validateMap({ stars: [star('a', 0, 0)] }), []);
  });

  test('loadMap throws on an illegal map, and normalises a legal one without touching the input', () => {
    assert.throws(() => loadMap({ stars: [star('a', 0, 0), star('a', 1, 1)] }), /DUPLICATE_STAR/);
    const input = { stars: [star('a', 0, 0)] };
    const snapshot = structuredClone(input);
    const map = loadMap(input);
    assert.deepEqual(input, snapshot);
    assert.equal(map.stars[0].baseOwner, null);
    assert.deepEqual(map.warplines, []);
  });
});

// D-040: the map edge is part of the map data. bounds: { x: [min, max], r: [min, max] }, where x = q + r/2 is the
// column (as in docs/maps/classic-original.md) and r the row. A hex is on the map if both lie inside, inclusive.
describe('map edge (D-040)', () => {
  const bounded = (bounds, stars = [star('a', 0, 0)]) => ({ stars, bounds });

  test('a map without bounds has no edge', () => {
    const map = loadMap({ stars: [star('a', 0, 0)] });
    assert.equal(map.bounds, null);
    assert.equal(onMap(map, { q: 1000, r: -1000 }), true);
  });

  test('legal bounds load and are copied', () => {
    const input = bounded({ x: [-2, 2], r: [-1, 1] });
    const map = loadMap(input);
    assert.deepEqual(map.bounds, { x: [-2, 2], r: [-1, 1] });
    assert.notEqual(map.bounds.x, input.bounds.x);
  });

  test('on the map: row within r, column q + r/2 within x, edges included', () => {
    const map = loadMap(bounded({ x: [-2, 2], r: [-1, 1] }));
    assert.equal(onMap(map, { q: 2, r: 0 }), true);
    assert.equal(onMap(map, { q: 3, r: 0 }), false);
    assert.equal(onMap(map, { q: -2, r: 0 }), true);
    assert.equal(onMap(map, { q: 1, r: 1 }), true, 'column 1.5');
    assert.equal(onMap(map, { q: 2, r: 1 }), false, 'column 2.5');
    assert.equal(onMap(map, { q: -2, r: 1 }), true, 'column -1.5');
    assert.equal(onMap(map, { q: -3, r: 1 }), false, 'column -2.5');
    assert.equal(onMap(map, { q: 0, r: 2 }), false);
    assert.equal(onMap(map, { q: 0, r: -1 }), true);
  });

  test('rejects malformed bounds', () => {
    for (const bounds of [null, [], { x: [0, 1] }, { x: [0, 1], r: [0] }, { x: [0.5, 1], r: [0, 1] }, { x: [1, 0], r: [0, 1] }, { x: [0, 1], r: [0, 1], q: [0, 1] }]) {
      assert.deepEqual(codes(validateMap(bounded(bounds))), ['BAD_BOUNDS'], JSON.stringify(bounds));
    }
  });

  test('every star must be on the map', () => {
    assert.deepEqual(codes(validateMap(bounded({ x: [-1, 1], r: [-1, 1] }, [star('a', 0, 0), star('b', 2, 0)]))), ['STAR_OFF_MAP']);
  });

  test('the original map: the area the renderers draw, stars plus 2 hexes all round', () => {
    const data = JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8'));
    assert.deepEqual(data.bounds, { x: [-13, 13], r: [-8, 8] });
    const map = loadMap(data);
    const xs = map.stars.map((s) => s.q + s.r / 2);
    const rs = map.stars.map((s) => s.r);
    assert.deepEqual([Math.min(...xs) - 2, Math.max(...xs) + 2], map.bounds.x);
    assert.deepEqual([Math.min(...rs) - 2, Math.max(...rs) + 2], map.bounds.r);
  });
});
