import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, applyAction } from '../src/engine/game.js';
import { actor, plainIds } from '../src/ui/view.js';
import { renderStatus } from '../src/ui/panel.js';
import {
  orderText, blankOrders, orderProblems, renderChoose, renderOrders, pendingReport,
  hitProblems, renderHits, placementShips, placementTargets, renderPlacement,
} from '../src/ui/combat.js';

// Phase 7d: combat (§7) with hidden orders. Orders are written in secret and shown once both are in (§7 step 2);
// where a player takes hits stays on their own record (§7.2.2, D-039).
const mapData = JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8'));
const jump = (to) => ({ type: 'jump', to });
const move = (q, r) => ({ type: 'move', to: { q, r } });

function play(state, ...actions) {
  for (const action of actions) {
    const r = applyAction(state, action);
    assert.equal(r.ok, true, `${action.type} by ${action.player} rejected: ${r.code}: ${r.message}`);
    state = r.state;
  }
  return state;
}

// The scripted game from test/game.test.js with UI ids: ann (A) W1 at Uruk; bob (B) W1 stops on it, W2 stays home.
const contested = () =>
  play(
    createGame({ map: mapData, scenario: 'learning', players: ['ann', 'bob'] }),
    { type: 'setFirstPlayer', player: 'ann' },
    { type: 'chooseSide', player: 'bob', side: 'B' },
    { type: 'build', player: 'ann', ships: [{ id: 'A-W1', design: { WG: true, PD: 12, B: 12, S: 11 }, at: 'ur' }] },
    { type: 'move', player: 'ann', ship: 'A-W1', path: [jump('isin'), jump('uruk')] },
    { type: 'endMovement', player: 'ann' },
    { type: 'endTurn', player: 'ann' },
    {
      type: 'build', player: 'bob', ships: [
        { id: 'B-W1', design: { WG: true, PD: 10, B: 10, S: 5 }, at: 'nippur' },
        { id: 'B-W2', design: { WG: true, PD: 3, B: 2 }, at: 'nippur' },
      ],
    },
    { type: 'move', player: 'bob', ship: 'B-W1', path: [jump('umma'), jump('girsu'), move(1, 0), move(0, 0), move(-1, 0), move(-2, 0)] },
    { type: 'endMovement', player: 'bob' },
  );

const ORDERS = {
  ann: { 'A-W1': { tactic: 'attack', D: 0, B: 10, S: 2, T: 0, beamTarget: 'B-W1' } },
  bob: { 'B-W1': { tactic: 'attack', D: 0, B: 10, S: 0, T: 0, beamTarget: 'A-W1' } },
};
const atOrders = () => play(contested(), { type: 'chooseCombat', player: 'bob', star: 'uruk' });
const bobOrdered = () => play(atOrders(), { type: 'orders', player: 'bob', orders: ORDERS.bob });
// Round 1: Attack/Attack at 0 is Hit +2. A-W1 takes 12 - 2 (Screen) = 10; B-W1 takes 12.
const atHits = () => play(bobOrdered(), { type: 'orders', player: 'ann', orders: ORDERS.ann });
const roundDone = () =>
  play(
    atHits(),
    { type: 'allocateHits', player: 'bob', allocations: { 'B-W1': { PD: 4, B: 3, S: 5 } } },
    { type: 'allocateHits', player: 'ann', allocations: { 'A-W1': { S: 9, PD: 1 } } },
  );
// bob's W1 retreats at Drive 10 while ann attacks at Drive 0: Attack row -3 or less vs Retreating is Escapes.
const escaped = () =>
  play(
    atOrders(),
    { type: 'orders', player: 'bob', orders: { 'B-W1': { tactic: 'retreat', D: 10, B: 0, S: 0, T: 0 } } },
    { type: 'orders', player: 'ann', orders: { 'A-W1': { tactic: 'attack', D: 0, B: 1, S: 0, T: 0, beamTarget: 'B-W1' } } },
  );

