import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, applyAction } from '../src/engine/game.js';
import { renderNewGame } from '../src/ui/setup.js';
import { EMPTY_DESIGN, buildAction, buildCheck, renderBuilder } from '../src/ui/builder.js';
import { renderStatus } from '../src/ui/panel.js';
import { orderText, blankOrders, orderProblems, renderOrders, renderOrderCheck, pendingReport, renderHits } from '../src/ui/combat.js';

// Phase 8c: Cannons and Shells in the UI (fan §10.2.3, §10.2.4, D-048 to D-051).
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

const started = (scenario, modules = ['cannons']) =>
  play(
    createGame({ map: mapData, scenario, players: ['ann', 'bob'], modules }),
    { type: 'setFirstPlayer', player: 'ann' },
    { type: 'chooseSide', player: 'bob', side: 'B' },
  );
const ui = (extra = {}) => ({ design: { ...EMPTY_DESIGN }, drafts: [], error: null, repairs: {}, resupply: {}, ...extra });

// Learning with Cannons: ann's W1 (PD 30, C 2, SH 18) at Uruk; bob's W1 (PD 12, B 10, S 13) stops on it.
const atOrders = () =>
  play(
    started('learning'),
    { type: 'build', player: 'ann', ships: [{ id: 'A-W1', design: { WG: true, PD: 30, C: 2, SH: 18 }, at: 'ur' }] },
    { type: 'move', player: 'ann', ship: 'A-W1', path: [jump('isin'), jump('uruk')] },
    { type: 'endMovement', player: 'ann' }, { type: 'endTurn', player: 'ann' },
    { type: 'build', player: 'bob', ships: [{ id: 'B-W1', design: { WG: true, PD: 12, B: 10, S: 13 }, at: 'nippur' }] },
    { type: 'move', player: 'bob', ship: 'B-W1', path: [jump('umma'), jump('girsu'), move(1, 0), move(0, 0), move(-1, 0), move(-2, 0)] },
    { type: 'endMovement', player: 'bob' },
    { type: 'chooseCombat', player: 'bob', star: 'uruk' },
    { type: 'orders', player: 'bob', orders: { 'B-W1': { tactic: 'attack', D: 0, B: 10, S: 0, T: 0, beamTarget: 'A-W1' } } },
  );
const ANN = { 'A-W1': { tactic: 'attack', D: 0, B: 0, S: 0, T: 0, C: 2, shells: [3, 2], cannonTarget: 'B-W1' } };

describe('choosing the module (D-051)', () => {
  test('the new-game form offers Cannons and Shells; the status line names it', () => {
    assert.match(renderNewGame({}), /<input type="checkbox" name="module" value="cannons">/);
    assert.match(renderStatus(started('learning', ['armor', 'cannons'])), /fan rules: Armor, Cannons and Shells/);
  });
});

describe('the builder (D-050)', () => {
  test('Cannon and Shell fields, priced 1 BP a Cannon and 6 Shells a BP', () => {
    const html = renderBuilder(started('learning'), 'ann', ui());
    assert.match(html, /name="C"/);
    assert.match(html, /Cannons, 1 BP each/);
    assert.match(html, /name="SH"/);
    assert.match(html, /Shells, 6 per BP/);
    assert.doesNotMatch(renderBuilder(started('learning', []), 'ann', ui()), /name="SH"/);
  });

  test('Shell resupply is pooled at 6 to the BP, beside Missiles', () => {
    let s = play(
      started('advanced'),
      { type: 'build', player: 'ann', ships: [{ id: 'A-W1', design: { WG: true, PD: 1, C: 1, SH: 6 }, at: 'ur' }, { id: 'A-W2', design: { WG: true, PD: 1, C: 1, SH: 6, T: 1, M: 3 }, at: 'ur' }] },
      { type: 'endMovement', player: 'ann' }, { type: 'endTurn', player: 'ann' },
      { type: 'build', player: 'bob', ships: [] }, { type: 'endMovement', player: 'bob' }, { type: 'endTurn', player: 'bob' },
    );
    s = structuredClone(s);
    Object.assign(s.ships['A-W1'], { SH: 2 });
    Object.assign(s.ships['A-W2'], { SH: 5, M: 2 });
    assert.match(renderBuilder(s, 'ann', ui()), /Shells 2\/6/);
    const resupply = { 'A-W1': { SH: 4 }, 'A-W2': { SH: 1, M: 1 } };
    const check = buildCheck(s, 'ann', ui({ resupply }));
    assert.equal(check.resupply, 2);
    assert.equal(check.message, null);
    assert.deepEqual(buildAction('ann', [], {}, resupply).resupply, resupply);
  });
});

describe('Cannon orders (fan §5.1, D-048)', () => {
  test('one target for all Cannons, and a burst of 1 to 3 Shells for each', () => {
    const html = renderOrders(atOrders(), 'ann', blankOrders(atOrders(), 'A'));
    assert.match(html, /<select name="cannonTarget"><option value="">None<\/option><option value="B-W1">W1<\/option><\/select>/);
    assert.equal((html.match(/<select name="burst">/g) ?? []).length, 2);
    assert.match(html, /<option value="3">3 Shells<\/option>/);
  });

  test('the power used counts a PD for each Cannon fired; the engine checks the rest', () => {
    const s = atOrders();
    assert.match(renderOrderCheck(s, 'A', ANN), /power 2 of 30/);
    assert.deepEqual(orderProblems(s, 'A', ANN), []);
    assert.match(orderProblems(s, 'A', { 'A-W1': { ...ANN['A-W1'], shells: [3, 4] } })[0].message, /1 to 3 Shells/);
  });

  test('written out, and shown when the orders are revealed', () => {
    assert.deepEqual(orderText('A-W1', { level: 0 }, ANN['A-W1']), ['W1 (Level 0) ATTACK: D=0, B=0, S=0, T=0, C=2.', 'Cannons at W1: 3 Shells, 2 Shells.']);
    const s = play(atOrders(), { type: 'orders', player: 'ann', orders: ANN });
    const r = pendingReport(s, new Set());
    assert.match(r.html, /Cannons at W1: 3 Shells, 2 Shells\./);
    assert.match(r.html, /ann's W1<\/b> → <b[^>]*>bob's W1<\/b>: Cannon \(3 Shells\), Attack vs Attack, Drive 0: <strong>Hit \+2<\/strong>, 5 hits/);
  });
});

describe('hits on Cannons and Shells (D-050)', () => {
  test('C and SH can take hits; Shells six to a hit, after the Shells fired', () => {
    const s = play(atOrders(), { type: 'orders', player: 'ann', orders: ANN });
    const html = renderHits(s, 'ann', {});
    assert.match(html, /name="C"/);
    assert.match(html, /SH \(13\), 6 a hit/);
    assert.match(html, /<input type="number" name="SH" min="0" max="3"/);
  });
});
