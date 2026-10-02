import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, applyAction } from '../src/engine/game.js';
import { displayId, actor, seesRecords } from '../src/ui/view.js';
import { buildOptions, nextShipId, draftTotal, buildAction, renderBuilder, renderDesignSummary } from '../src/ui/builder.js';
import { renderNewGame, renderChooseSide } from '../src/ui/setup.js';

// Phase 7b: setup and the ship builder. Costs from §5.1, Learning limits from §4.1, record secrecy from D-039.
const mapData = JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8'));
const newGame = () => createGame({ map: mapData, scenario: 'learning', players: ['ann', 'bob'] });

function play(state, ...actions) {
  for (const action of actions) {
    const r = applyAction(state, action);
    assert.equal(r.ok, true, `${action.type} rejected: ${r.code}: ${r.message}`);
    state = r.state;
  }
  return state;
}

// ann moves first; bob picks B, so ann is A and builds first.
const atBuild = () => play(newGame(), { type: 'setFirstPlayer', player: 'ann' }, { type: 'chooseSide', player: 'bob', side: 'B' });

// §5.1 examples: W2 costs 17 BP (PD 5, B 3, S 2, T 1, M 3 + WG). The W7 freighter has SR 2, so not Learning.
const W2 = { WG: true, PD: 5, B: 3, S: 2, T: 1, M: 3 };

describe('view: whose screen it is (D-039)', () => {
  test('display ids drop the side prefix', () => {
    assert.equal(displayId('A-W1'), 'W1');
    assert.equal(displayId('B-S07'), 'S07');
    assert.equal(displayId('A1'), 'A1');
  });

  test('setup is public; build is for the active player', () => {
    let s = newGame();
    assert.equal(actor(s), null);
    s = play(s, { type: 'setFirstPlayer', player: 'ann' });
    assert.equal(actor(s), null, 'the side choice is made openly');
    s = play(s, { type: 'chooseSide', player: 'bob', side: 'B' });
    assert.equal(actor(s), 'ann');
  });

  test('a player sees only their own side, until the game is over', () => {
    const s = atBuild();
    assert.equal(seesRecords(s, 'ann', 'A'), true);
    assert.equal(seesRecords(s, 'ann', 'B'), false);
    assert.equal(seesRecords(s, null, 'A'), false);
    s.step = 'over';
    assert.equal(seesRecords(s, null, 'B'), true);
  });
});

describe('builder logic', () => {
  test('Learning allows neither Systemships nor Systemship Racks (§4.1)', () => {
    assert.deepEqual(buildOptions('learning'), { systemships: false, racks: false, armor: false });
    assert.deepEqual(buildOptions('advanced'), { systemships: true, racks: true, armor: false });
  });

  test('ids follow the counters: W1, W2 per side; lowest free number', () => {
    const s = atBuild();
    assert.equal(nextShipId(s, 'A', [], true), 'A-W1');
    assert.equal(nextShipId(s, 'A', [{ id: 'A-W1' }, { id: 'A-W3' }], true), 'A-W2');
    s.ships['B-W1'] = { owner: 'B' };
    assert.equal(nextShipId(s, 'B', [], true), 'B-W2');
    s.ships['A-W1'] = { owner: 'A', carrying: { 'A-S01': {} } };
    assert.equal(nextShipId(s, 'A', [], false), 'A-S02', 'Systemships are S and two digits; carried ones count');
  });

  test('draft total uses §5.1 costs, Missiles at 3 per BP', () => {
    assert.equal(draftTotal([{ design: W2 }]), 17);
    assert.equal(draftTotal([{ design: W2 }, { design: { WG: true, PD: 1, M: 4 } }]), 17 + 5 + 1 + 2);
  });

  test('the build action the engine accepts', () => {
    const drafts = [
      { id: 'A-W1', design: { WG: true, PD: 8, B: 6, S: 4 }, at: 'ur' },
      { id: 'A-W2', design: W2, at: 'ur' },
    ];
    assert.equal(draftTotal(drafts), 40);
    const s = play(atBuild(), buildAction('ann', drafts));
    assert.deepEqual(Object.keys(s.ships).sort(), ['A-W1', 'A-W2']);
    assert.equal(s.step, 'movement');
  });
});

describe('renderBuilder', () => {
  const ui = (extra = {}) => ({ design: { WG: true, PD: 0, B: 0, S: 0, T: 0, M: 0, SR: 0 }, drafts: [], error: null, ...extra });

  test('shows the BP to spend and the inputs Learning allows', () => {
    const html = renderBuilder(atBuild(), 'ann', ui());
    assert.match(html, /40 BP/);
    for (const a of ['PD', 'B', 'S', 'T', 'M']) assert.match(html, new RegExp(`name="${a}"`));
    assert.doesNotMatch(html, /name="SR"/);
    assert.doesNotMatch(html, /name="WG"/);
  });

  test('lists drafted ships by counter name with their cost and what is left', () => {
    const html = renderBuilder(atBuild(), 'ann', ui({ drafts: [{ id: 'A-W1', design: W2, at: 'ur' }] }));
    assert.match(html, />W1</);
    assert.match(html, /17 BP/);
    assert.match(html, /23 BP left/);
    assert.match(html, /data-action="remove" data-id="A-W1"/);
  });

  test('shows an engine rejection', () => {
    assert.match(renderBuilder(atBuild(), 'ann', ui({ error: 'All 40 BP must be spent' })), /All 40 BP must be spent/);
  });

  test('design summary: cost, and the engine\'s validation errors', () => {
    const s = atBuild();
    assert.match(renderDesignSummary(s, 'A', W2, []), /17 BP/);
    const empty = renderDesignSummary(s, 'A', { WG: true }, []);
    assert.match(empty, /at least one attribute/);
    assert.match(empty, /data-action="add"[^>]*disabled/);
  });

  test('a design that costs more than is left cannot be added', () => {
    const big = { WG: true, PD: 36 };
    assert.match(renderDesignSummary(atBuild(), 'A', big, []), /data-action="add"[^>]*disabled/);
    assert.match(renderDesignSummary(atBuild(), 'A', big, []), /more than the 40 BP left/);
  });
});

describe('setup screens (§4)', () => {
  test('new game: two names and who moves first', () => {
    const html = renderNewGame({});
    assert.match(html, /name="player1"/);
    assert.match(html, /name="player2"/);
    assert.match(html, /name="first"/);
  });

  test('the player moving second chooses the side', () => {
    const s = play(newGame(), { type: 'setFirstPlayer', player: 'ann' });
    const html = renderChooseSide(s);
    assert.match(html, /bob/);
    assert.match(html, /data-action="side" data-side="A"/);
    assert.match(html, /data-action="side" data-side="B"/);
    assert.match(html, /Ur/);
    assert.match(html, /Nippur/);
  });
});
