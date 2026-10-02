import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from '../tools/serve.js';
import { attachPlay } from '../tools/play-server.js';
import { connectPlay, playUrl } from '../src/ui/net.js';
import { createComputerController } from '../src/play/computer.js';

// Phase 9c-2: the page's client for remote play. To the page it looks like a player at this screen: the decision
// waiting (request) and submit(action); its view and the public log come from the server.
const root = fileURLToPath(new URL('..', import.meta.url));
const map = JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8'));

test('the server address, from the page address', () => {
  assert.equal(playUrl({ protocol: 'http:', host: '192.168.1.5:8000' }), 'ws://192.168.1.5:8000/play');
  assert.equal(playUrl({ protocol: 'https:', host: 'warpwar.example' }), 'wss://warpwar.example/play');
});

const online = typeof WebSocket === 'function' ? describe : describe.skip;

online('the client', () => {
  let server;
  let url;
  before(async () => {
    server = createStaticServer(root);
    attachPlay(server, { map });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    url = `ws://127.0.0.1:${server.address().port}/play`;
  });
  after(() => server.close());

  const LEARNING = { scenario: 'learning', players: ['ann', 'bob'], first: 'ann', seats: { ann: 'remote', bob: 'remote' } };
  const until = async (check) => {
    for (let i = 0; i < 200 && !check(); i += 1) await new Promise((done) => setTimeout(done, 5));
    assert.ok(check(), 'timed out');
  };

  // Answers each decision the client is asked with the computer's choice, as a player at the page would.
  function autoplay(client, strategy, seed) {
    const computer = createComputerController({ seed, strategy });
    let busy = false;
    const answer = async () => {
      if (busy) return;
      busy = true;
      while (client.request) {
        const r = client.request;
        const outcome = await client.submit(computer.nextAction(r.view, r));
        assert.equal(outcome.ok, true, outcome.message);
      }
      busy = false;
    };
    client.onUpdate(answer);
    answer(); // a decision already waiting
  }

  test('create, look up the code, join, and play a game to the end from two clients', async () => {
    const ann = await connectPlay(url);
    const code = await ann.create(LEARNING);
    assert.equal((await ann.join(code, 'ann')).seats.bob, 'remote');
    assert.equal(ann.player, 'ann');
    assert.equal(ann.view, null, 'no view until every player has joined');
    const bob = await connectPlay(url);
    assert.deepEqual((await bob.info(code)).open, ['bob']);
    autoplay(ann, 'plan', 1);
    autoplay(bob, 'plan', 2);
    await bob.join(code, 'bob');
    await until(() => ann.view?.step === 'over' && bob.view?.step === 'over');
    assert.deepEqual(ann.view, bob.view);
    assert.equal(ann.log[0].text, 'ann moves first.');
    assert.deepEqual(ann.log, bob.log);
    assert.equal(ann.kind, 'local', 'to the page, a player at this screen');
    ann.close();
    bob.close();
  });

  test('the request waits until answered; a refused action comes back as the outcome, then asked again', async () => {
    const ann = await connectPlay(url);
    const code = await ann.create(LEARNING);
    await ann.join(code, 'ann');
    const bob = await connectPlay(url);
    await bob.join(code, 'bob');
    await until(() => bob.request);
    assert.equal(bob.request.view.step, 'setup');
    assert.equal(ann.request, null, "nothing is asked of ann while bob chooses");
    const outcome = await bob.submit({ type: 'chooseSide', player: 'bob', side: 'Z' });
    assert.deepEqual([outcome.ok, outcome.code], [false, 'BAD_SIDE']);
    await until(() => bob.request?.rejection);
    assert.deepEqual(await bob.submit({ type: 'chooseSide', player: 'bob', side: 'B' }), { ok: true });
    await until(() => ann.request?.view.step === 'build');
    assert.equal(ann.view.sides.bob, 'B');
    const nothing = await bob.submit({ type: 'endTurn', player: 'bob' });
    assert.equal(nothing.code, 'NOT_ASKED');
    ann.close();
    bob.close();
  });

  test("a server error fails the call: an unknown code, a taken seat, a game that is not one", async () => {
    const c = await connectPlay(url);
    await assert.rejects(c.info('ZZZZZ'), { code: 'NO_GAME' });
    await assert.rejects(c.create({ ...LEARNING, scenario: 'chess' }), { code: 'BAD_GAME' });
    const code = await c.create(LEARNING);
    await c.join(code, 'ann');
    const d = await connectPlay(url);
    await assert.rejects(d.join(code, 'ann'), { code: 'SEAT_TAKEN' });
    c.close();
    d.close();
  });

  test('the connection closing is told to the page', async () => {
    const c = await connectPlay(url);
    let told = false;
    c.onUpdate(() => {
      if (c.closed) told = true;
    });
    c.close();
    await until(() => told);
    await assert.rejects(connectPlay(url.replace('/play', '/nowhere')));
  });

  test('reconnecting (9c-3): after a dropped connection the client takes its seat back by itself, and play goes on', async () => {
    const quick = { retryMs: [20, 40, 80] };
    const ann = await connectPlay(url, quick);
    const code = await ann.create(LEARNING);
    await ann.join(code, 'ann');
    assert.equal(typeof ann.token, 'string');
    const bob = await connectPlay(url, quick);
    await bob.join(code, 'bob');
    await until(() => bob.request && ann.presence.bob === true);
    const asked = bob.request.id;
    bob.socket.close(); // the network drops, as far as the client knows
    await until(() => ann.presence.bob === false);
    await until(() => bob.connected && bob.request);
    assert.equal(bob.request.id, asked, 'the same decision, sent again');
    assert.equal(bob.closed, false);
    assert.equal(ann.presence.bob, true);
    assert.equal(bob.log[0].text, 'ann moves first.', 'the log, whole again');
    autoplay(ann, 'plan', 3);
    autoplay(bob, 'plan', 4);
    await until(() => ann.view?.step === 'over' && bob.view?.step === 'over');
    ann.close();
    bob.close();
  });

  test('rejoin: a page that was reloaded takes its seat back with the saved code and token', async () => {
    const ann = await connectPlay(url);
    const code = await ann.create(LEARNING);
    await ann.join(code, 'ann');
    const { token } = ann;
    ann.close();
    const again = await connectPlay(url);
    assert.equal((await again.rejoin(code, token)).players[0], 'ann');
    assert.equal(again.player, 'ann');
    const stranger = await connectPlay(url);
    await assert.rejects(stranger.rejoin(code, 'wrong'), { code: 'BAD_TOKEN' });
    stranger.close();
    again.close();
  });

  test("taken back in another window: the old client stops and says so, without reconnecting", async () => {
    const one = await connectPlay(url, { retryMs: [10] });
    const code = await one.create(LEARNING);
    await one.join(code, 'ann');
    const two = await connectPlay(url);
    await two.rejoin(code, one.token);
    await until(() => one.closed);
    assert.equal(one.replaced, true);
    await new Promise((done) => setTimeout(done, 50));
    assert.equal(one.connected, false);
    two.close();
  });

  test('a game gone from the server: reconnecting gives up, and the client is closed', async () => {
    const ann = await connectPlay(url, { retryMs: [10, 10] });
    const code = await ann.create(LEARNING);
    await ann.join(code, 'ann');
    ann.token = 'not-any-more';
    ann.socket.close();
    await until(() => ann.closed);
    assert.equal(ann.connected, false);
  });
});

