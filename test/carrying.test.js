import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { carriedIds, freeRacks, cargoLost, rearrange, withdrawSystemships } from '../src/engine/carrying.js';

// Expected values are typed from docs/rules/classic.md §3 event 5, §5.1, §8 and D-023, not read from src.
const full = (stats) => ({ PD: 0, B: 0, S: 0, T: 0, M: 0, SR: 0, ...stats });
const sys = (stats = { PD: 2 }) => ({ WG: false, level: 0, ...full(stats), built: full(stats) });
const warp = (owner, stats, cargo = {}) => ({ WG: true, level: 0, owner, ...full(stats), built: full(stats), carrying: cargo });
const loose = (owner, stats) => ({ ...sys(stats), owner });

describe('§5.1: one Systemship per SR', () => {
  test('free racks are the Warpship\'s current SR less the Systemships it carries', () => {
    assert.equal(freeRacks(warp('A', { PD: 3, SR: 3 }, { S1: sys(), S2: sys() })), 1);
    assert.equal(freeRacks(warp('A', { PD: 3, SR: 2 })), 2);
    assert.equal(freeRacks(warp('A', { PD: 3 })), 0);
  });

  test('a record with no carrying list carries nothing', () => {
    const w = { WG: true, level: 0, owner: 'A', ...full({ PD: 3, SR: 1 }) };
    assert.deepEqual(carriedIds(w), []);
    assert.equal(freeRacks(w), 1);
  });

  test('a destroyed Warpship destroys every Systemship it carries (§5.1)', () => {
    assert.deepEqual(cargoLost(warp('A', { SR: 2 }, { S20: sys(), S21: sys() })), ['S20', 'S21']);
    assert.deepEqual(cargoLost(warp('A', { SR: 2 })), []);
  });
});

describe('§8: free rearrangement after combat', () => {
  const ships = () => ({
    W7: warp('A', { PD: 3, SR: 2 }, { S20: sys(), S21: sys() }),
    W8: warp('A', { PD: 3, SR: 1 }),
    S30: loose('A', { PD: 1 }),
    E1: warp('B', { PD: 4, SR: 1 }, { S90: sys() }),
  });

  test('a Warpship may drop a Systemship it carries at the star it occupies', () => {
    const out = rearrange(ships(), 'A', { W7: ['S21'], W8: [] });
    assert.deepEqual(Object.keys(out.W7.carrying), ['S21']);
    assert.deepEqual(out.S20, { ...sys(), owner: 'A' });
  });

  test('Systemships at the star may be picked up by a Warpship there', () => {
    const out = rearrange(ships(), 'A', { W7: ['S20', 'S21'], W8: ['S30'] });
    assert.deepEqual(Object.keys(out.W8.carrying), ['S30']);
    assert.equal('S30' in out, false);
  });

  test('Systemships may be transferred from one Warpship to another', () => {
    const out = rearrange(ships(), 'A', { W7: ['S21'], W8: ['S20'] });
    assert.deepEqual(Object.keys(out.W7.carrying), ['S21']);
    assert.deepEqual(Object.keys(out.W8.carrying), ['S20']);
    assert.equal('S20' in out, false);
  });

  test('the Systemship records survive a transfer unchanged', () => {
    const damaged = sys({ PD: 5 });
    damaged.PD = 2;
    const s = { W7: warp('A', { PD: 3, SR: 1 }, { S20: damaged }), W8: warp('A', { PD: 3, SR: 1 }) };
    assert.deepEqual(rearrange(s, 'A', { W7: [], W8: ['S20'] }).W8.carrying.S20, damaged);
  });

  test('a Warpship may not take more Systemships than it has SRs', () => {
    assert.throws(() => rearrange(ships(), 'A', { W8: ['S20', 'S21'], W7: [] }), RangeError);
  });

  test('capacity counts the Warpship\'s current SR, not the SR it was built with', () => {
    const s = { W7: warp('A', { PD: 3, SR: 1 }), S20: loose('A', { PD: 1 }), S21: loose('A', { PD: 1 }) };
    s.W7.built.SR = 2;
    assert.throws(() => rearrange(s, 'A', { W7: ['S20', 'S21'] }), RangeError);
  });

  test('only the player whose turn it is may rearrange: enemy ships are not touched or assignable', () => {
    const s = ships();
    const out = rearrange(s, 'A', { W7: [], W8: [] });
    assert.deepEqual(out.E1, s.E1);
    assert.throws(() => rearrange(s, 'A', { W7: ['S90'] }), RangeError);
    assert.throws(() => rearrange(s, 'A', { E1: [] }), RangeError);
  });

  test('a Warpship cannot be carried, and a Systemship cannot carry', () => {
    assert.throws(() => rearrange(ships(), 'A', { W7: ['W8'] }), RangeError);
    assert.throws(() => rearrange(ships(), 'A', { S30: [] }), RangeError);
  });

  test('every Systemship may be assigned at most once, and only if it is in the hex', () => {
    assert.throws(() => rearrange(ships(), 'A', { W7: ['S20'], W8: ['S20'] }), RangeError);
    assert.throws(() => rearrange(ships(), 'A', { W7: ['S77'] }), RangeError);
  });

  test('Systemships left out of the assignment end up on the hex, not carried', () => {
    const out = rearrange(ships(), 'A', { W7: ['S20'], W8: [] });
    assert.deepEqual(out.S21, { ...sys(), owner: 'A' });
    assert.deepEqual(out.S30, ships().S30);
  });

  test('does not modify its input', () => {
    const s = ships();
    const before = JSON.stringify(s);
    rearrange(s, 'A', { W7: [], W8: ['S30'] });
    assert.equal(JSON.stringify(s), before);
  });
});

