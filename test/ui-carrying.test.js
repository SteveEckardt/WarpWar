import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, applyAction } from '../src/engine/game.js';
import { planInfo, renderMovement } from '../src/ui/movement.js';
import { rearrangeStars, currentLoads, rearrangeAction, rearrangeCheck, renderRearrange } from '../src/ui/rearrange.js';
import {
  blankOrders, orderProblems, orderText, renderOrders, pendingReport, renderHits, hitProblems, renderPlacement,
  withdrawAction, withdrawCheck,
} from '../src/ui/combat.js';
import { renderMap } from '../src/ui/hexmap.js';
import { renderHexPanel } from '../src/ui/panel.js';
import { logEntries } from '../src/ui/log.js';

// Phase 7g: carrying Systemships. Pickup and drop while moving (§6.2, D-017), in combat (§7.3, D-027, D-031 to
// D-035), after combat (§8), on forced withdrawal (§7 step 6(c), D-023), and hits on carried Systemships (D-021).
// D-039: an enemy's cargo stays hidden; only counters leaving or reaching the map are public.
const mapData = JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8'));
const jump = (to) => ({ type: 'jump', to });
const move = (q, r) => ({ type: 'move', to: { q, r } });
const pickup = (ship) => ({ type: 'pickup', ship });
const drop = (ship) => ({ type: 'drop', ship });

function play(state, ...actions) {
  for (const action of actions) {
    const r = applyAction(state, action);
    assert.equal(r.ok, true, `${action.type} by ${action.player} rejected: ${r.code}: ${r.message}`);
    state = r.state;
  }
  return state;
}

// Basic. ann (A): W1 (PD 10, B 5, S 5, SR 2) and Systemships S01, S02 at Ur. bob (B): W1 (PD 30, SR 1), S01.
const annBuilt = () =>
  play(
    createGame({ map: mapData, scenario: 'basic', players: ['ann', 'bob'] }),
    { type: 'setFirstPlayer', player: 'ann' },
    { type: 'chooseSide', player: 'bob', side: 'B' },
    {
      type: 'build', player: 'ann', ships: [
        { id: 'A-W1', design: { WG: true, PD: 10, B: 5, S: 5, SR: 2 }, at: 'ur' }, // 27
        { id: 'A-S01', design: { PD: 4, B: 4, S: 4 }, at: 'ur' }, // 12
        { id: 'A-S02', design: { PD: 5, B: 3, S: 3 }, at: 'ur' }, // 11
      ],
    },
  );
// ann's W1 takes both aboard, jumps to Isin and puts S02 down there: 4 MP.
const annMoved = () => play(annBuilt(), { type: 'move', player: 'ann', ship: 'A-W1', path: [pickup('A-S01'), pickup('A-S02'), jump('isin'), drop('A-S02')] });
// bob's W1 takes S01 aboard, flies to Isin (stopped by ann's ships) and puts it down (D-017): 9 MP. Combat at Isin.
const atCombat = () =>
  play(
    annMoved(),
    { type: 'endMovement', player: 'ann' },
    { type: 'endTurn', player: 'ann' },
    {
      type: 'build', player: 'bob', ships: [
        { id: 'B-W1', design: { WG: true, PD: 30, SR: 1 }, at: 'nippur' }, // 36
        { id: 'B-S01', design: { PD: 7, B: 7 }, at: 'nippur' }, // 14
      ],
    },
    { type: 'move', player: 'bob', ship: 'B-W1', path: [pickup('B-S01'), jump('umma'), jump('girsu'), move(1, 0), move(0, 0), move(-1, 0), move(-2, 0), jump('isin'), drop('B-S01')] },
    { type: 'endMovement', player: 'bob' },
    { type: 'chooseCombat', player: 'bob', star: 'isin' },
  );

