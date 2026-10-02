import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, applyAction } from '../src/engine/game.js';
import { renderNewGame } from '../src/ui/setup.js';
import { EMPTY_DESIGN, buildOptions, buildCheck, renderBuilder, renderDesignSummary } from '../src/ui/builder.js';
import { renderHexPanel, renderStatus } from '../src/ui/panel.js';
import { renderHits, pendingReport } from '../src/ui/combat.js';

// Phase 8b: the Armor module in the UI (fan §10.2.2, D-042 to D-047). Off by default; chosen with the game.
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

const started = (scenario, modules = ['armor']) =>
  play(
    createGame({ map: mapData, scenario, players: ['ann', 'bob'], modules }),
    { type: 'setFirstPlayer', player: 'ann' },
    { type: 'chooseSide', player: 'bob', side: 'B' },
  );
const ui = (extra = {}) => ({ design: { ...EMPTY_DESIGN }, drafts: [], error: null, repairs: {}, resupply: {}, ...extra });

describe('choosing Armor for a game (D-045)', () => {
  test('the new-game form offers it, off by default', () => {
    const html = renderNewGame({});
    assert.match(html, /<input type="checkbox" name="module" value="armor">/);
    assert.match(renderNewGame({ modules: ['armor'] }), /value="armor" checked/);
  });

  test('the status line says which fan rules are on', () => {
    assert.match(renderStatus(started('learning')), /fan rules: Armor/);
    assert.doesNotMatch(renderStatus(started('learning', [])), /fan rules/);
  });
});

describe('the builder with Armor (D-043, D-047)', () => {
  test('an Armor field, priced at 2 + tech level points per BP; none without the module', () => {
    assert.equal(buildOptions('learning', ['armor']).armor, true);
    assert.equal(buildOptions('learning', []).armor, false);
    const html = renderBuilder(started('learning'), 'ann', ui());
    assert.match(html, /name="A"/);
    assert.match(html, /Armor, 2 points per BP/);
    assert.doesNotMatch(renderBuilder(started('learning', []), 'ann', ui()), /name="A"/);
  });

  test('a design with Armor: cost rounded up; Armor alone is a ship', () => {
    const s = started('learning');
    assert.match(renderDesignSummary(s, 'A', { ...EMPTY_DESIGN, PD: 1, A: 3 }, []), /This ship: <strong>8 BP/);
    assert.doesNotMatch(renderDesignSummary(s, 'A', { ...EMPTY_DESIGN, A: 2 }, []), /at least one attribute/);
  });

  test('the engine accepts what the builder adds up', () => {
    const s = started('learning');
    const drafts = [{ id: 'A-W1', design: { ...EMPTY_DESIGN, PD: 12, B: 12, S: 9, A: 4 }, at: 'ur' }];
    const check = buildCheck(s, 'ann', ui({ drafts }));
    assert.equal(check.total, 40);
    assert.equal(check.message, null);
  });
});

describe('records and repair (fan §7.5, D-044)', () => {
  // Advanced with Armor: ann's W1 (PD 5, A 4) and W2 (PD 1, A 2), damaged to A 2 and A 1 by the game-turn 2 Build event.
  const damaged = () => {
    let s = play(
      started('advanced'),
      { type: 'build', player: 'ann', ships: [{ id: 'A-W1', design: { WG: true, PD: 5, A: 4 }, at: 'ur' }, { id: 'A-W2', design: { WG: true, PD: 1, A: 2 }, at: 'ur' }] },
      { type: 'endMovement', player: 'ann' }, { type: 'endTurn', player: 'ann' },
      { type: 'build', player: 'bob', ships: [] }, { type: 'endMovement', player: 'bob' }, { type: 'endTurn', player: 'bob' },
    );
    s = structuredClone(s);
    s.ships['A-W1'].A = 2;
    s.ships['A-W2'].A = 1;
    return s;
  };

  test('the panel shows Armor, current and built, to the owner', () => {
    const html = renderHexPanel(damaged(), { q: -11, r: 0 }, { viewer: 'ann' });
    assert.match(html, /<th>A<\/th>/);
    assert.match(html, /2<span class="built">\/4<\/span>/);
  });

  test('Armor repair fields, and the pooled cost: 1 BP mends a point on each of two ships', () => {
    const s = damaged();
    const html = renderBuilder(s, 'ann', ui());
    assert.match(html, /<fieldset class="repair" data-ship="A-W1">.*A 2\/4/s);
    const check = buildCheck(s, 'ann', ui({ repairs: { 'A-W1': { A: 1 }, 'A-W2': { A: 1 } } }));
    assert.equal(check.repairs, 1);
    assert.equal(check.message, null);
  });
});

describe('Armor in combat (D-042, D-039)', () => {
  // Learning with Armor. ann's W1 (PD 12, B 12, S 9, A 4) at Uruk; bob's W1 (PD 12, B 10, S 13) stops on it.
  // Round 1: both Attack at Drive 0, Hit +2. ann's W1: 12 hits, Screen 2, 10 effective; Armor takes 4; 6 to place.
  const atHits = () =>
    play(
      started('learning'),
      { type: 'build', player: 'ann', ships: [{ id: 'A-W1', design: { WG: true, PD: 12, B: 12, S: 9, A: 4 }, at: 'ur' }] },
      { type: 'move', player: 'ann', ship: 'A-W1', path: [jump('isin'), jump('uruk')] },
      { type: 'endMovement', player: 'ann' }, { type: 'endTurn', player: 'ann' },
      { type: 'build', player: 'bob', ships: [{ id: 'B-W1', design: { WG: true, PD: 12, B: 10, S: 13 }, at: 'nippur' }] },
      { type: 'move', player: 'bob', ship: 'B-W1', path: [jump('umma'), jump('girsu'), move(1, 0), move(0, 0), move(-1, 0), move(-2, 0)] },
      { type: 'endMovement', player: 'bob' },
      { type: 'chooseCombat', player: 'bob', star: 'uruk' },
      { type: 'orders', player: 'bob', orders: { 'B-W1': { tactic: 'attack', D: 0, B: 10, S: 0, T: 0, beamTarget: 'A-W1' } } },
      { type: 'orders', player: 'ann', orders: { 'A-W1': { tactic: 'attack', D: 0, B: 5, S: 2, T: 0, beamTarget: 'B-W1' } } },
    );

  test("the owner's hits screen shows Armor's share, then the hits left to place", () => {
    const html = renderHits(atHits(), 'ann', {});
    assert.match(html, /Armor takes <strong>4<\/strong>/);
    assert.match(html, /W1<\/strong> must take <strong>6 hits/);
    assert.doesNotMatch(html, /name="A"/, 'Armor is not placed by hand (D-042)');
  });

  test('the public report gives effective hits only; Armor is on the private record (D-039)', () => {
    const r = pendingReport(atHits(), new Set());
    assert.match(r.html, /ann's W1<\/b>: 12 hits, 2 absorbed by Screens, <strong>10 effective/);
    assert.doesNotMatch(r.html, /Armor/);
  });
});
