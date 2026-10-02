import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyAction, createGame } from '../src/engine/game.js';
import { viewFor } from '../src/engine/view.js';
import { createRemoteController } from '../src/play/remote.js';
import { createController } from '../src/play/controllers.js';
import { createComputerController } from '../src/play/computer.js';
import { createRoom } from '../src/play/room.js';

// Phase 9c-1: remote players. The server holds the game; a remote player's browser is sent its own view and the
// decisions asked of it as messages, and answers with actions. No I/O here: `send` stands in for the socket.
const map = JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8'));
const tick = () => new Promise((done) => setImmediate(done));
const settle = async () => {
  for (let i = 0; i < 10; i += 1) await tick();
};

describe('the remote controller', () => {
  const view = { step: 'build' };

  test('asks with a decide message, and takes the action that answers it', async () => {
    const sent = [];
    const c = createRemoteController();
    c.attach((m) => sent.push(m));
    const asked = c.nextAction(view, { side: 'A', player: 'ann', rejection: null });
    assert.deepEqual(sent, [{ type: 'decide', id: 1, view, side: 'A', player: 'ann', rejection: null }]);
    c.receive({ type: 'action', id: 1, action: { type: 'endTurn', player: 'ann' } });
    assert.deepEqual(await asked, { type: 'endTurn', player: 'ann' });
    c.outcome({ ok: false, code: 'OUT_OF_ORDER', message: 'no' });
    assert.deepEqual(sent.at(-1), { type: 'outcome', id: 1, ok: false, code: 'OUT_OF_ORDER', message: 'no' });
    assert.equal(createController('remote').kind, 'remote');
  });

  test('an answer to anything but the waiting decision is refused, and the decision still waits', async () => {
    const sent = [];
    const c = createRemoteController();
    c.attach((m) => sent.push(m));
    c.receive({ type: 'action', id: 1, action: {} });
    assert.equal(sent.at(-1).code, 'NOT_ASKED');
    let answered = false;
    c.nextAction(view, { side: 'A', player: 'ann', rejection: null }).then(() => { answered = true; });
    c.receive({ type: 'action', id: 7, action: {} });
    c.receive({ type: 'hello' });
    await settle();
    assert.equal(answered, false);
    assert.deepEqual(sent.slice(-2).map((m) => m.code), ['NOT_ASKED', 'BAD_MESSAGE']);
  });

  test('not yet connected: once it is, the latest view and the waiting decision are sent', () => {
    const sent = [];
    const c = createRemoteController();
    c.show({ step: 'setup' });
    c.nextAction(view, { side: 'B', player: 'bob', rejection: null });
    c.attach((m) => sent.push(m));
    assert.deepEqual(sent.map((m) => m.type), ['view', 'decide']);
    assert.deepEqual(sent[0].view, { step: 'setup' });
  });
});

// A client that answers every decision with the computer's choice: how a test plays as a remote browser.
function bot(strategy, seed) {
  const computer = createComputerController({ seed, strategy });
  const got = [];
  let reply = () => {};
  return {
    got,
    connect(answer) {
      reply = answer;
    },
    send(message) {
      got.push(message);
      if (message.type === 'decide') {
        const action = computer.nextAction(message.view, { side: message.side, player: message.player, rejection: message.rejection });
        queueMicrotask(() => reply({ type: 'action', id: message.id, action }));
      }
    },
  };
}

const settings = (seats, extra = {}) => ({ map, scenario: 'learning', players: ['ann', 'bob'], first: 'ann', seats, seed: 5, ...extra });

