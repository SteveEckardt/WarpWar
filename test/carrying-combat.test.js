import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHex, validateOrder, validateOrders, resolveRound } from '../src/engine/combat.js';

// Expected values are typed from docs/rules/classic.md (§5.1, §7, §7.2 Table 1, §7.3) and
// D-020, D-021, D-027, D-028, not read from src. Table 1 cells used:
//   Attacking vs Attacking, difference 0: Hit +2.   Attacking vs Dodging, difference +3: Hit.
const full = (stats) => ({ PD: 0, B: 0, S: 0, T: 0, M: 0, SR: 0, ...stats });
// A ship record as createShip builds it, plus the owner.
const mk = (owner, stats, { WG = true } = {}) => ({ owner, WG, level: 0, ...full(stats), built: full(stats) });
// A Systemship as it appears inside a Warpship's `carrying` (no owner: it is the carrier's).
const rec = (stats) => ({ WG: false, level: 0, ...full(stats), built: full(stats) });
const withCargo = (ship, cargo) => ({ ...ship, carrying: cargo });
const codes = (errors) => errors.map((e) => e.code);

// W7 may carry two Systemships (SR 2) and may fire a Beam of 3.
const w7 = () => withCargo(mk('A', { PD: 5, B: 3, S: 2, SR: 2 }), { S20: rec({ PD: 2 }) });

describe('§7.3: orders that pick up or drop', () => {
  const legal = { tactic: 'dodge', D: 0, S: 0, B: 3, beamTarget: 'E1' };

  test('a Warpship with Drive 0 and Screen 0 on Dodge may pick up, and may fire its Beam', () => {
    assert.deepEqual(codes(validateOrder(w7(), { ...legal, pickup: 'S21' })), []);
  });

  test('Retreat is allowed too, and so is dropping', () => {
    assert.deepEqual(codes(validateOrder(w7(), { tactic: 'retreat', D: 0, S: 0, pickup: 'S21' })), []);
    assert.deepEqual(codes(validateOrder(w7(), { ...legal, drop: 'S20' })), []);
  });

  test('Attack is not allowed', () => {
    assert.deepEqual(codes(validateOrder(w7(), { ...legal, tactic: 'attack', pickup: 'S21' })), ['CARRY_TACTIC']);
    assert.deepEqual(codes(validateOrder(w7(), { ...legal, tactic: 'attack', drop: 'S20' })), ['CARRY_TACTIC']);
  });

  test('Drive must be 0, and Screen must be 0', () => {
    assert.deepEqual(codes(validateOrder(w7(), { ...legal, D: 1, pickup: 'S21' })), ['CARRY_DRIVE_SCREEN']);
    assert.deepEqual(codes(validateOrder(w7(), { ...legal, S: 1, drop: 'S20' })), ['CARRY_DRIVE_SCREEN']);
  });

  test('no Missiles may be fired', () => {
    const ship = withCargo(mk('A', { PD: 5, T: 1, M: 3, SR: 2 }), { S20: rec({ PD: 2 }) });
    const order = { tactic: 'dodge', D: 0, T: 1, missiles: [{ target: 'E1', drive: 2 }] };
    assert.deepEqual(codes(validateOrder(ship, order)), []);
    assert.deepEqual(codes(validateOrder(ship, { ...order, drop: 'S20' })), ['CARRY_NO_MISSILES']);
    assert.deepEqual(codes(validateOrder(ship, { ...order, pickup: 'S21' })), ['CARRY_NO_MISSILES']);
  });

  test('D-027: one Systemship per Warpship per round, so a pickup and a drop together are illegal', () => {
    assert.deepEqual(codes(validateOrder(w7(), { tactic: 'dodge', pickup: 'S21', drop: 'S20' })), ['ONE_PER_ROUND']);
  });

  test('a drop must name a Systemship the Warpship carries', () => {
    assert.deepEqual(codes(validateOrder(w7(), { tactic: 'dodge', drop: 'S99' })), ['NOT_CARRIED']);
  });

  test('a pickup needs a free SR: occupied racks do not count', () => {
    const oneRack = withCargo(mk('A', { PD: 5, SR: 1 }), { S20: rec({ PD: 2 }) });
    assert.deepEqual(codes(validateOrder(oneRack, { tactic: 'dodge', pickup: 'S21' })), ['NO_FREE_RACK']);
    assert.deepEqual(codes(validateOrder(mk('A', { PD: 5 }), { tactic: 'dodge', pickup: 'S21' })), ['NO_FREE_RACK']);
  });

  test('a Systemship cannot pick up or drop', () => {
    const s = mk('A', { PD: 3, SR: 0 }, { WG: false });
    assert.deepEqual(codes(validateOrder(s, { tactic: 'dodge', pickup: 'S21' })), ['SYSTEMSHIP_CARRIES']);
  });
});