describe('whose screen it is in combat', () => {
  test('the phasing player picks the star, then writes orders first; then the other player', () => {
    assert.equal(actor(contested()), 'bob');
    assert.equal(actor(atOrders()), 'bob');
    assert.equal(actor(bobOrdered()), 'ann');
  });

  test('hits are allocated by each owner that owes them, phasing player first', () => {
    const s = atHits();
    assert.equal(s.combat.stage, 'hits');
    assert.equal(actor(s), 'bob');
    assert.equal(actor(play(s, { type: 'allocateHits', player: 'bob', allocations: { 'B-W1': { PD: 4, B: 3, S: 5 } } })), 'ann');
  });

  test('escaped ships are placed by their owner; a forced withdrawal by the phasing player', () => {
    const s = escaped();
    assert.equal(s.combat.stage, 'retreats');
    assert.equal(actor(s), 'bob');
    const w = structuredClone(atOrders());
    w.combat.stage = 'withdraw';
    assert.equal(actor(w), 'bob');
  });
});

describe('orderText: orders written as in the rulebook (§7.1.2, §7.1.3)', () => {
  test('W3 fires its Beam at S25', () => {
    assert.deepEqual(orderText('W3', { level: 0 }, { tactic: 'attack', D: 0, B: 3, S: 2, T: 0, beamTarget: 'S25' }),
      ['W3 (Level 0) ATTACKS S25: D=0, B=3, S=2, T=0.']);
  });

  test('S25 dodges and fires a Missile', () => {
    assert.deepEqual(orderText('S25', { level: 0 }, { tactic: 'dodge', D: 4, B: 0, S: 0, T: 1, missiles: [{ target: 'W3', drive: 3 }] }),
      ['S25 (Level 0) DODGE: D=4, B=0, S=0, T=1.', 'M at W3: D=3.']);
  });

  test('a retreat; ids are shown as counter names', () => {
    assert.deepEqual(orderText('B-W1', { level: 0 }, { tactic: 'retreat', D: 10, B: 0, S: 0, T: 0 }), ['W1 (Level 0) RETREAT: D=10, B=0, S=0, T=0.']);
  });
});

describe('writing orders (§7 step 1)', () => {
  test('a blank order for each of your ships in the combat', () => {
    assert.deepEqual(blankOrders(atOrders(), 'B'), { 'B-W1': { tactic: 'attack', D: 0, B: 0, S: 0, T: 0 } });
  });

  test("the engine's objections, for your own ships only", () => {
    const s = atOrders();
    assert.deepEqual(orderProblems(s, 'B', ORDERS.bob), []);
    const over = orderProblems(s, 'B', { 'B-W1': { tactic: 'attack', D: 5, B: 10, S: 0, T: 0, beamTarget: 'A-W1' } });
    assert.equal(over.length, 1);
    assert.equal(over[0].ship, 'B-W1');
    assert.match(over[0].message, /PD is 10/);
  });

  test('the form: your ships, enemy counters as targets, no enemy records (D-039)', () => {
    const html = renderOrders(atOrders(), 'bob', blankOrders(atOrders(), 'B'));
    assert.match(html, /data-ship="B-W1"/);
    assert.doesNotMatch(html, /data-ship="A-W1"/);
    assert.match(html, /<option value="A-W1">W1<\/option>/);
    assert.doesNotMatch(html, /\b12\b/, "ann's W1 is built with 12s; none of it may show");
    assert.match(html, /data-action="submit-orders"/);
  });

  test('an illegal order disables Submit and says why', () => {
    const html = renderOrders(atOrders(), 'bob', { 'B-W1': { tactic: 'attack', D: 11, B: 0, S: 0, T: 0 } });
    assert.match(html, /data-action="submit-orders"[^>]*disabled/);
    assert.match(html, /PD is 10/);
  });

  test("the second player cannot see the first player's orders", () => {
    const html = renderOrders(bobOrdered(), 'ann', blankOrders(bobOrdered(), 'A'));
    assert.doesNotMatch(html, /ATTACKS|B=10/);
  });
});

