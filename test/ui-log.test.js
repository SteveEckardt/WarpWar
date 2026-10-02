import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, applyAction } from '../src/engine/game.js';
import { logEntries, renderLog } from '../src/ui/log.js';
import { renderGameOver } from '../src/ui/gameover.js';

// Phase 7e: the game log and the end of the game. The log holds only what both players may know (D-039):
// counters, where they go, and each round's public result (§7 step 2). The end screen shows every record.
const mapData = JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8'));
const jump = (to) => ({ type: 'jump', to });
const move = (q, r) => ({ type: 'move', to: { q, r } });

// The scripted Learning game from test/game.test.js, with UI ids. ann (A) wins on game-turn 3.
const WIN = [
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
  { type: 'chooseCombat', player: 'bob', star: 'uruk' },
  { type: 'orders', player: 'ann', orders: { 'A-W1': { tactic: 'attack', D: 0, B: 10, S: 2, T: 0, beamTarget: 'B-W1' } } },
  { type: 'orders', player: 'bob', orders: { 'B-W1': { tactic: 'attack', D: 0, B: 10, S: 0, T: 0, beamTarget: 'A-W1' } } },
  { type: 'allocateHits', player: 'bob', allocations: { 'B-W1': { PD: 4, B: 3, S: 5 } } },
  { type: 'allocateHits', player: 'ann', allocations: { 'A-W1': { S: 9, PD: 1 } } },
  { type: 'orders', player: 'bob', orders: { 'B-W1': { tactic: 'attack', D: 0, B: 6, S: 0, T: 0, beamTarget: 'A-W1' } } },
  { type: 'orders', player: 'ann', orders: { 'A-W1': { tactic: 'attack', D: 0, B: 11, S: 0, T: 0, beamTarget: 'B-W1' } } },
  { type: 'allocateHits', player: 'ann', allocations: { 'A-W1': { S: 2, B: 6 } } },
  { type: 'allocateHits', player: 'bob', allocations: { 'B-W1': { PD: 6, B: 7 } } },
  { type: 'endTurn', player: 'bob' },
  { type: 'move', player: 'ann', ship: 'A-W1', path: [move(-1, 0), move(0, 0), move(1, 0), move(2, 0), jump('umma'), jump('nippur')] },
  { type: 'endMovement', player: 'ann' },
  { type: 'chooseCombat', player: 'ann', star: 'nippur' },
  { type: 'orders', player: 'ann', orders: { 'A-W1': { tactic: 'attack', D: 0, B: 6, S: 0, T: 0, beamTarget: 'B-W2' } } },
  { type: 'orders', player: 'bob', orders: { 'B-W2': { tactic: 'retreat', D: 3, B: 0, S: 0, T: 0 } } },
  { type: 'placeRetreats', player: 'bob', destinations: { 'B-W2': { q: 12, r: 0 } } },
  { type: 'endTurn', player: 'ann' },
  { type: 'endMovement', player: 'bob' },
  { type: 'endTurn', player: 'bob' },
];

// Plays the actions, collecting the log as the UI does: the entries for each accepted action, in order.
function playLogged(actions, state = createGame({ map: mapData, scenario: 'learning', players: ['ann', 'bob'] })) {
  const log = [];
  const perAction = [];
  for (const action of actions) {
    const r = applyAction(state, action);
    assert.equal(r.ok, true, `${action.type} by ${action.player} rejected: ${r.code}: ${r.message}`);
    const entries = logEntries(state, action, r.state);
    perAction.push(entries.map((e) => e.text));
    log.push(...entries);
    state = r.state;
  }
  return { state, log, perAction };
}

const won = () => playLogged(WIN);
const textFor = (perAction, i) => perAction[i].join(' / ');

describe('the log: setup, building and movement', () => {
  test('setup (§4)', () => {
    const { perAction } = won();
    assert.equal(textFor(perAction, 0), 'ann moves first.');
    assert.equal(textFor(perAction, 1), 'bob, moving second, chooses side B (base Nippur). ann has side A (base Ur).');
  });

  test('a build names the counters and where they appear, not the designs or BP (D-039)', () => {
    const { perAction } = won();
    assert.equal(textFor(perAction, 2), 'ann built W1 at Ur.');
    assert.equal(textFor(perAction, 6), 'bob built W1, W2 at Nippur.');
    assert.doesNotMatch(perAction.flat().join(' '), /PD|BP/);
  });

  test('a move gives where the counter started and stopped', () => {
    const { perAction } = won();
    assert.equal(textFor(perAction, 3), "ann's W1 moved from Ur to Uruk.");
    assert.equal(textFor(perAction, 19), "ann's W1 moved from Uruk to Nippur.");
  });

  test('the end of movement names the stars where combat follows', () => {
    const { perAction } = won();
    assert.equal(textFor(perAction, 4), '');
    assert.equal(textFor(perAction, 8), 'Combat follows at Uruk.');
  });
});