describe('D-023: forced withdrawal, Systemships beyond free SR capacity are destroyed', () => {
  test('with room for all of them, every Systemship leaves with a Warpship', () => {
    const ships = { W7: warp('A', { PD: 3, SR: 2 }), S20: loose('A', { PD: 1 }), S21: loose('A', { PD: 1 }) };
    const r = withdrawSystemships(ships, 'A', { W7: ['S20', 'S21'] });
    assert.deepEqual(r.destroyed, []);
    assert.deepEqual(Object.keys(r.ships), ['W7']);
    assert.deepEqual(Object.keys(r.ships.W7.carrying), ['S20', 'S21']);
  });

  test('two Systemships and one free SR: the one left behind is destroyed', () => {
    const ships = { W7: warp('A', { PD: 3, SR: 1 }), S20: loose('A', { PD: 1 }), S21: loose('A', { PD: 1 }) };
    const r = withdrawSystemships(ships, 'A', { W7: ['S21'] });
    assert.deepEqual(r.destroyed, ['S20']);
    assert.deepEqual(Object.keys(r.ships), ['W7']);
    assert.deepEqual(Object.keys(r.ships.W7.carrying), ['S21']);
  });

  test('free capacity is what is left after the Systemships already carried', () => {
    const ships = { W7: warp('A', { PD: 3, SR: 2 }, { S50: sys() }), S20: loose('A', { PD: 1 }), S21: loose('A', { PD: 1 }) };
    const r = withdrawSystemships(ships, 'A', { W7: ['S20'] });
    assert.deepEqual(r.destroyed, ['S21']);
    assert.deepEqual(Object.keys(r.ships.W7.carrying), ['S50', 'S20']);
  });

  test('no Warpship in the hex: every loose Systemship is destroyed', () => {
    const ships = { S20: loose('A', { PD: 1 }), S21: loose('A', { PD: 1 }) };
    const r = withdrawSystemships(ships, 'A', {});
    assert.deepEqual(r.destroyed, ['S20', 'S21']);
    assert.deepEqual(r.ships, {});
  });

  test('the owner may not leave a Systemship behind while there is room to carry it', () => {
    const ships = { W7: warp('A', { PD: 3, SR: 2 }), S20: loose('A', { PD: 1 }) };
    assert.throws(() => withdrawSystemships(ships, 'A', {}), RangeError);
  });

  test('the owner may not load a Warpship beyond its free SRs', () => {
    const ships = { W7: warp('A', { PD: 3, SR: 1 }), S20: loose('A', { PD: 1 }), S21: loose('A', { PD: 1 }) };
    assert.throws(() => withdrawSystemships(ships, 'A', { W7: ['S20', 'S21'] }), RangeError);
  });

  test('enemy ships are neither carried nor destroyed', () => {
    const ships = { W7: warp('A', { PD: 3, SR: 1 }), S20: loose('A', { PD: 1 }), S90: loose('B', { PD: 1 }) };
    const r = withdrawSystemships(ships, 'A', { W7: ['S20'] });
    assert.deepEqual(r.destroyed, []);
    assert.deepEqual(r.ships.S90, ships.S90);
    assert.throws(() => withdrawSystemships(ships, 'A', { W7: ['S90'] }), RangeError);
  });
});
