import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadMap } from '../src/engine/map.js';
import { validateMove } from '../src/engine/movement.js';

const map = loadMap(JSON.parse(readFileSync(new URL('./fixtures/test-map.json', import.meta.url), 'utf8')));

// Hexes on the test map (see test/movement.test.js). Expected values are typed from
// docs/rules/classic.md §5.1, §6.2, §6.2.1 and D-017, not read from src.
const H = {
  1720: { q: 0, r: 0 },
  Umma: { q: 1, r: 0 },
  Girsu: { q: 9, r: 0 },
  Kish: { q: 9, r: 3 },
};
const move = (to) => ({ type: 'move', to });
const jump = (to) => ({ type: 'jump', to });
const pickup = (ship) => ({ type: 'pickup', ship });
const drop = (ship) => ({ type: 'drop', ship });
const sysRecord = { WG: false, level: 0, PD: 1, B: 0, S: 0, T: 0, M: 0, SR: 0 };
const warpship = (PD, SR, carried = [], owner = 'A') => ({
  owner,
  WG: true,
  PD,
  SR,
  carrying: Object.fromEntries(carried.map((id) => [id, sysRecord])),
});
const counter = (id, hex, owner = 'A', WG = false) => ({ id, owner, WG, ...hex });
const world = (ships = [], turn = 5) => ({ turn, ships });
const codes = (r) => r.errors.map((e) => e.code);

// W6 starts on 1720, moves onto Umma, along the warpline to Girsu, 3 hexes to Kish: 5 MP.
const w6Path = [move(H.Umma), jump('girsu'), move({ q: 9, r: 1 }), move({ q: 9, r: 2 }), move(H.Kish)];

describe('§6.2.1: a drop costs one additional movement point', () => {
  // "Had it dropped a Systemship on any one of those three stars, it would have expended
  // one additional movement point, for a total of 6 used in that move."
  const dropAt = (index) => [...w6Path.slice(0, index + 1), drop('S20'), ...w6Path.slice(index + 1)];

  test('a drop on Umma, Girsu or Kish makes the move cost 6 MP', () => {
    for (const index of [0, 1, 4]) {
      const r = validateMove(map, warpship(6, 1, ['S20']), H[1720], dropAt(index), world());
      assert.deepEqual(r.errors, [], `drop after step ${index}`);
      assert.equal(r.cost, 6, `drop after step ${index}`);
      assert.deepEqual(r.end, H.Kish);
    }
  });

  test('with a PD of 5 the same move with a drop is over budget', () => {
    const r = validateMove(map, warpship(5, 1, ['S20']), H[1720], dropAt(4), world());
    assert.deepEqual(codes(r), ['OVER_MP']);
    assert.equal(r.cost, 6);
  });

  test('a drop on a space hex is illegal: Systemships may only be dropped off at a star hex (§5.1)', () => {
    const r = validateMove(map, warpship(6, 1, ['S20']), H[1720], [drop('S20')], world());
    assert.deepEqual(codes(r), ['NOT_A_STAR_HEX']);
    const midway = [...w6Path.slice(0, 2), move({ q: 9, r: 1 }), drop('S20')];
    assert.deepEqual(codes(validateMove(map, warpship(6, 1, ['S20']), H[1720], midway, world())), ['NOT_A_STAR_HEX']);
  });

  test('the drop is reported with where it happened, and the ship ends up empty', () => {
    const r = validateMove(map, warpship(6, 1, ['S20']), H[1720], dropAt(1), world());
    assert.deepEqual(r.cargo, { carried: [], pickups: [], drops: [{ ship: 'S20', at: H.Girsu }] });
  });

  test('a ship cannot drop a Systemship it is not carrying', () => {
    const r = validateMove(map, warpship(6, 1, ['S20']), H.Umma, [drop('S99')], world());
    assert.deepEqual(codes(r), ['NOT_CARRIED']);
  });
});

