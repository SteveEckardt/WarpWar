import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadMap } from '../src/engine/map.js';
import { validateMove } from '../src/engine/movement.js';

const map = loadMap(JSON.parse(readFileSync(new URL('./fixtures/test-map.json', import.meta.url), 'utf8')));

// Rulebook display ids (§6.2.1) mapped to axial hexes on the test map. Humans only (D-019).
const H = {
  1720: { q: 0, r: 0 },
  1919: { q: 5, r: 0 },
  1818: { q: 4, r: 0 },
  1717: { q: 3, r: 0 },
  Umma: { q: 1, r: 0 },
  Girsu: { q: 9, r: 0 },
  Kish: { q: 9, r: 3 },
  Nippur: { q: 12, r: 0 },
};
const move = (to) => ({ type: 'move', to });
const jump = (to) => ({ type: 'jump', to });
const warpship = (PD, owner = 'A') => ({ owner, WG: true, PD });
const world = (turn = 5, ships = []) => ({ turn, ships });
const codes = (result) => result.errors.map((e) => e.code);

describe('§6.2.1 examples on the test map', () => {
  // W6 starts on space hex 1720, moves onto Umma (1 MP), along the warpline to Girsu (1 MP),
  // moves 3 hexes to Kish (3 MP) and stops. It spent 5 MP.
  const w6Path = [move(H.Umma), jump('girsu'), move({ q: 9, r: 1 }), move({ q: 9, r: 2 }), move(H.Kish)];

  test('W6: 1720 to Umma, warpline to Girsu, 3 hexes to Kish costs 5 MP', () => {
    const r = validateMove(map, warpship(5), H[1720], w6Path, world());
    assert.deepEqual(r, { errors: [], cost: 5, end: H.Kish });
  });

  test('W6 cannot make the trip with a PD of 4', () => {
    const r = validateMove(map, warpship(4), H[1720], w6Path, world());
    assert.deepEqual(codes(r), ['OVER_MP']);
    assert.equal(r.cost, 5);
    assert.equal(r.end, null);
  });

  // W8 starts on hex 1919 and moves two hexes to 1717 for 2 MP. A warpline passes through 1818;
  // W8 treats it like any other space hex.
  test('W8: 1919 to 1717 through 1818 costs 2 MP', () => {
    const r = validateMove(map, warpship(2), H[1919], [move(H[1818]), move(H[1717])], world());
    assert.deepEqual(r, { errors: [], cost: 2, end: H[1717] });
  });

  test('W8 cannot enter the warpline at 1818, in the middle (D-006)', () => {
    const r = validateMove(map, warpship(5), H[1818], [jump('girsu')], world());
    assert.deepEqual(codes(r), ['NOT_A_STAR_HEX']);
  });
});

describe('warpline jumps (§6.2, D-006)', () => {
  test('a jump costs 1 MP, from either end', () => {
    assert.deepEqual(validateMove(map, warpship(1), H.Umma, [jump('girsu')], world()), { errors: [], cost: 1, end: H.Girsu });
    assert.deepEqual(validateMove(map, warpship(1), H.Girsu, [jump('umma')], world()), { errors: [], cost: 1, end: H.Umma });
  });

  test('a jump needs a warpline between the two stars', () => {
    assert.deepEqual(codes(validateMove(map, warpship(3), H.Umma, [jump('kish')], world())), ['NO_WARPLINE']);
    assert.deepEqual(codes(validateMove(map, warpship(3), H.Umma, [jump('nowhere')], world())), ['NO_WARPLINE']);
    assert.deepEqual(codes(validateMove(map, warpship(3), H.Umma, [{ type: 'jump', to: 7 }], world())), ['NO_WARPLINE']);
  });

  test('a ship may chain jumps through a star', () => {
    const r = validateMove(map, warpship(2), H.Umma, [jump('girsu'), jump('nippur')], world());
    assert.deepEqual(r, { errors: [], cost: 2, end: H.Nippur });
  });
});