describe('the log: combat (§7 step 2)', () => {
  test('nothing while orders and hits are secret; the result once the round is resolved', () => {
    const { perAction } = won();
    assert.equal(textFor(perAction, 9), 'Combat at Uruk begins.');
    for (const i of [10, 11, 12]) assert.equal(textFor(perAction, i), '', `action ${i}`);
    assert.equal(textFor(perAction, 13), "Round 1 at Uruk: ann's W1 took 10 effective hits, bob's W1 took 12.");
  });

  test('a destroyed ship and the end of the combat', () => {
    const { perAction } = won();
    assert.equal(textFor(perAction, 17), "Round 2 at Uruk: ann's W1 took 8 effective hits, bob's W1 took 13. Destroyed: bob's W1. Combat at Uruk is over.");
  });

  test('an escape, and where the escaped ship went', () => {
    const { perAction } = won();
    assert.equal(textFor(perAction, 23), "Round 1 at Nippur: no effective hits. Escaped: bob's W2.");
    assert.equal(textFor(perAction, 24), "bob's W2 retreated to space 12, 0. Combat at Nippur is over.");
  });

  test('never where a player took hits (D-039)', () => {
    const all = won().log.map((e) => e.text).join(' ');
    assert.doesNotMatch(all, /S 9|PD 4|S=|allocat/i);
  });
});

describe('the log: turns and the end of the game', () => {
  test('turns end, and a new game-turn begins when both players have played (D-007)', () => {
    const { perAction } = won();
    assert.equal(textFor(perAction, 5), 'ann ends the turn.');
    assert.equal(textFor(perAction, 18), 'bob ends the turn. / Game-turn 2 begins.');
  });

  test('victory at the start of a turn (§3 event 1, D-010)', () => {
    const { perAction, state } = won();
    assert.equal(state.step, 'over');
    assert.equal(textFor(perAction, 27), 'bob ends the turn. / Game-turn 3 begins. / ann wins: ann occupies Nippur, a base of bob (1 victory point).');
  });

  test('each entry carries its game-turn', () => {
    const { log } = won();
    assert.equal(log[0].turn, 1);
    assert.equal(log[log.length - 1].turn, 3);
  });

  test('a draw (D-009)', () => {
    const s = createGame({ map: mapData, scenario: 'learning', players: ['ann', 'bob'] });
    const before = { ...s, step: 'rearrange', active: 'B', sides: { ann: 'A', bob: 'B' } };
    const after = { ...before, step: 'over', active: 'A', result: { draw: true } };
    assert.deepEqual(logEntries(before, { type: 'endTurn', player: 'bob' }, after).map((e) => e.text),
      ['bob ends the turn.', 'The game is a draw: neither player has an effective ship.']);
  });

  test('the log as HTML: one item per entry, text escaped', () => {
    const html = renderLog([{ turn: 1, text: 'ann <b>moves</b> first.' }, { turn: 2, text: 'x' }]);
    assert.equal((html.match(/<li/g) ?? []).length, 2);
    assert.match(html, /ann &lt;b&gt;moves&lt;\/b&gt; first\./);
    assert.match(renderLog([]), /Nothing has happened yet/);
  });
});

describe('the end of the game', () => {
  test('the winner, why, every record of both sides (D-039), the log, and a new game', () => {
    const { state, log } = won();
    const html = renderGameOver(state, log);
    assert.match(html, /ann wins/);
    assert.match(html, /Nippur/);
    assert.match(html, /1 victory point/);
    assert.match(html, /Side A · ann/);
    assert.match(html, /Side B · bob/);
    assert.match(html, /<td>3<\/td><td>2<\/td>/, "bob's W2 record: PD 3, B 2");
    assert.doesNotMatch(html, /Record hidden/);
    assert.match(html, /Game-turn 3 begins/);
    assert.match(html, /data-action="new-game"/);
  });

  test('a draw', () => {
    const { state, log } = won();
    const drawn = { ...state, result: { draw: true } };
    assert.match(renderGameOver(drawn, log), /A draw/);
    assert.match(renderGameOver(drawn, log), /effective ship/);
  });
});
