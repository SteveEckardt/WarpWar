import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, applyAction } from '../src/engine/game.js';
import { renderNewGame } from '../src/ui/setup.js';
import { EMPTY_DESIGN, renderBuilder } from '../src/ui/builder.js';
import { renderStatus } from '../src/ui/panel.js';
import { actor } from '../src/ui/view.js';
import { orderText, renderOrders, renderOrderCheck, pendingReport, renderEcm, renderEcmCheck, renderHits } from '../src/ui/combat.js';

// Phase 8d: ECM in the UI (fan §7.1.1, D-052 to D-054). After orders are revealed, the defender spreads ECM over
// the Missiles fired at its ships, in private; the fire is then read with the Missiles where ECM put them.
const mapData = JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8'));

function play(state, ...actions) {
  for (const action of actions) {
    const r = applyAction(state, action);
    assert.equal(r.ok, true, `${action.type} by ${action.player} rejected: ${r.code}: ${r.message}`);
    state = r.state;
  }
  return state;
}

// Advanced with ECM. ann's A-W1 (PD 6, E 2) and bob's B-W1 (PD 3, T 1, M 3) meet at Isin (a plain-data edit
// stands in for movement); bob, phasing, starts the combat there.
const started = () =>
  play(
    createGame({ map: mapData, scenario: 'advanced', players: ['ann', 'bob'], modules: ['ecm'] }),
    { type: 'setFirstPlayer', player: 'ann' },
    { type: 'chooseSide', player: 'bob', side: 'B' },
  );
const atOrders = () => {
  let s = play(
    started(),
    { type: 'build', player: 'ann', ships: [{ id: 'A-W1', design: { WG: true, PD: 6, E: 2 }, at: 'ur' }] },
    { type: 'endMovement', player: 'ann' }, { type: 'endTurn', player: 'ann' },
    { type: 'build', player: 'bob', ships: [{ id: 'B-W1', design: { WG: true, PD: 3, T: 1, M: 3 }, at: 'nippur' }] },
  );
  s = structuredClone(s);
  Object.assign(s.ships['A-W1'], { q: -7, r: 0 });
  Object.assign(s.ships['B-W1'], { q: -7, r: 0 });
  return play(s, { type: 'endMovement', player: 'bob' }, { type: 'chooseCombat', player: 'bob', star: 'isin' });
};
const ANN = { 'A-W1': { tactic: 'attack', D: 3, B: 0, S: 0, T: 0, E: 2 } };
const atEcm = () => play(
  atOrders(),
  { type: 'orders', player: 'bob', orders: { 'B-W1': { tactic: 'attack', D: 0, B: 0, S: 0, T: 1, missiles: [{ target: 'A-W1', drive: 3 }] } } },
  { type: 'orders', player: 'ann', orders: ANN },
);
const GOOD = { 'A-W1': { 'B-W1:0': { points: 2, shift: -1 } } };

describe('choosing ECM (D-054)', () => {
  test('the new-game form offers it, marked Advanced only; the status line names it', () => {
    assert.match(renderNewGame({}), /<input type="checkbox" name="module" value="ecm"> ECM[^<]*Advanced only/);
    assert.match(renderStatus(started()), /fan rules: ECM/);
  });

  test('the builder has an ECM field, 1 BP a point', () => {
    const html = renderBuilder(started(), 'ann', { design: { ...EMPTY_DESIGN }, drafts: [], error: null, repairs: {}, resupply: {} });
    assert.match(html, /name="E"/);
    assert.match(html, /ECM, 1 BP each/);
  });
});

describe('orders with ECM (fan §5.1, §5.2)', () => {
  test('ECM is powered in the order and counts toward PD', () => {
    const s = atOrders();
    assert.match(renderOrders(s, 'ann', { 'A-W1': { tactic: 'attack', D: 0, B: 0, S: 0, T: 0 } }), /<input type="number" name="E" min="0" max="2"/);
    assert.match(renderOrderCheck(s, 'A', ANN), /power 5 of 6/);
    assert.deepEqual(orderText('A-W1', { level: 0 }, ANN['A-W1']), ['W1 (Level 0) ATTACK: D=3, B=0, S=0, T=0, E=2.']);
  });
});

describe('the ECM step (fan §7.1.1, D-052, D-053)', () => {
  test('after the orders are revealed, the defender is asked, in private', () => {
    const s = atEcm();
    assert.equal(s.combat.stage, 'ecm');
    assert.equal(actor(s), 'ann');
  });

  test('both players first see the orders, but not the fire, which waits for ECM', () => {
    const r = pendingReport(atEcm(), new Set());
    assert.equal(r.key, 'orders:isin:1');
    assert.match(r.html, /W1 \(Level 0\) ATTACK: D=3, B=0, S=0, T=0, E=2\./);
    assert.match(r.html, /M at W1: D=3\./);
    assert.doesNotMatch(r.html, /<h4>Fire<\/h4>/);
    assert.match(r.html, /ECM is spread next/);
  });

  test('the form: each Missile fired at each ship with ECM powered, with points and a Drive change', () => {
    const html = renderEcm(atEcm(), 'ann', {});
    assert.match(html, /<fieldset class="ecm" data-ship="A-W1">/);
    assert.match(html, /data-ref="B-W1:0"/);
    assert.match(html, /bob's W1<\/b>, Drive 3, Level 0/);
    assert.match(html, /name="points"/);
    assert.match(html, /name="shift"/);
    assert.match(html, /2 ECM powered/);
  });

  test("the engine's check as the player types", () => {
    const s = atEcm();
    assert.match(renderEcmCheck(s, 'A', { 'A-W1': { 'B-W1:0': { points: 2, shift: -3 } } }), /2 points on W1's Missile 1 give 2 working points/);
    assert.match(renderEcmCheck(s, 'A', { 'A-W1': { 'B-W1:0': { points: 2, shift: -3 } } }), /data-action="submit-ecm"[^>]*disabled/);
    assert.doesNotMatch(renderEcmCheck(s, 'A', GOOD), /disabled/);
  });

  test('then the fire, read where ECM put the Missile, shown to both; hits from it', () => {
    const s = play(atEcm(), { type: 'allocateEcm', player: 'ann', ecm: GOOD });
    assert.equal(s.combat.stage, 'hits');
    const r = pendingReport(s, new Set(['orders:isin:1']));
    assert.equal(r.key, 'fire:isin:1');
    assert.match(r.html, /Missile, ECM moved its Drive 3 to 2, Attack vs Attack, Drive -1: <strong>Hit<\/strong>, 2 hits/);
    assert.match(renderHits(s, 'ann', {}), /W1<\/strong> must take <strong>2 hits/);
  });
});