describe('hex moves', () => {
  test('each hex moved costs 1 MP', () => {
    const r = validateMove(map, warpship(3), H[1919], [move(H[1818]), move(H[1717]), move({ q: 2, r: 0 })], world());
    assert.deepEqual(r, { errors: [], cost: 3, end: { q: 2, r: 0 } });
  });

  test('a path costing more than the PD is rejected', () => {
    const r = validateMove(map, warpship(2), H[1919], [move(H[1818]), move(H[1717]), move({ q: 2, r: 0 })], world());
    assert.deepEqual(codes(r), ['OVER_MP']);
    assert.equal(r.cost, 3);
  });

  test('a move must go to an adjacent hex', () => {
    const r = validateMove(map, warpship(5), H[1919], [move(H[1717])], world());
    assert.deepEqual(r.errors, [{ code: 'NOT_ADJACENT', message: r.errors[0].message, step: 0 }]);
  });

  test('rejects malformed steps', () => {
    assert.deepEqual(codes(validateMove(map, warpship(5), H[1919], [{ type: 'move' }], world())), ['BAD_STEP']);
    assert.deepEqual(codes(validateMove(map, warpship(5), H[1919], [{ type: 'fly', to: H[1818] }], world())), ['BAD_STEP']);
    assert.deepEqual(codes(validateMove(map, warpship(5), H[1919], [null], world())), ['BAD_STEP']);
  });

  test('an empty path is legal and costs nothing, even at PD 0', () => {
    assert.deepEqual(validateMove(map, warpship(0), H[1919], [], world()), { errors: [], cost: 0, end: H[1919] });
  });

  test('a start that is not a hex throws', () => {
    assert.throws(() => validateMove(map, warpship(1), { q: 1 }, [], world()), RangeError);
    assert.throws(() => validateMove(map, warpship(1), H[1919], [], { turn: 0, ships: [] }), RangeError);
  });
});

describe('who can move (§6.1 rule 4, §2)', () => {
  test('a Warpship with PD 0 may not move', () => {
    assert.deepEqual(codes(validateMove(map, warpship(0), H[1919], [move(H[1818])], world())), ['ZERO_PD', 'OVER_MP']);
  });

  test('Systemships cannot move alone', () => {
    const sys = { owner: 'A', WG: false, PD: 5 };
    assert.deepEqual(codes(validateMove(map, sys, H[1919], [move(H[1818])], world())), ['SYSTEMSHIP_MOVE']);
  });
});

describe('enemy ships (§6.1 rules 1-2, D-016)', () => {
  const enemyAt = (hex) => world(5, [{ owner: 'B', ...hex }]);

  test('a ship must stop on a star hex occupied by an enemy ship', () => {
    const w = enemyAt(H.Umma);
    const r = validateMove(map, warpship(5), H[1720], [move(H.Umma), move({ q: 2, r: 0 })], w);
    assert.deepEqual(r.errors.map((e) => [e.code, e.step]), [['MUST_STOP', 1]]);
  });

  test('stopping on that star hex is legal', () => {
    const r = validateMove(map, warpship(5), H[1720], [move(H.Umma)], enemyAt(H.Umma));
    assert.deepEqual(r, { errors: [], cost: 1, end: H.Umma });
  });

  test('the same holds when arriving by warpline', () => {
    const w = enemyAt(H.Girsu);
    const on = validateMove(map, warpship(5), H.Umma, [jump('girsu')], w);
    assert.deepEqual(on, { errors: [], cost: 1, end: H.Girsu });
    const past = validateMove(map, warpship(5), H.Umma, [jump('girsu'), move({ q: 9, r: 1 })], w);
    assert.deepEqual(past.errors.map((e) => [e.code, e.step]), [['MUST_STOP', 1]]);
  });

  test('a warpline jump passes over enemy ships on the hexes it crosses', () => {
    const r = validateMove(map, warpship(5), H.Umma, [jump('girsu')], enemyAt(H[1818]));
    assert.deepEqual(r, { errors: [], cost: 1, end: H.Girsu });
  });

  test('a ship may pass through a space hex with enemy ships', () => {
    const r = validateMove(map, warpship(2), H[1919], [move(H[1818]), move(H[1717])], enemyAt(H[1818]));
    assert.deepEqual(r, { errors: [], cost: 2, end: H[1717] });
  });

  test('a ship may end its movement in a space hex with enemy ships', () => {
    const r = validateMove(map, warpship(2), H[1919], [move(H[1818])], enemyAt(H[1818]));
    assert.deepEqual(r, { errors: [], cost: 1, end: H[1818] });
  });

  test('friendly ships on a star do not stop a ship', () => {
    const w = world(5, [{ owner: 'A', ...H.Umma }]);
    const r = validateMove(map, warpship(5), H[1720], [move(H.Umma), move({ q: 2, r: 0 })], w);
    assert.deepEqual(r, { errors: [], cost: 2, end: { q: 2, r: 0 } });
  });
});