describe('pickup and drop while moving (§6.2, D-017)', () => {
  test('at a star: pick up each own loose Systemship there, 1 MP each, while racks are free', () => {
    const p = planInfo(annBuilt(), 'A-W1', []);
    assert.deepEqual(p.cargo.map((c) => c.label), ['Pick up S01', 'Pick up S02']);
    const one = planInfo(annBuilt(), 'A-W1', [pickup('A-S01')]);
    assert.equal(one.cost, 1);
    assert.deepEqual(one.cargo.map((c) => c.label), ['Pick up S02', 'Drop S01']);
    assert.deepEqual(planInfo(annBuilt(), 'A-W1', [pickup('A-S01'), pickup('A-S02')]).cargo.map((c) => c.label), ['Drop S01', 'Drop S02'], 'no free rack left');
  });

  test('the path stays on the hex for a pickup or drop', () => {
    const p = planInfo(annBuilt(), 'A-W1', [pickup('A-S01'), jump('isin'), drop('A-S01')]);
    assert.deepEqual(p.path, [{ q: -11, r: 0 }, { q: -11, r: 0 }, { q: -7, r: 0 }, { q: -7, r: 0 }]);
    assert.equal(p.cost, 3);
  });

  test('no pickup or drop in a space hex', () => {
    const p = planInfo(annBuilt(), 'A-W1', [pickup('A-S01'), move(-10, 0)]);
    assert.deepEqual(p.cargo, []);
  });

  test('the panel offers them as buttons and lists them as steps', () => {
    const html = renderMovement(annBuilt(), 'ann', { plan: { ship: 'A-W1', steps: [pickup('A-S01')] }, error: null });
    assert.match(html, /<li>Pick up S01<\/li>/);
    assert.match(html, /data-action="cargo-step" data-index="0"[^>]*>Pick up S02 \(1 MP\)/);
  });

  test('the map counts only ships on the map; the owner sees cargo in the panel, the enemy does not (D-039)', () => {
    const s = annMoved();
    assert.match(renderMap(s), /data-side="A" data-hex="-7,0">.*?>2<\/text>/s, 'W1 and the dropped S02 at Isin');
    assert.match(renderHexPanel(s, { q: -7, r: 0 }, { viewer: 'ann' }), /carried by W1/);
    assert.doesNotMatch(renderHexPanel(s, { q: -7, r: 0 }, { viewer: 'bob' }), /S01/);
  });

  test('the log tells what the counters show: off the map at one star, back on at another', () => {
    const before = annBuilt();
    const after = annMoved();
    const texts = logEntries(before, { type: 'move', player: 'ann', ship: 'A-W1', path: [] }, after).map((e) => e.text);
    assert.deepEqual(texts, ["ann's W1 moved from Ur to Isin.", "ann's S01, S02 left the map at Ur (taken aboard).", "ann's S02 was put down at Isin."]);
  });
});

describe('rearranging after combat (§3 event 5, §8)', () => {
  const atRearrange = () => play(annMoved(), { type: 'endMovement', player: 'ann' });

  test('the stars where the phasing player can shuffle Systemships, and who carries what now', () => {
    const s = atRearrange();
    assert.equal(s.step, 'rearrange');
    assert.deepEqual(rearrangeStars(s, 'A'), ['isin']);
    assert.deepEqual(currentLoads(s, 'isin', 'A'), { 'A-S01': 'A-W1', 'A-S02': null });
  });

  test('the action names every Warpship there with its new load; the engine checks the racks', () => {
    const s = atRearrange();
    const action = rearrangeAction('ann', 'isin', { 'A-S01': null, 'A-S02': 'A-W1' });
    assert.deepEqual(action, { type: 'rearrange', player: 'ann', star: 'isin', assignment: { 'A-W1': ['A-S02'] } });
    const after = play(s, action);
    assert.deepEqual(Object.keys(after.ships['A-W1'].carrying), ['A-S02']);
    assert.equal(after.ships['A-S01'].q, -7);
    assert.equal(rearrangeCheck(s, 'ann', 'isin', { 'A-S01': 'A-W1', 'A-S02': 'A-W1' }), null, 'SR 2 holds both');
  });

  test('the form: one select per Systemship, the Warpships with racks as choices', () => {
    const html = renderRearrange(atRearrange(), 'ann', {}, null);
    assert.match(html, /<h2>End of turn<\/h2>/);
    assert.match(html, /data-star="isin"/);
    assert.match(html, /<select name="A-S01">.*<option value="A-W1" selected>W1<\/option>/s);
    assert.match(html, /<select name="A-S02"><option value="" selected>Left on Isin<\/option>/);
    assert.match(html, /data-action="apply-rearrange" data-star="isin"/);
    assert.match(html, /data-action="end-turn"/);
  });

  test('nothing to rearrange: just End turn', () => {
    const s = play(annBuilt(), { type: 'endMovement', player: 'ann' });
    assert.deepEqual(rearrangeStars(s, 'A'), ['ur'], 'W1 and both Systemships at Ur');
    const none = structuredClone(s);
    for (const id of ['A-S01', 'A-S02']) delete none.ships[id];
    assert.deepEqual(rearrangeStars(none, 'A'), []);
    assert.doesNotMatch(renderRearrange(none, 'ann', {}, null), /apply-rearrange/);
  });
});

