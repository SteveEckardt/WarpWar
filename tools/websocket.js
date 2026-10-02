// A small WebSocket server (RFC 6455) on node:http, for remote play (Phase 9c). Node built-ins only.
// Text messages only; the server answers pings and closes cleanly. A page from another site may not connect:
// a browser's Origin must name the host it connects to.
//
// Use: server.on('upgrade', (req, socket) => { const conn = acceptUpgrade(req, socket); ... }). acceptUpgrade
// answers the handshake and returns a connection, an EventEmitter with send(text) and close(code, reason) that
// emits 'message' (text) and 'close' (code), or refuses it (400 or 403) and returns null.

import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
// The longest message taken, in bytes.
export const MAX_MESSAGE = 1 << 20;

const OP = { continuation: 0, text: 1, binary: 2, close: 8, ping: 9, pong: 10 };

export const acceptKey = (key) => createHash('sha1').update(key + GUID).digest('base64');

// A frame (§5.2). The server's are not masked; mask (4 bytes) makes a client's, for tests.
export function encodeFrame(opcode, payload, { fin = true, mask = null } = {}) {
  const n = payload.length;
  const size = n < 126 ? 0 : n < 65536 ? 2 : 8;
  const head = Buffer.alloc(2 + size + (mask ? 4 : 0));
  head[0] = (fin ? 0x80 : 0) | opcode;
  head[1] = (mask ? 0x80 : 0) | (size === 0 ? n : size === 2 ? 126 : 127);
  if (size === 2) head.writeUInt16BE(n, 2);
  if (size === 8) head.writeBigUInt64BE(BigInt(n), 2);
  if (!mask) return Buffer.concat([head, payload]);
  mask.copy(head, 2 + size);
  const body = Buffer.from(payload);
  for (let i = 0; i < body.length; i += 1) body[i] ^= mask[i % 4];
  return Buffer.concat([head, body]);
}

class ProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (code, message) => {
  throw new ProtocolError(code, message);
};

// Reads a client's frames from bytes as they arrive. push(bytes) returns the messages now complete:
// { type: 'text', data }, { type: 'ping', payload }, { type: 'pong' }, { type: 'close', code, reason }.
// Throws a ProtocolError, whose code is the close code to send (§7.4.1).
export function createFrameReader({ maxMessage = MAX_MESSAGE } = {}) {
  let buffered = Buffer.alloc(0);
  let parts = null; // a fragmented text message: [Buffer]
  let partBytes = 0;
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  const text = (bytes) => {
    try {
      return utf8.decode(bytes);
    } catch {
      return fail(1007, 'Text is not UTF-8');
    }
  };

  // One frame from the front of the buffer, or null if it has not all arrived.
  function frame() {
    if (buffered.length < 2) return null;
    const [b0, b1] = buffered;
    if (b0 & 0x70) fail(1002, 'Reserved bits set');
    if (!(b1 & 0x80)) fail(1002, 'A client must mask its frames');
    let length = b1 & 0x7f;
    let at = 2;
    if (length === 126) {
      if (buffered.length < 4) return null;
      length = buffered.readUInt16BE(2);
      at = 4;
    } else if (length === 127) {
      if (buffered.length < 10) return null;
      const big = buffered.readBigUInt64BE(2);
      if (big > BigInt(maxMessage)) fail(1009, 'Message too big');
      length = Number(big);
      at = 10;
    }
    const opcode = b0 & 0x0f;
    if (opcode >= 8 && (!(b0 & 0x80) || length > 125)) fail(1002, 'A control frame is short and whole');
    if (opcode < 8 && partBytes + length > maxMessage) fail(1009, 'Message too big');
    if (buffered.length < at + 4 + length) return null;
    const mask = buffered.subarray(at, at + 4);
    const payload = Buffer.from(buffered.subarray(at + 4, at + 4 + length));
    for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
    buffered = buffered.subarray(at + 4 + length);
    return { fin: Boolean(b0 & 0x80), opcode, payload };
  }

  return {
    push(bytes) {
      buffered = buffered.length === 0 ? bytes : Buffer.concat([buffered, bytes]);
      const out = [];
      for (let f = frame(); f; f = frame()) {
        const { fin, opcode, payload } = f;
        if (opcode === OP.ping) out.push({ type: 'ping', payload });
        else if (opcode === OP.pong) out.push({ type: 'pong' });
        else if (opcode === OP.close) {
          const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
          out.push({ type: 'close', code, reason: payload.length > 2 ? text(payload.subarray(2)) : '' });
        } else if (opcode === OP.text || opcode === OP.continuation) {
          if (opcode === OP.text && parts) fail(1002, 'A new message before the last was finished');
          if (opcode === OP.continuation && !parts) fail(1002, 'A continuation with nothing to continue');
          parts = [...(parts ?? []), payload];
          partBytes += payload.length;
          if (fin) {
            out.push({ type: 'text', data: text(Buffer.concat(parts)) });
            parts = null;
            partBytes = 0;
          }
        } else if (opcode === OP.binary) {
          fail(1003, 'Text messages only');
        } else {
          fail(1002, `Unknown opcode ${opcode}`);
        }
      }
      return out;
    },
  };
}

