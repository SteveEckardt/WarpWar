import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { acceptKey, encodeFrame, createFrameReader, acceptUpgrade, MAX_MESSAGE } from '../tools/websocket.js';

// Phase 9c-1: a small WebSocket server of our own (RFC 6455), on node:http.
const MASK = Buffer.from([0x37, 0xfa, 0x21, 0x3d]);
const read = (bytes, options) => createFrameReader(options).push(Buffer.from(bytes));

describe('the opening handshake (RFC 6455 §1.3, §4.2.2)', () => {
  test('the accept key, from the RFC example', () => {
    assert.equal(acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  });
});

describe('frames (RFC 6455 §5)', () => {
  test('the RFC examples: an unmasked "Hello" from the server, a masked one from a client', () => {
    assert.deepEqual([...encodeFrame(1, Buffer.from('Hello'))], [0x81, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    const masked = [0x81, 0x85, 0x37, 0xfa, 0x21, 0x3d, 0x7f, 0x9f, 0x4d, 0x51, 0x58];
    assert.deepEqual([...encodeFrame(1, Buffer.from('Hello'), { mask: MASK })], masked);
    assert.deepEqual(read(masked), [{ type: 'text', data: 'Hello' }]);
  });

  test('a fragmented message is put back together; a ping comes between the fragments', () => {
    const bytes = Buffer.concat([
      encodeFrame(1, Buffer.from('Hel'), { fin: false, mask: MASK }),
      encodeFrame(9, Buffer.from('hi'), { mask: MASK }),
      encodeFrame(0, Buffer.from('lo'), { mask: MASK }),
    ]);
    assert.deepEqual(createFrameReader().push(bytes), [{ type: 'ping', payload: Buffer.from('hi') }, { type: 'text', data: 'Hello' }]);
  });

  test('16-bit and 64-bit lengths; bytes arriving in pieces', () => {
    const long = 'x'.repeat(70000);
    const frame = encodeFrame(1, Buffer.from(long), { mask: MASK });
    assert.equal(frame[1] & 0x7f, 127);
    assert.equal(encodeFrame(1, Buffer.alloc(300))[1], 126);
    const reader = createFrameReader();
    const out = [];
    for (let i = 0; i < frame.length; i += 1000) out.push(...reader.push(frame.subarray(i, i + 1000)));
    assert.deepEqual(out, [{ type: 'text', data: long }]);
  });

  test('close carries its code and reason', () => {
    const payload = Buffer.concat([Buffer.from([0x03, 0xe8]), Buffer.from('bye')]);
    assert.deepEqual(read(encodeFrame(8, payload, { mask: MASK })), [{ type: 'close', code: 1000, reason: 'bye' }]);
  });

  test('protocol errors close the connection with their code', () => {
    const fails = (bytes, code, options) => assert.throws(() => read(bytes, options), (e) => e.code === code);
    fails(encodeFrame(1, Buffer.from('hi')), 1002); // a client must mask
    fails(encodeFrame(2, Buffer.from('hi'), { mask: MASK }), 1003); // text only
    fails(encodeFrame(1, Buffer.from([0xc3, 0x28]), { mask: MASK }), 1007); // not UTF-8
    fails(encodeFrame(1, Buffer.alloc(11), { mask: MASK }), 1009, { maxMessage: 10 });
    fails(encodeFrame(9, Buffer.alloc(126), { mask: MASK }), 1002); // a control frame is short
    fails(encodeFrame(0, Buffer.from('x'), { mask: MASK }), 1002); // a continuation with nothing to continue
    assert.equal(MAX_MESSAGE, 1 << 20);
  });
});

// An echo server through acceptUpgrade, for clients: Node's WebSocket (Node 22 and later) and raw sockets.
describe('connections', () => {
  let server;
  let port;
  const closes = [];
  before(async () => {
    server = http.createServer((req, res) => res.end('plain'));
    server.on('upgrade', (req, socket) => {
      const conn = acceptUpgrade(req, socket);
      if (!conn) return;
      conn.on('message', (text) => (text === 'close please' ? conn.close(4000, 'asked') : conn.send(`echo ${text}`)));
      conn.on('close', (code) => closes.push(code));
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    port = server.address().port;
  });
  after(() => server.close());

  // The response to a raw upgrade request with these headers.
  const upgrade = (headers) => new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      const lines = Object.entries({ Host: `127.0.0.1:${port}`, Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', ...headers })
        .filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`);
      socket.write(`GET /play HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`);
    });
    let text = '';
    socket.on('data', (d) => {
      text += d;
      if (text.includes('\r\n\r\n')) {
        socket.destroy();
        resolve(text.split('\r\n')[0]);
      }
    });
    socket.on('error', reject);
  });

  test('the handshake answers 101, with the accept key', async () => {
    assert.equal(await upgrade({}), 'HTTP/1.1 101 Switching Protocols');
  });

  test('a bad handshake is refused: 400; a page from another site: 403', async () => {
    assert.match(await upgrade({ 'Sec-WebSocket-Version': '8' }), /^HTTP\/1.1 400/);
    assert.match(await upgrade({ 'Sec-WebSocket-Key': null }), /^HTTP\/1.1 400/);
    assert.match(await upgrade({ Origin: 'http://evil.example' }), /^HTTP\/1.1 403/);
    assert.equal(await upgrade({ Origin: `http://127.0.0.1:${port}` }), 'HTTP/1.1 101 Switching Protocols');
  });

  const client = typeof WebSocket === 'function' ? test : test.skip;
  client('messages both ways with a browser-style client; the server closes with its code', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/play`);
    const got = [];
    const closed = new Promise((done) => ws.addEventListener('close', (e) => done(e.code)));
    ws.addEventListener('message', (e) => {
      got.push(e.data);
      if (got.length === 2) ws.send('close please');
    });
    await new Promise((done) => ws.addEventListener('open', done));
    ws.send('one');
    ws.send('ü'.repeat(200));
    assert.equal(await closed, 4000);
    assert.deepEqual(got, ['echo one', `echo ${'ü'.repeat(200)}`]);
    assert.ok(closes.includes(4000));
  });
});