describe('the public report of a round (§7 step 2)', () => {
  test('nothing before both orders are in', () => {
    assert.equal(pendingReport(atOrders(), new Set()), null);
    assert.equal(pendingReport(bobOrdered(), new Set()), null);
  });

  test('once both are in: every order, every shot, and the effective hits', () => {
    const r = pendingReport(atHits(), new Set());
    assert.equal(r.key, 'orders:uruk:1');
    assert.match(r.html, /W1 \(Level 0\) ATTACKS W1: D=0, B=10, S=2, T=0\./);
    assert.match(r.html, /W1 \(Level 0\) ATTACKS W1: D=0, B=10, S=0, T=0\./);
    assert.match(r.html, /Hit \+2/);
    assert.match(r.html, /ann's W1<\/b> → <b[^>]*>bob's W1<\/b>: Beam, Attack vs Attack, Drive 0: <strong>Hit \+2/);
    assert.match(r.html, /12 hits/);
    assert.match(r.html, /10 effective/);
    assert.equal(pendingReport(atHits(), new Set([r.key])), null, 'shown once');
  });

  test('after the round: the result, but not where anyone took their hits', () => {
    const r = pendingReport(roundDone(), new Set(['orders:uruk:1']));
    assert.equal(r.key, 'round:uruk:1');
    assert.match(r.html, /Round 1 at Uruk/);
    assert.match(r.html, /No ship destroyed/);
    assert.doesNotMatch(r.html, /PD 4|S 9|allocat/i);
  });

  test('an escape is reported', () => {
    const r = pendingReport(escaped(), new Set());
    assert.match(r.html, /Escapes/);
    assert.match(r.html, /escaped/i);
  });
});

describe('allocating hits (§7.2.2)', () => {
  test('your ships that owe hits, with the hits each must take', () => {
    const html = renderHits(atHits(), 'bob', {});
    assert.match(html, /W1<\/strong> must take <strong>12 hits/);
    assert.match(html, /name="PD"/);
    assert.match(html, /data-action="submit-hits"[^>]*disabled/);
  });

  test("the engine's check: the exact total, within what each attribute has", () => {
    const s = atHits();
    assert.deepEqual(hitProblems(s, 'B', { 'B-W1': { PD: 4, B: 3, S: 5 } }), []);
    assert.match(hitProblems(s, 'B', { 'B-W1': { PD: 11 } })[0].message, /takes 12 hits but 11 were assigned/);
    assert.match(hitProblems(s, 'B', { 'B-W1': { S: 6, PD: 6 } })[0].message, /exceeds/);
  });
});

describe('placing escaped ships (§7 step 4, D-022)', () => {
  test('which ships, and the legal adjacent hexes', () => {
    const s = escaped();
    assert.deepEqual(placementShips(s, 'B'), ['B-W1']);
    assert.deepEqual(placementShips(s, 'A'), []);
    const hexes = placementTargets(s, 'B').map((h) => `${h.q},${h.r}`).sort();
    assert.deepEqual(hexes, ['-1,-1', '-1,0', '-2,-1', '-2,1', '-3,0', '-3,1']);
  });

  test('the form lists each ship and where it is going', () => {
    const html = renderPlacement(escaped(), 'bob', { 'B-W1': { q: -1, r: 0 } }, null);
    assert.match(html, /W1/);
    assert.match(html, /-1, 0/);
    assert.match(html, /data-action="submit-placement"/);
    assert.doesNotMatch(html, /data-action="submit-placement"[^>]*disabled/);
    assert.match(renderPlacement(escaped(), 'bob', {}, 'B-W1'), /data-action="submit-placement"[^>]*disabled/);
  });

  test('a forced withdrawal moves every Warpship of the phasing player in the hex', () => {
    const w = structuredClone(atOrders());
    w.combat.stage = 'withdraw';
    assert.deepEqual(placementShips(w, 'B'), ['B-W1']);
  });
});

describe('words on screen', () => {
  test('engine messages name ships by counter', () => {
    assert.equal(plainIds('B-W1 takes 12 hits but 11 were assigned'), 'W1 takes 12 hits but 11 were assigned');
    assert.equal(plainIds('A-S07: no'), 'S07: no');
  });

  test('the status line names the combat star', () => {
    assert.match(renderStatus(atOrders()), /orders at Uruk/);
  });

  test('placing escaped ships comes after the round that ended', () => {
    assert.match(renderPlacement(escaped(), 'bob', {}, 'B-W1'), /After round 1/);
  });
});

describe('choosing the next combat (§7)', () => {
  test('one button per contested star', () => {
    const html = renderChoose(contested());
    assert.match(html, /data-action="choose-combat" data-star="uruk"/);
    assert.match(html, /Uruk/);
  });
});
