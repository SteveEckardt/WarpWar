import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, applyAction } from '../src/engine/game.js';
import { movers, planInfo, renderMovement } from '../src/ui/movement.js';
import { renderMap } from '../src/ui/hexmap.js';
import { renderHexPanel } from '../src/ui/panel.js';

// Phase 7c: planning a move one step at a time (§6, §6.1, §6.2, D-008, D-040). The engine judges every step.
const mapData = JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8'));
const jump = (to) => ({ type: 'jump', to });
const move = (q, r) => ({ type: 'move', to: { q, r } });

function play(state, ...actions) {
  for (const action of actions) {
    const r = applyAction(state, action);
    assert.equal(r.ok, true, `${action.type} rejected: ${r.code}: ${r.message}`);
    state = r.state;
  }
  return state;
}

// ann (A) builds W1 (PD 8, 23 BP) and W2 (PD 2, 17 BP) at Ur and is at movement on game-turn 1.
const annMoving = () =>
  play(
    createGame({ map: mapData, scenario: 'learning', players: ['ann', 'bob'] }),
    { type: 'setFirstPlayer', player: 'ann' },
    { type: 'chooseSide', player: 'bob', side: 'B' },
    {
      type: 'build', player: 'ann', ships: [
        { id: 'A-W1', design: { WG: true, PD: 8, B: 6, S: 4 }, at: 'ur' },
        { id: 'A-W2', design: { WG: true, PD: 2, B: 5, S: 5 }, at: 'ur' },
      ],
    },
  );

const hexes = (targets) => targets.map((t) => `${t.to.q},${t.to.r}`).sort();

describe('movers', () => {
  test("the player's Warpships, and which have moved", () => {
    const s = play(annMoving(), { type: 'move', player: 'ann', ship: 'A-W2', path: [jump('isin')] });
    assert.deepEqual(movers(s, 'A').map(({ id, moved }) => [id, moved]), [['A-W1', false], ['A-W2', true]]);
    assert.deepEqual(movers(s, 'B'), []);
  });
});

describe('planInfo', () => {
  test('from Ur: the six neighbouring hexes and the three warplines (§6.2)', () => {
    const p = planInfo(annMoving(), 'A-W1', []);
    assert.equal(p.cost, 0);
    assert.equal(p.mp, 8);
    assert.deepEqual(p.path, [{ q: -11, r: 0 }]);
    assert.equal(p.targets.filter((t) => t.step.type === 'move').length, 6);
    assert.deepEqual(p.targets.filter((t) => t.step.type === 'jump').map((t) => t.step.to).sort(), ['eridu', 'isin', 'larsa']);
    assert.equal(p.blocked, null);
  });

  test('the path so far: hexes visited and MP used', () => {
    const p = planInfo(annMoving(), 'A-W1', [jump('isin'), jump('uruk'), move(-1, 0)]);
    assert.deepEqual(p.path, [{ q: -11, r: 0 }, { q: -7, r: 0 }, { q: -2, r: 0 }, { q: -1, r: 0 }]);
    assert.equal(p.cost, 3);
    assert.deepEqual(p.end, { q: -1, r: 0 });
  });

  test('no step past the last MP: the engine says why', () => {
    const p = planInfo(annMoving(), 'A-W2', [jump('isin'), jump('uruk')]);
    assert.deepEqual(p.targets, []);
    assert.match(p.blocked, /All 2 MP used/);
  });

  test('the map edge (D-040): no target off the map', () => {
    const s = annMoving();
    s.ships['A-W1'] = { ...s.ships['A-W1'], q: -13, r: 0 }; // column -13, on the west edge
    assert.deepEqual(hexes(planInfo(s, 'A-W1', []).targets), ['-12,-1', '-12,0', '-13,1']);
  });

  test('must stop on a star with an enemy ship (§6.1 rule 1)', () => {
    let s = play(annMoving(), { type: 'move', player: 'ann', ship: 'A-W1', path: [jump('isin'), jump('uruk')] }, { type: 'endMovement', player: 'ann' }, { type: 'endTurn', player: 'ann' });
    s = play(s, { type: 'build', player: 'bob', ships: [{ id: 'B-W1', design: { WG: true, PD: 10, B: 10, S: 15 }, at: 'nippur' }] });
    const p = planInfo(s, 'B-W1', [jump('umma'), jump('girsu'), move(1, 0), move(0, 0), move(-1, 0), move(-2, 0)]);
    assert.deepEqual(p.targets, []);
    assert.match(p.blocked, /must stop/i);
  });

  test('no enemy base on game-turn 1 (D-008)', () => {
    let s = play(annMoving(), { type: 'endMovement', player: 'ann' }, { type: 'endTurn', player: 'ann' });
    s = play(s, { type: 'build', player: 'bob', ships: [{ id: 'B-W1', design: { WG: true, PD: 30, B: 5 }, at: 'nippur' }] });
    const near = planInfo(s, 'B-W1', [jump('umma'), jump('girsu'), jump('shuruppak')]);
    assert.ok(near.targets.length > 0);
    s.ships['B-W1'] = { ...s.ships['B-W1'], q: -10, r: 0 }; // next to Ur
    assert.ok(!hexes(planInfo(s, 'B-W1', []).targets).includes('-11,0'));
  });
});