function refuse(socket, status, text) {
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  return null;
}

// Same origin: a browser's Origin header must name the host the request was sent to. Clients that are not
// browsers send none.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (origin == null) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function acceptUpgrade(req, socket, { maxMessage = MAX_MESSAGE } = {}) {
  const key = req.headers['sec-websocket-key'];
  const words = (h) => String(h ?? '').toLowerCase().split(',').map((w) => w.trim());
  if (req.method !== 'GET' || !words(req.headers.upgrade).includes('websocket') || !words(req.headers.connection).includes('upgrade')
    || req.headers['sec-websocket-version'] !== '13' || !key || Buffer.from(key, 'base64').length !== 16) {
    return refuse(socket, 400, 'Bad Request');
  }
  if (!sameOrigin(req)) return refuse(socket, 403, 'Forbidden');
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey(key)}`, '', ''].join('\r\n'));
  socket.setNoDelay(true);

  const conn = new EventEmitter();
  const reader = createFrameReader({ maxMessage });
  let open = true;
  let closed = false;
  const finish = (code) => {
    if (closed) return;
    closed = true;
    open = false;
    conn.emit('close', code);
  };
  const closeFrame = (code, reason = '') => {
    const payload = Buffer.alloc(2 + Buffer.byteLength(reason));
    payload.writeUInt16BE(code, 0);
    payload.write(reason, 2);
    return encodeFrame(OP.close, payload);
  };
  conn.send = (text) => {
    if (open) socket.write(encodeFrame(OP.text, Buffer.from(String(text))));
  };
  // Starts the closing handshake (§7.1.2): the client answers, then the socket ends.
  conn.close = (code = 1000, reason = '') => {
    if (!open) return;
    open = false;
    socket.write(closeFrame(code, reason));
    socket.end();
    finish(code);
  };

  socket.on('data', (bytes) => {
    let events;
    try {
      events = reader.push(bytes);
    } catch (e) {
      if (!(e instanceof ProtocolError)) throw e;
      conn.close(e.code, e.message.slice(0, 120));
      return;
    }
    for (const ev of events) {
      if (ev.type === 'text' && open) conn.emit('message', ev.data);
      else if (ev.type === 'ping' && open) socket.write(encodeFrame(OP.pong, ev.payload));
      else if (ev.type === 'close') {
        if (open) {
          open = false;
          socket.end(closeFrame(ev.code === 1005 ? 1000 : ev.code));
        }
        finish(ev.code);
        return;
      }
    }
  });
  socket.on('close', () => finish(1006));
  socket.on('error', () => socket.destroy());
  return conn;
}