describe('a room: one game on the server', () => {
  test('settings are checked when it is made', () => {
    assert.throws(() => createRoom(settings({ ann: 'remote', bob: 'genius' })), RangeError);
    assert.throws(() => createRoom(settings({ ann: 'plan', bob: 'random' })), /remote/);
    assert.throws(() => createRoom(settings({ ann: 'remote', bob: 'remote' }, { scenario: 'chess' })), RangeError);
    assert.throws(() => createRoom(settings({ ann: 'remote', bob: 'remote' }, { first: 'cat' })), RangeError);
  });

  test('joining: remote seats only, one connection each; the game starts once every remote seat is taken', () => {
    const room = createRoom(settings({ ann: 'remote', bob: 'remote' }));
    const ann = [];
    assert.equal(room.join('cat', () => {}).code, 'UNKNOWN_PLAYER');
    assert.deepEqual(room.join('ann', (m) => ann.push(m)), { ok: true });
    assert.equal(room.join('ann', () => {}).code, 'SEAT_TAKEN');
    assert.deepEqual(ann[0], { type: 'joined', player: 'ann', settings: { scenario: 'learning', modules: [], players: ['ann', 'bob'], first: 'ann', seats: { ann: 'remote', bob: 'remote' } } });
    assert.equal(room.started, false);
    room.join('bob', () => {});
    assert.equal(room.started, true);
    assert.deepEqual(ann.at(-1), { type: 'view', view: viewFor(room.state, null) });
    const withComputer = createRoom(settings({ ann: 'remote', bob: 'plan' }));
    assert.equal(withComputer.join('bob', () => {}).code, 'NOT_REMOTE');
  });

  test('two remote players play through messages; the second chooses the side (§4)', async () => {
    const room = createRoom(settings({ ann: 'remote', bob: 'remote' }));
    const ann = bot('plan', 1);
    const bob = bot('random', 2);
    room.join('ann', (m) => ann.send(m));
    room.join('bob', (m) => bob.send(m));
    ann.connect((m) => room.receive('ann', m));
    bob.connect((m) => room.receive('bob', m));
    const final = await room.done;
    assert.equal(final.step, 'over');
    assert.equal(bob.got.find((m) => m.type === 'decide').view.step, 'setup', "bob's first decision is the side");
    for (const who of [ann, bob]) {
      assert.ok(who.got.every((m) => m.type !== 'outcome' || m.ok), 'no action refused');
      assert.deepEqual(who.got.filter((m) => m.type === 'view').at(-1), { type: 'view', view: final });
    }
  });

  test("a remote player is only ever sent its own view: never the other side's records (D-039)", async () => {
    const room = createRoom(settings({ ann: 'remote', bob: 'plan' }));
    const ann = bot('plan', 3);
    room.join('ann', (m) => ann.send(m));
    ann.connect((m) => room.receive('ann', m));
    const final = await room.done;
    let checked = 0;
    for (const m of ann.got) {
      const view = m.view;
      if (!view || view.step === 'over') continue;
      const side = view.sides?.ann ?? null;
      for (const sh of Object.values(view.ships)) if (sh.owner !== side) assert.equal(sh.PD, undefined);
      if (side) assert.equal(view.bp[side === 'A' ? 'B' : 'A'], null);
      checked += 1;
    }
    assert.ok(checked > 3);
    assert.equal(final.step, 'over');
  });

  test('a refused action: the outcome says why, and the same decision is asked again with the rejection', async () => {
    const room = createRoom(settings({ ann: 'remote', bob: 'remote' }));
    const sent = [];
    room.join('ann', () => {});
    room.join('bob', (m) => sent.push(m));
    const decide = sent.find((m) => m.type === 'decide');
    room.receive('bob', { type: 'action', id: decide.id, action: { type: 'chooseSide', player: 'bob', side: 'Z' } });
    await settle();
    const [outcome, again] = sent.slice(-2);
    assert.deepEqual([outcome.type, outcome.ok, outcome.code], ['outcome', false, 'BAD_SIDE']);
    assert.equal(again.type, 'decide');
    assert.equal(again.rejection.code, 'BAD_SIDE');
    room.receive('bob', { type: 'action', id: again.id, action: { type: 'chooseSide', player: 'ann', side: 'A' } });
    await settle();
    assert.equal(sent.at(-2).code, 'NOT_YOUR_SIDE', 'a player acts for itself only');
  });

  test("a computer seat plays on the server, from its view, with the room's seed", async () => {
    const a = createRoom(settings({ ann: 'plan', bob: 'remote' }));
    const b = createRoom(settings({ ann: 'plan', bob: 'remote' }));
    const games = [];
    for (const room of [a, b]) {
      const bob = bot('random', 9);
      room.join('bob', (m) => bob.send(m));
      bob.connect((m) => room.receive('bob', m));
      games.push(await room.done);
    }
    assert.deepEqual(games[0], games[1], 'the same seed, the same game');
    const start = applyAction(createGame({ map, scenario: 'learning', players: ['ann', 'bob'] }), { type: 'setFirstPlayer', player: 'ann' }).state;
    assert.equal(games[0].map.stars.length, start.map.stars.length);
  });

  test('a game that stops on an error tells its players, and the server goes on', async () => {
    const room = createRoom(settings({ ann: 'remote', bob: 'remote' }));
    const sent = [];
    room.join('ann', (m) => sent.push(m));
    room.join('bob', (m) => sent.push(m));
    const decide = sent.find((m) => m.type === 'decide');
    room.receive('bob', { type: 'action', id: decide.id, action: { player: 'bob', get type() { throw new Error('broken'); } } });
    const final = await room.done;
    assert.equal(final, room.state);
    assert.match(room.failure.message, /broken/);
    assert.equal(sent.filter((m) => m.code === 'GAME_STOPPED').length, 2);
  });
});
