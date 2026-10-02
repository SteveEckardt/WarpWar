import { test, describe, before, after } from 'node:test';
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

  // A client: send(message), next(type) waits for the next message of that type, all lists what came.
  async function connect(path = '/play') {
    const ws = new WebSocket(url + path);
    const all = [];
    const waiters = [];
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      all.push(m);
      for (const w of waiters.filter((x) => x.type === m.type)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(m);
      }
    });
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });
    return {
      ws,
      all,
      send: (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m)),
      next: (type) => new Promise((resolve) => waiters.push({ type, resolve })),
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

  test('only /play takes WebSockets', async () => {
    await assert.rejects(connect('/other'));
  });
});