describe('pickup and drop in combat (§7.3)', () => {
  test("a Warpship's order offers dropping what it carries and picking up loose Systemships, while racks are free", () => {
    const html = renderOrders(atCombat(), 'ann', blankOrders(atCombat(), 'A'));
    assert.match(html, /<select name="carry"><option value="">None<\/option><option value="drop:A-S01">Drop S01<\/option><option value="pickup:A-S02">Pick up S02<\/option><\/select>/);
    assert.doesNotMatch(html, /data-ship="A-S01"/, 'a carried Systemship takes no part (D-020)');
  });

  test("the engine's rules for it: Dodge or Retreat, Drive 0, Screen 0, no Missiles", () => {
    const s = atCombat();
    const orders = { ...blankOrders(s, 'A'), 'A-W1': { tactic: 'attack', D: 0, B: 5, S: 0, T: 0, beamTarget: 'B-W1', pickup: 'A-S02' } };
    assert.match(orderProblems(s, 'A', orders)[0].message, /must Dodge or Retreat/);
    const ok = { ...orders, 'A-W1': { ...orders['A-W1'], tactic: 'dodge' } };
    assert.deepEqual(orderProblems(s, 'A', ok), []);
  });

  test('a pickup or drop is part of the written order, shown to both players', () => {
    assert.deepEqual(orderText('A-W1', { level: 0 }, { tactic: 'dodge', D: 0, B: 5, S: 0, T: 0, beamTarget: 'B-W1', pickup: 'A-S02' }),
      ['W1 (Level 0) DODGE, Beam at W1: D=0, B=5, S=0, T=0.', 'Picks up S02.']);
    assert.deepEqual(orderText('A-W1', { level: 0 }, { tactic: 'retreat', D: 0, B: 0, S: 0, T: 0, drop: 'A-S01' }),
      ['W1 (Level 0) RETREAT: D=0, B=0, S=0, T=0.', 'Drops S01.']);
  });
});

describe('hits on carried Systemships (D-021, D-034)', () => {
  // Round 1: bob's S01 fires Beam 7 at ann's W1, both Attack at Drive 0: Hit +2, 9 hits, unscreened.
  const atHits = () => {
    const s = atCombat();
    return play(
      s,
      { type: 'orders', player: 'bob', orders: { ...blankOrders(s, 'B'), 'B-S01': { tactic: 'attack', D: 0, B: 7, S: 0, T: 0, beamTarget: 'A-W1' } } },
      { type: 'orders', player: 'ann', orders: blankOrders(s, 'A') },
    );
  };

  test('the owner may put hits on a carried Systemship instead', () => {
    const s = atHits();
    assert.equal(s.combat.stage, 'hits');
    const html = renderHits(s, 'ann', {});
    assert.match(html, /W1<\/strong> must take <strong>9 hits/);
    assert.match(html, /<fieldset class="carried" data-carried="A-S01">/);
    assert.deepEqual(hitProblems(s, 'A', { 'A-W1': { PD: 5, carried: { 'A-S01': { PD: 4 } } } }), []);
    assert.match(hitProblems(s, 'A', { 'A-W1': { SR: 2, PD: 7 } })[0].message, /occupied racks cannot/);
  });
});

