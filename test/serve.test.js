import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createStaticServer, parseArgs } from '../tools/serve.js';

// Phase 7a: the static file server behind "npm start".
const root = fileURLToPath(new URL('..', import.meta.url));
let server;
let port;

// A raw request, so the path reaches the server exactly as written.
const get = (path, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
    });
    req.on('error', reject);
    req.end();
  });

describe('tools/serve.js', () => {
  before(async () => {
    server = createStaticServer(root);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });
  after(() => server.close());

  test('/ serves index.html', async () => {
    const r = await get('/');
    assert.equal(r.status, 200);
    assert.match(r.type, /^text\/html/);
    assert.match(r.body, /<script type="module" src="src\/ui\/main.js">/);
  });

  test('serves JS modules and JSON with their types', async () => {
    const js = await get('/src/engine/game.js');
    assert.equal(js.status, 200);
    assert.match(js.type, /^text\/javascript/);
    const json = await get('/data/maps/classic-original.json');
    assert.equal(json.status, 200);
    assert.match(json.type, /^application\/json/);
    assert.ok(JSON.parse(json.body).stars.length > 0);
  });

  test('a missing file is 404', async () => {
    assert.equal((await get('/nope.html')).status, 404);
  });

  test('nothing outside the root, and no dotfiles', async () => {
    assert.equal((await get('/..%2f..%2fwindows%2fwin.ini')).status, 404);
    assert.equal((await get('/%2e%2e/package.json')).status, 200, 'normalised to /package.json inside the root');
    assert.equal((await get('/.git/HEAD')).status, 404);
    assert.equal((await get('/.gitignore')).status, 404);
  });

  test('only GET and HEAD', async () => {
    assert.equal((await get('/', 'POST')).status, 405);
    const head = await get('/', 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
  });
});

describe('npm start arguments (Phase 9c)', () => {
  test('127.0.0.1 unless --lan; a port from the arguments, else PORT, else 8000', () => {
    assert.deepEqual(parseArgs([]), { port: 8000, host: '127.0.0.1', lan: false });
    assert.deepEqual(parseArgs(['--lan']), { port: 8000, host: '0.0.0.0', lan: true });
    assert.deepEqual(parseArgs(['9000', '--lan']), { port: 9000, host: '0.0.0.0', lan: true });
    assert.deepEqual(parseArgs([], { PORT: '8080' }), { port: 8080, host: '127.0.0.1', lan: false });
    assert.throws(() => parseArgs(['--lna']), RangeError);
  });
});