describe('renderMovement', () => {
  const ui = (plan = null, error = null) => ({ plan, error });

  test('lists Warpships with their MP; a moved ship has no Move button', () => {
    const s = play(annMoving(), { type: 'move', player: 'ann', ship: 'A-W2', path: [jump('isin')] });
    const html = renderMovement(s, 'ann', ui());
    assert.match(html, /data-action="plan" data-id="A-W1"/);
    assert.doesNotMatch(html, /data-action="plan" data-id="A-W2"/);
    assert.match(html, />W2</);
    assert.match(html, /Isin/);
    assert.match(html, /data-action="end-movement"/);
  });

  test('while planning: MP used of PD, the steps, Undo, Cancel, Confirm', () => {
    const s = annMoving();
    const empty = renderMovement(s, 'ann', ui({ ship: 'A-W1', steps: [] }));
    assert.match(empty, /0 of 8 MP/);
    assert.match(empty, /data-action="confirm-move"[^>]*disabled/);
    const two = renderMovement(s, 'ann', ui({ ship: 'A-W1', steps: [jump('isin'), move(-6, 0)] }));
    assert.match(two, /2 of 8 MP/);
    assert.match(two, /Isin/);
    assert.match(two, /data-action="undo-step"/);
    assert.match(two, /data-action="cancel-plan"/);
    assert.doesNotMatch(two, /data-action="confirm-move"[^>]*disabled/);
    assert.doesNotMatch(two, /data-action="end-movement"/, 'finish or cancel the plan first');
  });

  test('shows an engine rejection', () => {
    assert.match(renderMovement(annMoving(), 'ann', ui(null, 'Nope (§6)')), /Nope \(§6\)/);
  });
});

describe('the map while planning', () => {
  test('draws the path and one clickable target per legal next step', () => {
    const s = annMoving();
    const p = planInfo(s, 'A-W1', [jump('isin')]);
    const svg = renderMap(s, { plan: p });
    assert.match(svg, /<polyline class="plan-path"/);
    assert.equal((svg.match(/data-target="/g) ?? []).length, p.targets.length);
  });

  test('every hex on the map is clickable, and only those (D-040)', () => {
    const svg = renderMap(annMoving());
    const all = [...svg.matchAll(/data-hex="(-?\d+),(-?\d+)"/g)].filter((m) => !/class="ships"/.test(m.input.slice(m.index - 40, m.index)));
    assert.ok(all.length > 0);
    for (const [, q, r] of all) {
      const x = Number(q) + Number(r) / 2;
      assert.ok(Math.abs(x) <= 13 && Math.abs(Number(r)) <= 8, `${q},${r} is off the map`);
    }
  });
});

describe('renderHexPanel', () => {
  test('a space hex: its position and the ships there', () => {
    const s = play(annMoving(), { type: 'move', player: 'ann', ship: 'A-W1', path: [move(-10, 0)] });
    const html = renderHexPanel(s, { q: -10, r: 0 }, { viewer: 'ann' });
    assert.match(html, /Space hex/);
    assert.match(html, /-10, 0/);
    assert.match(html, />W1</);
  });

  test('a star hex is the star panel', () => {
    assert.match(renderHexPanel(annMoving(), { q: -11, r: 0 }, { viewer: 'ann' }), /<h2>Ur<\/h2>/);
  });
});