describe('§6.2 item 4: picking up costs one movement point, on a star hex', () => {
  const s20 = counter('S20', H.Umma);

  test('pick up on a star hex: 1 MP, carried afterwards', () => {
    const r = validateMove(map, warpship(1, 1), H.Umma, [pickup('S20')], world([s20]));
    assert.deepEqual(r.errors, []);
    assert.equal(r.cost, 1);
    assert.deepEqual(r.end, H.Umma);
    assert.deepEqual(r.cargo, { carried: ['S20'], pickups: [{ ship: 'S20', at: H.Umma }], drops: [] });
  });

  test('pick up on Umma, jump, drop on Girsu: 3 MP', () => {
    const r = validateMove(map, warpship(3, 1), H.Umma, [pickup('S20'), jump('girsu'), drop('S20')], world([s20]));
    assert.deepEqual(r.errors, []);
    assert.equal(r.cost, 3);
    assert.deepEqual(r.cargo, {
      carried: [],
      pickups: [{ ship: 'S20', at: H.Umma }],
      drops: [{ ship: 'S20', at: H.Girsu }],
    });
  });

  test('a pickup on a space hex is illegal', () => {
    const inSpace = counter('S20', H[1720]);
    const r = validateMove(map, warpship(1, 1), H[1720], [pickup('S20')], world([inSpace]));
    assert.deepEqual(codes(r), ['NOT_A_STAR_HEX']);
  });

  test('the Systemship must be a friendly Systemship on the hex the Warpship is in', () => {
    const elsewhere = [counter('S20', H.Girsu)];
    const enemy = [counter('S20', H.Umma, 'B')];
    const warpshipCounter = [counter('W9', H.Umma, 'A', true)]; // a Warpship may NOT be carried (§5.1)
    for (const ships of [[], elsewhere, enemy]) {
      assert.deepEqual(codes(validateMove(map, warpship(1, 1), H.Umma, [pickup('S20')], world(ships))), ['NO_SYSTEMSHIP_HERE']);
    }
    assert.deepEqual(codes(validateMove(map, warpship(1, 1), H.Umma, [pickup('W9')], world(warpshipCounter))), ['NO_SYSTEMSHIP_HERE']);
  });

  test('a Systemship cannot be picked up twice', () => {
    const r = validateMove(map, warpship(2, 2), H.Umma, [pickup('S20'), pickup('S20')], world([s20]));
    assert.deepEqual(codes(r), ['NO_SYSTEMSHIP_HERE']);
  });

  test('a Systemship that has left the hex with its carrier is not there to pick up again', () => {
    const r = validateMove(map, warpship(3, 2), H.Umma, [pickup('S20'), jump('girsu'), pickup('S20')], world([s20]));
    assert.deepEqual(codes(r), ['NO_SYSTEMSHIP_HERE']);
  });
});

describe('§5.1: one Systemship per undamaged SR', () => {
  const two = [counter('S20', H.Umma), counter('S21', H.Umma)];

  test('a Warpship with SR 2 may pick up two Systemships (2 MP)', () => {
    const r = validateMove(map, warpship(2, 2), H.Umma, [pickup('S20'), pickup('S21')], world(two));
    assert.deepEqual(r.errors, []);
    assert.equal(r.cost, 2);
    assert.deepEqual(r.cargo.carried, ['S20', 'S21']);
  });

  test('a third pickup is refused when the racks are full', () => {
    const three = [...two, counter('S22', H.Umma)];
    const r = validateMove(map, warpship(3, 2), H.Umma, [pickup('S20'), pickup('S21'), pickup('S22')], world(three));
    assert.deepEqual(codes(r), ['NO_FREE_RACK']);
    assert.equal(r.errors[0].step, 2);
  });

  test('racks already occupied count: SR 1 carrying one cannot take another', () => {
    const r = validateMove(map, warpship(1, 1, ['S50']), H.Umma, [pickup('S20')], world(two));
    assert.deepEqual(codes(r), ['NO_FREE_RACK']);
  });

  test('a Warpship with SR 0 cannot pick up', () => {
    assert.deepEqual(codes(validateMove(map, warpship(1, 0), H.Umma, [pickup('S20')], world(two))), ['NO_FREE_RACK']);
  });

  test('dropping first frees a rack for a pickup (2 MP)', () => {
    const r = validateMove(map, warpship(2, 1, ['S50']), H.Umma, [drop('S50'), pickup('S20')], world(two));
    assert.deepEqual(r.errors, []);
    assert.equal(r.cost, 2);
    assert.deepEqual(r.cargo.carried, ['S20']);
  });
});

describe('D-017: after a forced stop, remaining MP may still drop or pick up', () => {
  const enemyAtUmma = counter('E1', H.Umma, 'B', true);
  const s20 = counter('S20', H.Umma);

  test('stopped on Umma by an enemy ship, the Warpship may still pick up and drop there', () => {
    const r = validateMove(map, warpship(3, 1), H[1720], [move(H.Umma), pickup('S20'), drop('S20')], world([enemyAtUmma, s20]));
    assert.deepEqual(r.errors, []);
    assert.equal(r.cost, 3);
    assert.deepEqual(r.end, H.Umma);
  });

  test('a drop after the forced stop costs 1 MP and the budget still applies', () => {
    const r = validateMove(map, warpship(1, 1, ['S50']), H[1720], [move(H.Umma), drop('S50')], world([enemyAtUmma]));
    assert.deepEqual(codes(r), ['OVER_MP']);
    assert.equal(r.cost, 2);
  });

  test('but it still may not move on after the forced stop', () => {
    const r = validateMove(map, warpship(4, 1), H[1720], [move(H.Umma), pickup('S20'), jump('girsu')], world([enemyAtUmma, s20]));
    assert.deepEqual(r.errors.map((e) => [e.code, e.step]), [['MUST_STOP', 2]]);
  });
});

describe('who may carry', () => {
  test('a Systemship cannot pick up or drop: it cannot move (§5.1)', () => {
    const sys = { owner: 'A', WG: false, PD: 3, SR: 0, carrying: {} };
    const r = validateMove(map, sys, H.Umma, [pickup('S20')], world([counter('S20', H.Umma)]));
    assert.equal(codes(r)[0], 'SYSTEMSHIP_MOVE');
  });

  test('a path without pickups or drops reports no cargo section', () => {
    const r = validateMove(map, warpship(1, 1), H[1720], [move(H.Umma)], world());
    assert.deepEqual(r, { errors: [], cost: 1, end: H.Umma });
  });
});