describe('§7.3 and D-020: who takes part in the round', () => {
  const hex = () =>
    createHex({
      W7: w7(),
      S30: mk('A', { PD: 3, S: 2 }, { WG: false }),
      W8: mk('A', { PD: 3, SR: 1 }),
      E1: mk('B', { PD: 6, B: 3 }),
      E2: mk('B', { PD: 3, B: 1 }, { WG: false }),
    });
  const quiet = { tactic: 'dodge' };

  test('a carried Systemship takes no part: it has no order and cannot be targeted (D-020)', () => {
    const base = { W7: quiet, S30: quiet, W8: quiet, E1: quiet, E2: quiet };
    assert.deepEqual(validateOrders(hex(), base), []);
    assert.deepEqual(codes(validateOrders(hex(), { ...base, S20: quiet })), ['UNKNOWN_SHIP']);
    const aimed = { tactic: 'attack', B: 3, beamTarget: 'S20' };
    assert.deepEqual(codes(validateOrders(hex(), { ...base, E1: aimed })), ['BAD_TARGET']);
  });

  test('a pickup must name a friendly Systemship that is on the hex, not carried', () => {
    const base = { S30: quiet, W8: quiet, E1: quiet, E2: quiet };
    const pick = (target) => ({ W7: { tactic: 'dodge', pickup: target }, ...base });
    assert.deepEqual(codes(validateOrders(hex(), pick('S30'))), []);
    for (const bad of ['E2', 'W8', 'S99', 'S20']) {
      assert.deepEqual(codes(validateOrders(hex(), pick(bad))), ['BAD_PICKUP'], bad);
    }
  });

  test('a Systemship cannot be picked up by two Warpships', () => {
    const orders = {
      W7: { tactic: 'dodge', pickup: 'S30' },
      W8: { tactic: 'dodge', pickup: 'S30' },
      S30: quiet,
      E1: quiet,
      E2: quiet,
    };
    assert.deepEqual(codes(validateOrders(hex(), orders)), ['DOUBLE_PICKUP']);
  });

  test('D-031: a picked-up Systemship may power only Screens: its Drive is 0 that round', () => {
    const base = { W7: { tactic: 'dodge', pickup: 'S30' }, W8: quiet, E1: quiet, E2: quiet };
    assert.deepEqual(codes(validateOrders(hex(), { ...base, S30: { tactic: 'dodge', D: 1 } })), ['PICKED_UP_DRIVE']);
    assert.deepEqual(codes(validateOrders(hex(), { ...base, S30: { tactic: 'dodge', D: 0, S: 2 } })), []);
  });

  test('a picked-up Systemship may not fire any weapon, but may power Screens (§7.3)', () => {
    const base = { W7: { tactic: 'dodge', pickup: 'S30' }, W8: quiet, E1: quiet, E2: quiet };
    assert.deepEqual(codes(validateOrders(hex(), { ...base, S30: { tactic: 'dodge', S: 2 } })), []);
    const s30 = (order) => codes(validateOrders(hex(), { ...base, S30: { tactic: 'dodge', ...order } }));
    assert.ok(s30({ B: 1, beamTarget: 'E1' }).includes('PICKED_UP_CANNOT_FIRE'));
    assert.ok(s30({ T: 1, missiles: [{ target: 'E1', drive: 1 }] }).includes('PICKED_UP_CANNOT_FIRE'));
  });

  test('two Warpships may each pick up one Systemship in the same round (D-027)', () => {
    const h = createHex({
      W7: mk('A', { PD: 2, SR: 1 }),
      W8: mk('A', { PD: 2, SR: 1 }),
      S30: mk('A', { PD: 1 }, { WG: false }),
      S31: mk('A', { PD: 1 }, { WG: false }),
      E1: mk('B', { PD: 3 }),
    });
    const orders = {
      W7: { tactic: 'dodge', pickup: 'S30' },
      W8: { tactic: 'dodge', pickup: 'S31' },
      S30: quiet,
      S31: quiet,
      E1: quiet,
    };
    assert.deepEqual(validateOrders(h, orders), []);
    const r = resolveRound(h, orders);
    assert.deepEqual(Object.keys(r.hex.ships.W7.carrying), ['S30']);
    assert.deepEqual(Object.keys(r.hex.ships.W8.carrying), ['S31']);
    assert.deepEqual(Object.keys(r.hex.ships).sort(), ['E1', 'W7', 'W8']);
  });
});

