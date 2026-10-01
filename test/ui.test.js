import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/engine/game.js';
import { SIZE, centre, shipsAt, renderMap } from '../src/ui/hexmap.js';
import { renderStarPanel, renderStatus } from '../src/ui/panel.js';
import { sampleGame } from '../src/ui/sample.js';

// Phase 7a: the UI's pure parts. The map, the ship markers and the star panel are built as strings.
const mapData = JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8'));
const newGame = () => createGame({ map: mapData, scenario: 'learning', players: ['ann', 'bob'] });

const ship = (owner, q, r, stats, extra = {}) => ({
  WG: true, level: 0, PD: 0, B: 0, S: 0, T: 0, M: 0, SR: 0, ...stats,
  built: { PD: 0, B: 0, S: 0, T: 0, M: 0, SR: 0, ...stats }, owner, q, r, ...extra,
});

// A hand-made state: two A ships at Ur, one damaged B ship at Uruk.
function placed() {
  const s = newGame();
  s.sides = { ann: 'A', bob: 'B' };
  s.ships = {
    A2: ship('A', -11, 0, { PD: 4, B: 2 }),
    A1: ship('A', -11, 0, { PD: 8, B: 6 }),
    B1: { ...ship('B', -2, 0, { PD: 10, B: 10, S: 5 }), PD: 6, S: 0 },
  };
  return s;
}

const count = (text, re) => (text.match(re) ?? []).length;

describe('hex geometry (same layout as tools/render-map.js)', () => {
  test('pointy-top axial: x = size * sqrt3 * (q + r/2), y = size * 1.5 * r', () => {
    assert.deepEqual(centre({ q: 0, r: 0 }), { x: 0, y: 0 });
    assert.deepEqual(centre({ q: 1, r: 0 }), { x: SIZE * Math.sqrt(3), y: 0 });
    assert.deepEqual(centre({ q: 0, r: 2 }), { x: SIZE * Math.sqrt(3), y: SIZE * 3 });
  });
});

describe('shipsAt', () => {
  test('lists the ships in a hex, side A first, then by id', () => {
    const s = placed();
    assert.deepEqual(shipsAt(s, { q: -11, r: 0 }).map(([id]) => id), ['A1', 'A2']);
    assert.deepEqual(shipsAt(s, { q: -2, r: 0 }).map(([id]) => id), ['B1']);
    assert.deepEqual(shipsAt(s, { q: 0, r: 0 }), []);
  });
});

describe('renderMap', () => {
  test('draws every star as a clickable group and every warpline', () => {
    const svg = renderMap(newGame());
    assert.equal(count(svg, /data-star="/g), mapData.stars.length);
    assert.equal(count(svg, /<line /g), mapData.warplines.length);
    assert.match(svg, /^<svg /);
  });

  test('Learning: only Ur and Nippur are drawn as bases (§4.1)', () => {
    const svg = renderMap(newGame());
    assert.equal(count(svg, /class="base-ring"/g), 2);
  });

  test("one marker per side per hex, in that side's colour, with the ship count", () => {
    const s = placed();
    s.ships.B2 = ship('B', -11, 0, { PD: 1, B: 1 });
    const svg = renderMap(s);
    assert.equal(count(svg, /class="ships"/g), 3);
    assert.match(svg, /<g class="ships" data-side="A" data-hex="-11,0">.*?fill="#2b6cb0".*?>2<\/text>/s);
    assert.match(svg, /<g class="ships" data-side="B" data-hex="-11,0">.*?fill="#c53030".*?>1<\/text>/s);
    assert.match(svg, /<g class="ships" data-side="B" data-hex="-2,0">.*?>1<\/text>/s);
  });

  test('a carried Systemship is not a separate marker', () => {
    const s = placed();
    s.ships.A1.carrying = { S1: { WG: false, level: 0, PD: 1, B: 1, S: 0, T: 0, M: 0, SR: 0 } };
    assert.match(renderMap(s), /data-hex="-11,0">.*?>2<\/text>/s);
  });

  test('marks the selected star', () => {
    const svg = renderMap(newGame(), { selected: 'uruk' });
    assert.equal(count(svg, /class="star selected"/g), 1);
    assert.match(svg, /class="star selected" data-star="uruk"/);
  });

  test('escapes star names', () => {
    const s = newGame();
    s.map.stars[0].name = 'A<b>&"';
    assert.match(renderMap(s), /A&lt;b&gt;&amp;&quot;/);
  });
});

describe('renderStarPanel', () => {
  test('names the star, its hex and its base owner', () => {
    const html = renderStarPanel(placed(), 'ur');
    assert.match(html, /<h2>Ur<\/h2>/);
    assert.match(html, /-11, 0/);
    assert.match(html, /Base star of side A/);
  });

  test('lists each side with its player and each ship with its record', () => {
    const html = renderStarPanel(placed(), 'ur');
    assert.match(html, /Side A · ann/);
    assert.doesNotMatch(html, /Side B/);
    assert.ok(html.indexOf('>A1<') < html.indexOf('>A2<'), 'ships in id order');
    assert.match(html, /Warpship/);
  });

  test('a damaged attribute shows current and built strength', () => {
    const html = renderStarPanel(placed(), 'uruk');
    assert.match(html, /<td[^>]*>6<span class="built">\/10<\/span><\/td>/);
    assert.match(html, /<td[^>]*>10<\/td>/);
  });

  test('carried Systemships are listed under their carrier', () => {
    const s = placed();
    s.ships.A1.carrying = { S1: { WG: false, level: 0, PD: 1, B: 1, S: 0, T: 0, M: 0, SR: 0, built: { PD: 1, B: 1, S: 0, T: 0, M: 0, SR: 0 } } };
    const html = renderStarPanel(s, 'ur');
    assert.match(html, /carried by A1/);
    assert.match(html, /Systemship/);
  });

  test('a star with no ships says so', () => {
    assert.match(renderStarPanel(placed(), 'girsu'), /No ships here/);
  });

  test('before sides are chosen, a side has no player name', () => {
    const s = newGame();
    s.ships = { A1: ship('A', -11, 0, { PD: 1 }) };
    assert.match(renderStarPanel(s, 'ur'), /Side A</);
  });
});

describe('renderStatus', () => {
  test('shows the game-turn, the player to act and the step', () => {
    const html = renderStatus(sampleGame(mapData));
    assert.match(html, /Game-turn 1/);
    assert.match(html, /bob \(B\)/);
    assert.match(html, /combat/);
  });

  test('a finished game shows the result', () => {
    const s = newGame();
    s.step = 'over';
    s.result = { winner: 'A', player: 'ann', victoryPoints: 1 };
    assert.match(renderStatus(s), /ann \(A\) wins/);
  });
});

describe('sampleGame', () => {
  test('is a Learning game built through applyAction, stopped at a contested Uruk', () => {
    const s = sampleGame(mapData);
    assert.equal(s.scenario, 'learning');
    assert.equal(s.step, 'combat');
    assert.deepEqual(s.contested, ['uruk']);
    const where = Object.fromEntries(Object.entries(s.ships).map(([id, sh]) => [id, `${sh.owner}@${sh.q},${sh.r}`]));
    assert.deepEqual(where, { A1: 'A@-2,0', A2: 'A@-7,0', B1: 'B@-2,0', B2: 'B@7,0' });
  });
});
