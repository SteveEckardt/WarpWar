import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createStaticServer } from '../tools/serve.js';
import { attachPlay, CODE_ALPHABET } from '../tools/play-server.js';
import { createComputerController } from '../src/play/computer.js';

// Phase 9c-1: remote play through the server, over real WebSockets (Node 22 and later has the client).
const root = fileURLToPath(new URL('..', import.meta.url));
const online = typeof WebSocket === 'function' ? describe : describe.skip;

online('the play server (/play)', () => {
  let server;
  let url;
  before(async () => {
    server = createStaticServer(root);
    attachPlay(server, { map: JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8')) });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    url = `ws://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  // A client: send(message), next(type) takes the oldest message of that type not yet taken (waiting for one if
  // need be: several can arrive together, before the test asks), all lists what came.
  // Every socket a test opens is closed after it, passed or failed: an open one would keep the run alive.
  const sockets = [];
  afterEach(() => {
    for (const ws of sockets.splice(0)) ws.close();
  });

  async function connect(path = '/play') {
    const ws = new WebSocket(url + path);
    sockets.push(ws);
    const all = [];
    const unread = [];
    const waiters = [];
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      all.push(m);
      const w = waiters.find((x) => x.type === m.type);
      if (w) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(m);
      } else {
        unread.push(m);
      }
    });
    const next = (type) => new Promise((resolve) => {
      const i = unread.findIndex((m) => m.type === type);
      if (i >= 0) resolve(unread.splice(i, 1)[0]);
      else waiters.push({ type, resolve });
    });
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });
    return {
      ws,
      all,
      send: (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m)),
      next,
      close: () => ws.close(),
    };
  }

  // A browser that answers each decision with the computer's choice; resolves with the final view.
  function autoplay(client, strategy, seed) {
    const computer = createComputerController({ seed, strategy });
    return new Promise((resolve) => {
      client.ws.addEventListener('message', (e) => {
        const m = JSON.parse(e.data);
        if (m.type === 'decide') client.send({ type: 'action', id: m.id, action: computer.nextAction(m.view, m) });
        if (m.type === 'view' && m.view.step === 'over') resolve(m.view);
      });
    });
  }

  const LEARNING = { type: 'create', scenario: 'learning', players: ['ann', 'bob'], first: 'ann', seats: { ann: 'remote', bob: 'remote' } };

  test('create a game, join it from two browsers by its code, and play it to the end', async () => {
    const ann = await connect();
    ann.send(LEARNING);
    const { code } = await ann.next('created');
    assert.match(code, new RegExp(`^[${CODE_ALPHABET}]{5}$`));
    const bob = await connect();
    const games = [autoplay(ann, 'plan', 1), autoplay(bob, 'random', 2)];
    ann.send({ type: 'join', code: code.toLowerCase(), player: 'ann' });
    assert.equal((await ann.next('joined')).player, 'ann');
    bob.send({ type: 'join', code, player: 'bob' });
    const [a, b] = await Promise.all(games);
    assert.deepEqual(a, b);
    assert.equal(a.step, 'over');
    assert.ok(!ann.all.some((m) => m.type === 'error') && !bob.all.some((m) => m.type === 'error'));
    ann.close();
    bob.close();
  });

  test('against a computer on the server, with a seed', async () => {
    const ann = await connect();
    ann.send({ ...LEARNING, scenario: 'basic', seats: { ann: 'remote', bob: 'plan' }, seed: 12 });
    const { code } = await ann.next('created');
    const game = autoplay(ann, 'plan', 3);
    ann.send({ type: 'join', code, player: 'ann' });
    assert.equal((await game).step, 'over');
    ann.close();
  });

  test('mistakes are answered with an error message, and the connection stays open', async () => {
    const c = await connect();
    const errors = [];
    for (const m of ['not json', { type: 'fly' }, { type: 'join', code: 'ZZZZZ', player: 'ann' }, { type: 'action', id: 1, action: {} },
      { ...LEARNING, scenario: 'chess' }, { ...LEARNING, seats: { ann: 'plan', bob: 'plan' } }]) {
      const err = c.next('error');
      c.send(m);
      errors.push((await err).code);
    }
    assert.deepEqual(errors, ['BAD_MESSAGE', 'BAD_MESSAGE', 'NO_GAME', 'NOT_JOINED', 'BAD_GAME', 'BAD_GAME']);
    c.send(LEARNING);
    const { code } = await c.next('created');
    c.send({ type: 'join', code, player: 'ann' });
    await c.next('joined');
    const taken = await connect();
    taken.send({ type: 'join', code, player: 'ann' });
    assert.equal((await taken.next('error')).code, 'SEAT_TAKEN');
    const again = c.next('error');
    c.send({ type: 'join', code, player: 'bob' });
    assert.equal((await again).code, 'ALREADY_JOINED');
    c.close();
    taken.close();
  });

  test('info: before joining, which seats a code still has open (Phase 9c-2)', async () => {
    const ann = await connect();
    ann.send({ ...LEARNING, seats: { ann: 'remote', bob: 'remote' } });
    const { code } = await ann.next('created');
    ann.send({ type: 'join', code, player: 'ann' });
    await ann.next('joined');
    const bob = await connect();
    bob.send({ type: 'info', code: code.toLowerCase() });
    const info = await bob.next('info');
    assert.deepEqual({ code: info.code, open: info.open, started: info.started }, { code, open: ['bob'], started: false });
    assert.deepEqual(info.settings.seats, { ann: 'remote', bob: 'remote' });
    bob.send({ type: 'info', code: 'QQQQQ' });
    assert.equal((await bob.next('error')).code, 'NO_GAME');
    ann.close();
    bob.close();
  });

  test('the public log comes with play, in words both players may read (D-039)', async () => {
    const ann = await connect();
    ann.send({ ...LEARNING, seats: { ann: 'remote', bob: 'plan' } });
    const { code } = await ann.next('created');
    const game = autoplay(ann, 'plan', 4);
    ann.send({ type: 'join', code, player: 'ann' });
    await game;
    const log = ann.all.filter((m) => m.type === 'log').flatMap((m) => m.entries);
    assert.equal(log[0].text, 'ann moves first.');
    assert.ok(log.length > 5);
    assert.ok(log.every((e) => typeof e.text === 'string' && Number.isInteger(e.turn)));
    ann.close();
  });

  test('rejoining (9c-3): a dropped player comes back with the seat token, is sent what was missed, and play goes on', async () => {
    const ann = await connect();
    ann.send(LEARNING);
    const { code } = await ann.next('created');
    const bob = await connect();
    ann.send({ type: 'join', code, player: 'ann' });
    await ann.next('joined');
    const arrived = ann.next('presence');
    bob.send({ type: 'join', code, player: 'bob' });
    const { token } = await bob.next('joined');
    const decide = await bob.next('decide');
    assert.deepEqual(await arrived, { type: 'presence', player: 'bob', connected: true });
    const dropped = ann.next('presence');
    bob.close();
    assert.deepEqual(await dropped, { type: 'presence', player: 'bob', connected: false });

    const back = await connect();
    const game = Promise.all([autoplay(ann, 'plan', 5), autoplay(back, 'plan', 6)]);
    const returned = ann.next('presence');
    back.send({ type: 'rejoin', code: code.toLowerCase(), token });
    const joined = await back.next('joined');
    assert.deepEqual([joined.player, joined.token, joined.connected], ['bob', token, { ann: true, bob: true }]);
    assert.deepEqual(await returned, { type: 'presence', player: 'bob', connected: true });
    const [a, b] = await game;
    assert.deepEqual(a, b);
    assert.ok(back.all.some((m) => m.type === 'decide' && m.id === decide.id), 'the waiting decision, sent again');
    assert.ok(back.all.some((m) => m.type === 'log' && m.entries[0].text === 'ann moves first.'), 'the whole log');
    const bad = await connect();
    bad.send({ type: 'rejoin', code, token: 'nope' });
    assert.equal((await bad.next('error')).code, 'BAD_TOKEN');
    for (const c of [ann, back, bad]) c.close();
  });

  test('rejoining from a second window closes the first, which is told why', async () => {
    const one = await connect();
    one.send(LEARNING);
    const { code } = await one.next('created');
    one.send({ type: 'join', code, player: 'ann' });
    const { token } = await one.next('joined');
    const closed = new Promise((done) => one.ws.addEventListener('close', (e) => done(e.code)));
    const two = await connect();
    two.send({ type: 'rejoin', code, token });
    await two.next('joined');
    assert.equal(await closed, 4001);
    two.close();
  });

  test('only /play takes WebSockets', async () => {
    await assert.rejects(connect('/other'));
  });
});

