import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderNewGame, renderJoin, renderWaiting, networkGame, SEATS } from '../src/ui/setup.js';

// Phase 9c-2: the screens for remote play. Pure: HTML strings.

describe('the setup screen', () => {
  test('a player may be Remote: someone at another browser', () => {
    assert.equal(SEATS.remote, 'Remote (another browser)');
    assert.match(renderNewGame({ seats: ['local', 'remote'] }), /<select name="seat2"[^>]*>.*<option value="remote" selected>Remote \(another browser\)<\/option>/);
  });

  test('a game with a Remote player is held by the server, and played here by its one Human', () => {
    assert.deepEqual(networkGame(['ann', 'bob'], ['local', 'local']), { network: false });
    assert.deepEqual(networkGame(['ann', 'bob'], ['plan', 'random']), { network: false });
    assert.deepEqual(networkGame(['ann', 'bob'], ['local', 'remote']), { network: true, me: 'ann', seats: { ann: 'remote', bob: 'remote' } });
    assert.deepEqual(networkGame(['ann', 'bob'], ['remote', 'local']), { network: true, me: 'bob', seats: { ann: 'remote', bob: 'remote' } });
    assert.deepEqual(networkGame(['ann', 'bob'], ['remote', 'plan']).error, 'A game with a Remote player needs one Human, at this screen');
    assert.match(networkGame(['ann', 'bob'], ['remote', 'remote']).error, /one Human/);
  });
});

describe('joining a game', () => {
  test('a code to look up; then a button for each open seat', () => {
    const blank = renderJoin({});
    assert.match(blank, /<form class="join-game"/);
    assert.match(blank, /<input name="code" value="" required maxlength="5"/);
    assert.match(blank, /<button type="submit">Find game<\/button>/);
    const found = renderJoin({ code: 'ABCDE', info: { open: ['bob'], settings: { scenario: 'basic', players: ['ann', 'bob'], seats: { ann: 'remote', bob: 'remote' } } } });
    assert.match(found, /basic scenario: ann and bob/i);
    assert.match(found, /<button type="button" class="primary" data-action="join-as" data-player="bob">Join as bob<\/button>/);
    assert.match(renderJoin({ code: 'ABCDE', info: { open: [], settings: { scenario: 'basic', players: ['ann', 'bob'] } } }), /No seat is open/);
    assert.match(renderJoin({ error: 'No game ZZZZZ' }), /role="alert">No game ZZZZZ</);
  });
});

describe('waiting for the other player', () => {
  test('the code to share, the address to open, and who is still to join', () => {
    const html = renderWaiting({ code: 'K7QXP', player: 'ann', settings: { players: ['ann', 'bob'], seats: { ann: 'remote', bob: 'remote' } }, url: 'http://192.168.1.5:8000/' });
    assert.match(html, /<strong class="code">K7QXP<\/strong>/);
    assert.match(html, /http:\/\/192\.168\.1\.5:8000\//);
    assert.match(html, /npm start -- --lan/);
    assert.match(html, /Waiting for bob to join/);
  });
});