describe('forced withdrawal: carrying loose Systemships off (§7 step 6(c), D-023)', () => {
  // Three rounds of blank orders: nobody takes effective hits, so bob (phasing) must withdraw.
  const atWithdraw = () => {
    let s = atCombat();
    for (let i = 0; i < 3; i++) s = play(s, { type: 'orders', player: 'bob', orders: blankOrders(s, 'B') }, { type: 'orders', player: 'ann', orders: blankOrders(s, 'A') });
    return s;
  };

  test('each loose Systemship: which Warpship takes it, or left behind and destroyed', () => {
    const s = atWithdraw();
    assert.equal(s.combat.stage, 'withdraw');
    const html = renderPlacement(s, 'bob', {}, 'B-W1', {});
    assert.match(html, /<select name="B-S01"><option value="">Left behind \(destroyed\)<\/option><option value="B-W1">W1<\/option><\/select>/);
  });

  test("the engine's check: as many as the free racks can take must go", () => {
    const s = atWithdraw();
    const dest = { 'B-W1': { q: -6, r: 0 } };
    assert.match(withdrawCheck(s, 'bob', dest, {}), /1 Systemships must be carried off/);
    assert.equal(withdrawCheck(s, 'bob', dest, { 'B-S01': 'B-W1' }), null);
    const after = play(s, withdrawAction('bob', dest, { 'B-S01': 'B-W1' }));
    assert.deepEqual(Object.keys(after.ships['B-W1'].carrying), ['B-S01']);
  });
});

describe('the log follows counters in combat (§7.3, §7 step 6(c))', () => {
  test('a Systemship picked up in a round leaves the map', () => {
    const s = atCombat();
    const bob = play(s, { type: 'orders', player: 'bob', orders: blankOrders(s, 'B') });
    const action = { type: 'orders', player: 'ann', orders: { ...blankOrders(s, 'A'), 'A-W1': { tactic: 'dodge', D: 0, B: 0, S: 0, T: 0, pickup: 'A-S02' } } };
    const after = play(bob, action);
    const texts = logEntries(bob, action, after).map((e) => e.text);
    assert.deepEqual(texts, ['Round 1 at Isin: no effective hits.', "ann's S02 left the map at Isin (taken aboard)."]);
  });

  test('a Systemship carried off in a forced withdrawal leaves the map', () => {
    let s = atCombat();
    for (let i = 0; i < 3; i++) s = play(s, { type: 'orders', player: 'bob', orders: blankOrders(s, 'B') }, { type: 'orders', player: 'ann', orders: blankOrders(s, 'A') });
    const action = withdrawAction('bob', { 'B-W1': { q: -6, r: 0 } }, { 'B-S01': 'B-W1' });
    const texts = logEntries(s, action, play(s, action)).map((e) => e.text);
    assert.deepEqual(texts, ["bob's W1 withdrew to space -6, 0.", "bob's S01 left the map at Isin (taken aboard). Combat at Isin is over."]);
  });
});

describe('the public record keeps cargo secret (D-039)', () => {
  test('a carried Systemship destroyed with its Warpship is not named', () => {
    const s = atCombat();
    const last = {
      star: 'isin', round: 1, orders: blankOrders(s, 'A'), ships: { 'A-W1': { owner: 'A', level: 0 }, 'A-S02': { owner: 'A', level: 0 } },
      shots: [], damage: { 'A-W1': { total: 0, absorbed: 0, effective: 0 }, 'A-S02': { total: 0, absorbed: 0, effective: 0 } },
      destroyed: ['A-W1', 'A-S01'], escaped: [], end: null, quietRounds: 0,
    };
    const after = { ...s, lastRound: last };
    const report = pendingReport(after, new Set());
    assert.match(report.html, /Destroyed: <b[^>]*>ann's W1<\/b>/);
    assert.doesNotMatch(report.html, /S01/);
    const texts = logEntries(s, { type: 'orders', player: 'ann', orders: {} }, after).map((e) => e.text).join(' ');
    assert.match(texts, /Destroyed: ann's W1\./);
    assert.doesNotMatch(texts, /S01/);
  });
});