describe('stacking (D-018)', () => {
  test('any number of ships may share a hex', () => {
    const crowd = Array.from({ length: 12 }, (_, i) => ({ owner: i % 2 ? 'A' : 'B', ...H[1818] }));
    const r = validateMove(map, warpship(2), H[1919], [move(H[1818])], world(5, crowd));
    assert.deepEqual(r, { errors: [], cost: 1, end: H[1818] });
  });
});

describe('first-turn restriction (D-008)', () => {
  const nextToNippur = { q: 11, r: 0 };

  test('on game-turn 1, ships may not move onto an enemy base star hex', () => {
    const r = validateMove(map, warpship(3, 'A'), nextToNippur, [move(H.Nippur)], world(1));
    assert.deepEqual(r.errors.map((e) => [e.code, e.step]), [['FIRST_TURN_BASE', 0]]);
    assert.equal(r.end, null);
  });

  test('it applies to both players', () => {
    const nextToUr = { q: -1, r: 0 };
    const r = validateMove(map, warpship(3, 'B'), nextToUr, [move({ q: -2, r: 0 })], world(1));
    assert.deepEqual(codes(r), ['FIRST_TURN_BASE']);
  });

  test('it applies to warpline arrivals', () => {
    const r = validateMove(map, warpship(3, 'A'), H.Girsu, [jump('nippur')], world(1));
    assert.deepEqual(codes(r), ['FIRST_TURN_BASE']);
  });

  test('it applies to passing onto an enemy base star hex', () => {
    const r = validateMove(map, warpship(3, 'A'), nextToNippur, [move(H.Nippur), move({ q: 13, r: 0 })], world(1));
    assert.deepEqual(r.errors.map((e) => [e.code, e.step]), [['FIRST_TURN_BASE', 0]]);
  });

  test('from game-turn 2 on, enemy base stars are open', () => {
    assert.deepEqual(validateMove(map, warpship(3, 'A'), nextToNippur, [move(H.Nippur)], world(2)).errors, []);
    assert.deepEqual(validateMove(map, warpship(3, 'A'), H.Girsu, [jump('nippur')], world(2)).errors, []);
  });

  test('a ship may move onto its own base star, and other stars, on game-turn 1', () => {
    assert.deepEqual(validateMove(map, warpship(3, 'A'), { q: -1, r: 0 }, [move({ q: -2, r: 0 })], world(1)).errors, []);
    assert.deepEqual(validateMove(map, warpship(3, 'A'), H[1720], [move(H.Umma)], world(1)).errors, []);
  });
});

// D-040: a move may not leave the map. The test map has no edge, so a bounded copy is used: rows -2 to 4.
describe('map edge (D-040)', () => {
  const edged = loadMap({ ...JSON.parse(readFileSync(new URL('./fixtures/test-map.json', import.meta.url), 'utf8')), bounds: { x: [-3, 14], r: [-2, 4] } });

  test('a step off the edge is rejected at that step', () => {
    const r = validateMove(edged, warpship(5), { q: 0, r: -2 }, [move({ q: 1, r: -2 }), move({ q: 1, r: -3 })], world());
    assert.deepEqual(codes(r), ['OFF_MAP']);
    assert.equal(r.errors[0].step, 1);
    assert.equal(r.end, null);
  });

  test('moving along the edge is legal', () => {
    const r = validateMove(edged, warpship(5), { q: 0, r: -2 }, [move({ q: 1, r: -2 }), move({ q: 2, r: -2 })], world());
    assert.deepEqual(codes(r), []);
    assert.deepEqual(r.end, { q: 2, r: -2 });
  });
});