describe('§7.3: dropping a Systemship', () => {
  test('the dropped Systemship is on the hex after the round, with its record intact', () => {
    const hex = createHex({ W7: withCargo(mk('A', { PD: 3, SR: 1 }), { S20: rec({ PD: 2, B: 1 }) }), E1: mk('B', { PD: 6, B: 3 }) });
    // E1 Attack D=0 against W7 Dodge D=0: Attacking row, difference 0, Dodging column: Miss.
    const orders = { W7: { tactic: 'dodge', D: 0, S: 0, drop: 'S20' }, E1: { tactic: 'attack', D: 0, B: 3, beamTarget: 'W7' } };
    const r = resolveRound(hex, orders);
    assert.deepEqual(r.hex.ships.S20, { ...rec({ PD: 2, B: 1 }), owner: 'A' });
    assert.deepEqual(r.hex.ships.W7.carrying, {});
  });

  test('a dropped Systemship cannot be fired on that round: its Warpship takes the hits, not it', () => {
    const hex = createHex({ W7: withCargo(mk('A', { PD: 3, SR: 1 }), { S20: rec({ PD: 2 }) }), E1: mk('B', { PD: 6, B: 3 }) });
    const aimed = { tactic: 'attack', D: 0, B: 3, beamTarget: 'S20' };
    assert.deepEqual(codes(validateOrders(hex, { W7: { tactic: 'dodge', drop: 'S20' }, E1: aimed })), ['BAD_TARGET']);
  });

  test('if the Warpship is destroyed on the round it drops, the Systemship is not destroyed', () => {
    const hex = createHex({ W7: withCargo(mk('A', { PD: 1, SR: 1 }), { S20: rec({ PD: 2 }) }), E1: mk('B', { PD: 6, B: 2 }) });
    // E1 Attack D=3, B=2 against W7 Dodge D=0: difference +3, Hit: 2 hits. W7 has PD 1 and the freed SR 1.
    const orders = { W7: { tactic: 'dodge', drop: 'S20' }, E1: { tactic: 'attack', D: 3, B: 2, beamTarget: 'W7' } };
    const r = resolveRound(hex, orders, { W7: { PD: 1, SR: 1 } });
    assert.deepEqual(r.destroyed, ['W7']);
    assert.deepEqual(r.hex.ships.S20, { ...rec({ PD: 2 }), owner: 'A' });
    assert.equal(r.end, null);
  });

  test('if the Warpship escapes on the round it drops, the Systemship stays in the star hex', () => {
    const hex = createHex({ W7: withCargo(mk('A', { PD: 2, SR: 1 }), { S20: rec({ PD: 2 }) }), E1: mk('B', { PD: 3 }) });
    // No enemy Beam fire on W7, so it escapes (D-024).
    const orders = { W7: { tactic: 'retreat', drop: 'S20' }, E1: { tactic: 'dodge' } };
    const r = resolveRound(hex, orders);
    assert.deepEqual(Object.keys(r.escaped), ['W7']);
    assert.deepEqual(r.escaped.W7.carrying, {});
    assert.deepEqual(r.hex.ships.S20, { ...rec({ PD: 2 }), owner: 'A' });
    assert.equal(r.end, null);
  });
});

