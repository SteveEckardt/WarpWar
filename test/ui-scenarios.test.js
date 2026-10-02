import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, applyAction } from '../src/engine/game.js';
import { renderNewGame } from '../src/ui/setup.js';
import { EMPTY_DESIGN, buildAction, buildCheck, renderBuilder, renderBuildCheck } from '../src/ui/builder.js';
import { renderStatus } from '../src/ui/panel.js';
import { logEntries, resultText } from '../src/ui/log.js';

// Phase 7f: the UI for the Basic and Advanced scenarios (§4.2, §4.3, §5.3, D-041). The engine judges every
// build; the builder shows its verdict as the player goes.
const mapData = JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8'));

function play(state, ...actions) {
  for (const action of actions) {
    const r = applyAction(state, action);
    assert.equal(r.ok, true, `${action.type} by ${action.player} rejected: ${r.code}: ${r.message}`);
    state = r.state;
  }
  return state;
}

const started = (scenario) =>
  play(
    createGame({ map: mapData, scenario, players: ['ann', 'bob'] }),
    { type: 'setFirstPlayer', player: 'ann' },
    { type: 'chooseSide', player: 'bob', side: 'B' },
  );
const pass = (s, player, ships = []) =>
  play(s, { type: 'build', player, ships }, { type: 'endMovement', player }, { type: 'endTurn', player });
const ui = (extra = {}) => ({ design: { ...EMPTY_DESIGN }, drafts: [], error: null, repairs: {}, resupply: {}, ...extra });

// Advanced, game-turn 2, ann's Build event: W1 (built PD 7, B 3) damaged to PD 2 at Ur; S01 (M 3) down to 1
// Missile at Ur; W2, damaged, at Isin, away from any base. ann has 20 - 15 - 3 + 10 = 12 BP.
// (Plain-data edits stand in for the combat that did the damage.)
function damaged() {
  let s = pass(started('advanced'), 'ann', [
    { id: 'A-W1', design: { WG: true, PD: 7, B: 3 }, at: 'ur' },
    { id: 'A-S01', design: { PD: 1, T: 1, M: 3 }, at: 'ur' },
  ]);
  s = pass(s, 'bob');
  s = structuredClone(s);
  s.ships['A-W1'].PD = 2;
  s.ships['A-S01'].M = 1;
  s.ships['A-W2'] = { ...s.ships['A-W1'], q: -7, r: 0 };
  return s;
}

describe('choosing the scenario (§4)', () => {
  test('the new-game form offers the three scenarios, Learning first', () => {
    const html = renderNewGame({});
    for (const v of ['learning', 'basic', 'advanced']) assert.match(html, new RegExp(`name="scenario" value="${v}"`));
    assert.match(html, /value="learning" checked/);
    assert.match(html, /50 BP/);
    assert.match(html, /20 BP, then 10/);
    assert.match(renderNewGame({ scenario: 'advanced' }), /value="advanced" checked/);
  });
});

describe('the builder in Basic (§4.2)', () => {
  test('Warpships or Systemships, with racks; all 50 BP must be spent', () => {
    const html = renderBuilder(started('basic'), 'ann', ui());
    assert.match(html, /name="WG"/);
    assert.match(html, /name="SR"/);
    assert.match(html, /50 BP/);
    assert.match(html, /must all be spent/);
    assert.doesNotMatch(html, /Repair/);
  });

  test('the engine says what is wrong before the player presses Build', () => {
    const s = started('basic');
    const drafts = [{ id: 'A-W1', design: { ...EMPTY_DESIGN, PD: 10 }, at: 'ur' }];
    const check = buildCheck(s, 'ann', ui({ drafts }));
    assert.equal(check.total, 15);
    assert.match(check.message, /All 50 BP must be spent/);
    assert.match(renderBuildCheck(s, 'ann', ui({ drafts })), /data-action="build"[^>]*disabled/);
    const full = [{ id: 'A-W1', design: { ...EMPTY_DESIGN, PD: 45 }, at: 'ur' }];
    assert.equal(buildCheck(s, 'ann', ui({ drafts: full })).message, null);
    assert.doesNotMatch(renderBuildCheck(s, 'ann', ui({ drafts: full })), /disabled/);
  });
});