// Cleaning up (9c-3): with a clock of the test's own, and the sweep run by hand.
online('the play server cleans up its games', () => {
  let server;
  let url;
  let play;
  let clock = 0;
  const IDLE = 1000;
  before(async () => {
    server = createStaticServer(root);
    play = attachPlay(server, { map: JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8')), idleMs: IDLE, now: () => clock });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    url = `ws://127.0.0.1:${server.address().port}/play`;
  });
  after(() => server.close());

  const sockets = [];
  afterEach(() => {
    for (const ws of sockets.splice(0)) ws.close();
  });
  const open = async () => {
    const ws = new WebSocket(url);
    sockets.push(ws);
    const got = [];
    ws.addEventListener('message', (e) => got.push(JSON.parse(e.data)));
    await new Promise((done) => ws.addEventListener('open', done));
    const next = async (type) => {
      for (let i = 0; i < 1000; i += 1) {
        const m = got.find((x) => x.type === type);
        if (m) {
          got.splice(got.indexOf(m), 1);
          return m;
        }
        await new Promise((done) => setTimeout(done, 5));
      }
      throw new Error(`no ${type}`);
    };
    return { ws, send: (m) => ws.send(JSON.stringify(m)), next, close: () => new Promise((done) => { ws.addEventListener('close', done); ws.close(); }) };
  };
  const SETTINGS = { type: 'create', scenario: 'learning', players: ['ann', 'bob'], first: 'ann', seats: { ann: 'remote', bob: 'remote' } };

  test('a game nobody is connected to goes once it has been idle long enough; one with a player stays', async () => {
    const c = await open();
    clock = 0;
    c.send(SETTINGS);
    const { code: lonely } = await c.next('created');
    c.send(SETTINGS);
    const { code: busy } = await c.next('created');
    c.send({ type: 'join', code: busy, player: 'ann' });
    await c.next('joined');
    clock = IDLE - 1;
    play.sweep();
    assert.ok(play.rooms.has(lonely));
    clock = IDLE * 5;
    play.sweep();
    assert.ok(!play.rooms.has(lonely), 'never joined, idle: gone');
    assert.ok(play.rooms.has(busy), 'ann is still connected');
    await c.close();
    await new Promise((done) => setTimeout(done, 20));
    play.sweep();
    assert.ok(play.rooms.has(busy), 'idle only from when the last player left');
    clock += IDLE;
    play.sweep();
    assert.ok(!play.rooms.has(busy));
    const d = await open();
    d.send({ type: 'rejoin', code: busy, token: 'x' });
    assert.equal((await d.next('error')).code, 'NO_GAME');
    await d.close();
  });

  test('a finished game goes as soon as nobody is connected', async () => {
    const c = await open();
    c.send({ ...SETTINGS, seats: { ann: 'remote', bob: 'plan' } });
    const { code } = await c.next('created');
    // ann answers each decision with the computer's choice until the game is over.
    const computer = createComputerController({ seed: 8, strategy: 'plan' });
    const over = new Promise((done) => c.ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.type === 'decide') c.send({ type: 'action', id: m.id, action: computer.nextAction(m.view, m) });
      if (m.type === 'view' && m.view.step === 'over') done();
    }));
    c.send({ type: 'join', code, player: 'ann' });
    await over;
    assert.equal(play.rooms.get(code).over, true);
    play.sweep();
    assert.ok(play.rooms.has(code), 'ann is still looking at the end');
    await c.close();
    await new Promise((done) => setTimeout(done, 20));
    play.sweep();
    assert.ok(!play.rooms.has(code), 'over, nobody connected: gone at once, idle or not');
  });
});