describe('§7.3: picking up a Systemship', () => {
  const s20 = () => mk('A', { PD: 3, S: 2 }, { WG: false });

  test('a picked-up Systemship may power Screens and can be fired on that round', () => {
    const hex = createHex({ W7: mk('A', { PD: 2, SR: 1 }), S20: s20(), E1: mk('B', { PD: 3, B: 3 }) });
    // E1 Attack D=0 on S20 Attack D=0: Hit +2, so 3 + 2 = 5 hits. S20's Screen at 2 (level 0) absorbs 2: 3 effective.
    const orders = {
      W7: { tactic: 'dodge', pickup: 'S20' },
      S20: { tactic: 'attack', D: 0, S: 2 },
      E1: { tactic: 'attack', D: 0, B: 3, beamTarget: 'S20' },
    };
    const r = resolveRound(hex, orders, { S20: { PD: 3 } });
    assert.deepEqual(r.shots.map((s) => [s.from, s.to, s.result, s.damage]), [['E1', 'S20', 'hit', 5]]);
    assert.equal(r.damage.S20.effective, 3);
    assert.deepEqual(r.hex.ships.W7.carrying.S20, { ...rec({ PD: 0, S: 2 }), built: full({ PD: 3, S: 2 }) });
    assert.equal('S20' in r.hex.ships, false);
  });

  test('a picked-up Systemship is carried from the round on', () => {
    const hex = createHex({ W7: mk('A', { PD: 2, SR: 1 }), S20: s20(), E1: mk('B', { PD: 3 }) });
    const orders = { W7: { tactic: 'dodge', pickup: 'S20' }, S20: { tactic: 'dodge' }, E1: { tactic: 'dodge' } };
    const r = resolveRound(hex, orders);
    assert.deepEqual(Object.keys(r.hex.ships), ['W7', 'E1']);
    assert.deepEqual(r.hex.ships.W7.carrying, { S20: { ...rec({ PD: 3, S: 2 }) } });
  });

  test('D-028: a Systemship picked up on the round its Warpship escapes leaves with it', () => {
    const hex = createHex({ W7: mk('A', { PD: 2, SR: 1 }), S20: s20(), E1: mk('B', { PD: 3 }) });
    const orders = { W7: { tactic: 'retreat', pickup: 'S20' }, S20: { tactic: 'dodge' }, E1: { tactic: 'dodge' } };
    const r = resolveRound(hex, orders);
    assert.deepEqual(Object.keys(r.escaped), ['W7']);
    assert.deepEqual(Object.keys(r.escaped.W7.carrying), ['S20']);
    assert.deepEqual(Object.keys(r.hex.ships), ['E1']);
    assert.deepEqual(r.hex.gone.S20, { owner: 'A', how: 'escaped' });
    assert.deepEqual(r.end, { reason: 'all escaped', owners: ['A'] });
  });

  describe('the rack in use for a pickup (D-032, D-035)', () => {
    const pick = (W7, damage, extra = {}) => {
      const hex = createHex({ W7, S20: s20(), E1: mk('B', { PD: 9, B: damage }), ...extra });
      // E1 Attack D=3 against W7 Dodge D=0: difference +3, Hit: `damage` hits (B = damage, level 0).
      const orders = {
        W7: { tactic: 'dodge', pickup: 'S20' },
        S20: { tactic: 'dodge' },
        E1: { tactic: 'attack', D: 3, B: damage, beamTarget: 'W7' },
      };
      return { hex, orders };
    };

    test('D-032: it is occupied and cannot take hits while W7 has other attributes to hit; the pickup completes', () => {
      const { hex, orders } = pick(mk('A', { PD: 2, SR: 1 }), 2);
      assert.throws(() => resolveRound(hex, orders, { W7: { PD: 1, SR: 1 } }), RangeError);
      const r = resolveRound(hex, orders, { W7: { PD: 2 } });
      assert.deepEqual(r.destroyed, []);
      assert.equal(r.hex.ships.W7.SR, 1);
      assert.deepEqual(Object.keys(r.hex.ships.W7.carrying), ['S20']);
      assert.equal('S20' in r.hex.ships, false);
    });

    test('D-032: one hit short of using up the rest, the rack is still untouched', () => {
      const { hex, orders } = pick(mk('A', { PD: 1, SR: 1 }), 1);
      assert.throws(() => resolveRound(hex, orders, { W7: { SR: 1 } }), RangeError);
      const r = resolveRound(hex, orders, { W7: { PD: 1 } });
      assert.equal(r.hex.ships.W7.SR, 1);
      assert.deepEqual(Object.keys(r.hex.ships.W7.carrying), ['S20']);
    });

    test('D-035: when it is the last hittable attribute, it takes the hit and the pickup fails', () => {
      const { hex, orders } = pick(mk('A', { PD: 1, SR: 1 }), 2);
      // 2 hits: PD 1, then the pickup rack. Both must be taken.
      assert.throws(() => resolveRound(hex, orders, { W7: { PD: 1 } }), RangeError);
      const r = resolveRound(hex, orders, { W7: { PD: 1, SR: 1 } });
      assert.deepEqual(r.destroyed, ['W7']);
    });

    test('§7.3, D-035: the Warpship is destroyed on the pickup round and the Systemship remains on the hex', () => {
      const { hex, orders } = pick(mk('A', { PD: 1, SR: 1 }), 2);
      const r = resolveRound(hex, orders, { W7: { PD: 1, SR: 1 } });
      assert.deepEqual(r.destroyed, ['W7']);
      assert.deepEqual(r.hex.ships.S20, s20());
      assert.equal('W7' in r.hex.ships, false);
      assert.equal(r.end, null);
    });

    test('D-032: a free rack takes hits before the pickup rack does', () => {
      // SR 2 with PD 1: 2 hits are PD 1 and the one free rack; the pickup rack is not touched.
      const { hex, orders } = pick(mk('A', { PD: 1, SR: 2 }), 2);
      const r = resolveRound(hex, orders, { W7: { PD: 1, SR: 1 } });
      assert.deepEqual(r.destroyed, []);
      assert.equal(r.hex.ships.W7.SR, 1);
      assert.deepEqual(Object.keys(r.hex.ships.W7.carrying), ['S20']);
    });

    test('D-034 and D-035 together: carried Systemships take their hits first, then the pickup rack', () => {
      const loaded = withCargo(mk('A', { PD: 1, SR: 2 }), { S50: rec({ PD: 1 }) });
      const { hex, orders } = pick(loaded, 4);
      // 4 hits: PD 1, S50's PD 1 (S50 destroyed, its rack frees), that rack, and finally the pickup rack.
      assert.throws(() => resolveRound(hex, orders, { W7: { PD: 1, SR: 1, carried: { S50: { PD: 1 } } } }), RangeError);
      const r = resolveRound(hex, orders, { W7: { PD: 1, SR: 2, carried: { S50: { PD: 1 } } } });
      assert.deepEqual([...r.destroyed].sort(), ['S50', 'W7']);
      assert.deepEqual(r.hex.ships.S20, s20());
      assert.equal(r.end, null);
    });
  });

  test('a Systemship destroyed in the round is not picked up', () => {
    const hex = createHex({ W7: mk('A', { PD: 2, SR: 1 }), S20: mk('A', { PD: 1 }, { WG: false }), E1: mk('B', { PD: 6, B: 3 }) });
    // E1 Attack D=0 on S20 Dodge D=0 is a Miss; use Attack D=3 vs Dodge: difference +3, Hit: 3 hits, S20 has PD 1.
    const orders = {
      W7: { tactic: 'dodge', pickup: 'S20' },
      S20: { tactic: 'dodge' },
      E1: { tactic: 'attack', D: 3, B: 3, beamTarget: 'S20' },
    };
    const r = resolveRound(hex, orders, { S20: { PD: 1 } });
    assert.deepEqual(r.destroyed, ['S20']);
    assert.deepEqual(Object.keys(r.hex.ships.W7.carrying ?? {}), []);
  });
});