describe('the builder in Advanced (§4.3, §5.3)', () => {
  test('20 BP, saved if unspent; any of the three bases the player controls (D-013)', () => {
    const s = started('advanced');
    const html = renderBuilder(s, 'ann', ui());
    assert.match(html, /20 BP/);
    assert.match(html, /saved/);
    for (const b of ['Ur', 'Eridu', 'Larsa']) assert.match(html, new RegExp(`<option value="[a-z]+">${b}</option>`));
    const held = structuredClone(s);
    held.ships.X9 = { owner: 'B', WG: true, level: 0, PD: 1, B: 0, S: 0, T: 0, M: 0, SR: 0, built: {}, q: -9, r: -4 };
    assert.match(renderBuilder(held, 'ann', ui()), /<option value="eridu" disabled>Eridu \(enemy ships here\)<\/option>/);
  });

  test('ending a Build event with nothing built is allowed', () => {
    const s = started('advanced');
    assert.equal(buildCheck(s, 'ann', ui()).message, null);
    const html = renderBuildCheck(s, 'ann', ui());
    assert.match(html, /End Build event/);
    assert.doesNotMatch(html, /disabled/);
  });

  test('repair and resupply inputs for damaged ships at the bases only', () => {
    const html = renderBuilder(damaged(), 'ann', ui());
    assert.match(html, /<fieldset class="repair" data-ship="A-W1">/);
    assert.match(html, /PD 2\/7/);
    assert.match(html, /<input type="number" name="PD" min="0" max="5"/);
    assert.match(html, /<fieldset class="repair" data-ship="A-S01">/);
    assert.match(html, /Missiles 1\/3/);
    assert.doesNotMatch(html, /data-ship="A-W2"/, 'W2 is at Isin, not a base (§5.3)');
  });

  test('repairs and resupply are costed with new ships, and sent in one build action', () => {
    const s = damaged();
    assert.equal(s.bp.A, 12);
    const repairs = { 'A-W1': { PD: 5 } };
    const resupply = { 'A-S01': 2 };
    const check = buildCheck(s, 'ann', ui({ repairs, resupply }));
    assert.deepEqual({ ships: check.ships, repairs: check.repairs, resupply: check.resupply, total: check.total, left: check.left }, { ships: 0, repairs: 5, resupply: 1, total: 6, left: 6 });
    assert.equal(check.message, null);
    const after = play(s, buildAction('ann', [], repairs, resupply));
    assert.equal(after.ships['A-W1'].PD, 7);
    assert.equal(after.ships['A-S01'].M, 3);
    assert.match(buildCheck(s, 'ann', ui({ repairs: { 'A-W1': { PD: 5 } }, resupply, drafts: [{ id: 'A-W3', design: { ...EMPTY_DESIGN, PD: 2 }, at: 'ur' }] })).message, /costs 13 BP but you have 12/);
  });

  test('the build action carries repairs and resupply only when there are any', () => {
    assert.deepEqual(buildAction('ann', []), { type: 'build', player: 'ann', ships: [] });
    assert.deepEqual(buildAction('ann', [], { 'A-W1': { PD: 1 } }, {}).repairs, { 'A-W1': { PD: 1 } });
  });
});

describe('victory points (D-041)', () => {
  test('the status line keeps the running totals, in scenarios that need more than one', () => {
    const s = started('basic');
    assert.match(renderStatus(s), /victory points: ann 0, bob 0 \(2 to win\)/);
    assert.doesNotMatch(renderStatus(started('learning')), /victory points/);
  });

  test('the log notes a point scored at the start of a turn', () => {
    const s = started('basic');
    const before = { ...s, step: 'rearrange', active: 'B', vp: { A: 0, B: 0 } };
    const ships = { 'A-W1': { owner: 'A', WG: true, level: 0, PD: 1, B: 0, S: 0, T: 0, M: 0, SR: 0, built: {}, q: 11, r: 0 } };
    const after = { ...before, ships, step: 'movement', active: 'A', vp: { A: 1, B: 0 }, turn: 2 };
    const texts = logEntries({ ...before, ships }, { type: 'endTurn', player: 'bob' }, after).map((e) => e.text);
    assert.deepEqual(texts, ['bob ends the turn.', 'Game-turn 2 begins.', 'ann occupies Nippur, a base of bob: 1 victory point, 1 of 2 so far.']);
  });

  test('the result names the running total', () => {
    const s = started('basic');
    const over = { ...s, step: 'over', vp: { A: 2, B: 0 }, result: { winner: 'A', player: 'ann', victoryPoints: 2 },
      ships: { 'A-W1': { owner: 'A', q: 11, r: 0 } } };
    assert.equal(resultText(over), 'ann wins with 2 victory points, scored over the turns (D-041): ann occupies Nippur, a base of bob.');
  });
});