describe('D-021: hits and carried Systemships', () => {
  // E1 Attack D=3, B=3 against Dodge D=0: difference +3, Hit: 3 hits (no Screen on W7).
  const e1 = { tactic: 'attack', D: 3, B: 3, beamTarget: 'W7' };
  const hex = () =>
    createHex({
      W7: withCargo(mk('A', { PD: 1, SR: 1 }), { S20: rec({ PD: 2 }) }),
      E1: mk('B', { PD: 6, B: 3 }),
    });
  const orders = { W7: { tactic: 'dodge' }, E1: e1 };

  test('occupied racks cannot take hits', () => {
    assert.throws(() => resolveRound(hex(), orders, { W7: { PD: 1, SR: 1, carried: { S20: { PD: 1 } } } }), RangeError);
  });

  test('the owner may assign hits to a carried Systemship\'s attributes', () => {
    const r = resolveRound(hex(), orders, { W7: { PD: 1, carried: { S20: { PD: 2 } } } });
    assert.equal(r.hex.ships.W7.PD, 0);
    assert.equal(r.hex.ships.W7.SR, 1);
    assert.deepEqual(r.destroyed, ['S20']);
    assert.deepEqual(r.hex.gone.S20, { owner: 'A', how: 'destroyed' });
    assert.deepEqual(r.hex.ships.W7.carrying, {});
  });

  test('a carried Systemship that keeps some attributes stays aboard with the damage', () => {
    const one = { W7: { tactic: 'dodge' }, E1: { ...e1, B: 1, D: 3 } };
    const r = resolveRound(hex(), one, { W7: { carried: { S20: { PD: 1 } } } });
    assert.equal(r.hex.ships.W7.PD, 1);
    assert.equal(r.hex.ships.W7.carrying.S20.PD, 1);
    assert.deepEqual(r.destroyed, []);
  });

  test('hits owed are limited by what can be taken: PD 1 plus the carried PD 2 is 3, with the occupied SR excluded', () => {
    assert.throws(() => resolveRound(hex(), orders, { W7: { PD: 1 } }), RangeError);
    assert.doesNotThrow(() => resolveRound(hex(), orders, { W7: { PD: 1, carried: { S20: { PD: 2 } } } }));
  });

  test('hits may go to a rack only while it is free', () => {
    const roomy = createHex({
      W7: withCargo(mk('A', { PD: 1, SR: 2 }), { S20: rec({ PD: 1 }) }),
      E1: mk('B', { PD: 6, B: 3 }),
    });
    // 3 hits: PD 1, one free SR, and the carried Systemship's PD 1 can take them; the second SR is occupied.
    assert.throws(() => resolveRound(roomy, orders, { W7: { PD: 1, SR: 2 } }), RangeError);
    const r = resolveRound(roomy, orders, { W7: { PD: 1, SR: 1, carried: { S20: { PD: 1 } } } });
    assert.equal(r.hex.ships.W7.SR, 1);
    assert.deepEqual(r.destroyed, ['S20']);
  });

  test('hits cannot be assigned to a Systemship the Warpship is not carrying', () => {
    assert.throws(() => resolveRound(hex(), orders, { W7: { PD: 1, carried: { S99: { PD: 2 } } } }), RangeError);
  });

  test('a Systemship dropped this round is not carried, so it cannot take its Warpship\'s hits', () => {
    const drop = { W7: { tactic: 'dodge', drop: 'S20' }, E1: e1 };
    assert.throws(() => resolveRound(hex(), drop, { W7: { PD: 1, carried: { S20: { PD: 1 } } } }), RangeError);
  });

  test('D-033: a rack freed by a drop is empty that round and can take hits', () => {
    const roomy = createHex({
      W7: withCargo(mk('A', { PD: 1, SR: 1 }), { S20: rec({ PD: 2 }) }),
      E1: mk('B', { PD: 6, B: 3 }),
    });
    const drop = { W7: { tactic: 'dodge', drop: 'S20' }, E1: e1 };
    // 3 hits, and W7 can take PD 1 and the freed SR 1: 2 are owed.
    const r = resolveRound(roomy, drop, { W7: { PD: 1, SR: 1 } });
    assert.deepEqual(r.destroyed, ['W7']);
    assert.deepEqual(r.hex.ships.S20, { ...rec({ PD: 2 }), owner: 'A' });
  });

  test('D-034: with only occupied racks left, remaining hits must go to the carried Systemship', () => {
    // 3 hits. W7 has PD 1, an occupied SR, and S20 aboard with PD 2 (more than the 2 hits left after PD).
    const heavy = createHex({
      W7: withCargo(mk('A', { PD: 1, SR: 1 }), { S20: rec({ PD: 3 }) }),
      E1: mk('B', { PD: 6, B: 3 }),
    });
    assert.throws(() => resolveRound(heavy, orders, { W7: { PD: 1, SR: 1, carried: { S20: { PD: 1 } } } }), RangeError);
    const r = resolveRound(heavy, orders, { W7: { PD: 1, carried: { S20: { PD: 2 } } } });
    assert.equal(r.hex.ships.W7.carrying.S20.PD, 1);
  });

  test('D-034: a destroyed carried Systemship frees its rack, which can then take hits', () => {
    const r = resolveRound(hex(), orders, { W7: { PD: 1, carried: { S20: { PD: 2 } } } });
    assert.equal(r.hex.ships.W7.SR, 1); // 3 hits: PD 1 and S20's PD 2; none were left for the freed rack
    const more = createHex({
      W7: withCargo(mk('A', { PD: 1, SR: 1 }), { S20: rec({ PD: 1 }) }),
      E1: mk('B', { PD: 6, B: 3 }),
    });
    const r2 = resolveRound(more, orders, { W7: { PD: 1, SR: 1, carried: { S20: { PD: 1 } } } });
    assert.equal(r2.hex.ships.W7, undefined);
  });

  test('D-034: a loaded Warpship is destroyed by hits, and so is the Systemship it carried', () => {
    const loaded = createHex({
      W7: withCargo(mk('A', { PD: 1, SR: 1 }), { S20: rec({ PD: 1 }) }),
      E1: mk('B', { PD: 6, B: 3 }),
    });
    // 3 hits: W7's PD 1, S20's PD 1 (S20 is destroyed and frees its rack), then the SR 1.
    const r = resolveRound(loaded, orders, { W7: { PD: 1, SR: 1, carried: { S20: { PD: 1 } } } });
    assert.deepEqual([...r.destroyed].sort(), ['S20', 'W7']);
    assert.deepEqual(Object.keys(r.hex.ships), ['E1']);
    assert.deepEqual(r.end, { reason: 'all destroyed', owners: ['A'] });
  });
});
