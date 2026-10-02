// Remote play (Phase 9c): WebSockets at /play, each game a room (src/play/room.js) found by a short code.
// attachPlay(server, { map, idleMs }) adds it to an http server, beside the static files (serve.js).
//
// Messages from a browser, as JSON text (the room's own are in src/play/remote.js):
//   { type: 'create', scenario, modules?, players: [p1, p2], first, seats: { [player]: 'remote' | 'plan' | 'random' },
//     seed? }                                    makes a game; answered { type: 'created', code }
//   { type: 'info', code }                       answered { type: 'info', code, settings, open, started }: the
//                                                seats still open to join (Phase 9c-2)
//   { type: 'join', code, player }               takes that player's remote seat; answered { type: 'joined', token,
//                                                ... }: the token takes the seat back later
//   { type: 'rejoin', code, token }              takes a seat back after a dropped connection (Phase 9c-3); a
//                                                connection still in the seat is closed with code 4001
//   { type: 'action', id, action }               answers a decision, once joined
// Mistakes are answered { type: 'error', code, message } and the connection stays open.
//
// Cleaning up (9c-3): a game nobody is connected to is removed once it is over, or once it has been idle (nobody
// connected) for idleMs. sweep() does it, every minute.

import { randomInt } from 'node:crypto';
import { acceptUpgrade } from './websocket.js';
import { createRoom } from '../src/play/room.js';
import { MAX_SEED } from '../src/play/computer.js';
// The public log (D-039): the page's own words for each action, so every player reads the same log.
import { logEntries } from '../src/ui/log.js';

// Game codes: five letters and digits that cannot be mistaken for each other.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
// Rooms the server keeps at once, as a limit beside the clean-up.
const MAX_ROOMS = 200;
// A room nobody is connected to is kept this long, for its players to come back.
export const IDLE_MS = 30 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 1000;
// The close code for a connection whose seat was taken back on another (9c-3).
export const REPLACED = 4001;

export function attachPlay(server, { map, idleMs = IDLE_MS, now = Date.now }) {
  const rooms = new Map();
  const idleSince = new Map(); // code: when its last player left (or it was made), while nobody is connected
  const holders = new Map(); // 'code:player': the connection in that seat

  function sweep() {
    for (const [code, room] of rooms) {
      if (room.connected.length > 0) continue;
      if (!room.over && now() - (idleSince.get(code) ?? now()) < idleMs) continue;
      room.stop();
      rooms.delete(code);
      idleSince.delete(code);
      for (const key of holders.keys()) if (key.startsWith(`${code}:`)) holders.delete(key);
    }
  }
  const timer = setInterval(sweep, SWEEP_EVERY_MS);
  timer.unref();
  server.on('close', () => clearInterval(timer));

  const newCode = () => {
    for (;;) {
      const code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
      if (!rooms.has(code)) return code;
    }
  };

  server.on('upgrade', (req, socket) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/play') {
      socket.destroy();
      return;
    }
    const conn = acceptUpgrade(req, socket);
    if (!conn) return;
    const send = (message) => conn.send(JSON.stringify(message));
    const error = (code, message) => send({ type: 'error', code, message });
    let seat = null; // { room, code, player } once joined

    // This connection now holds the seat; one that held it before is closed.
    const hold = (room, code, player) => {
      seat = { room, code, player };
      idleSince.delete(code);
      const key = `${code}:${player}`;
      const before = holders.get(key);
      holders.set(key, conn);
      if (before && before !== conn) before.close(REPLACED, 'This seat was taken back in another window');
    };

    const handlers = {
      create(m) {
        sweep();
        if (rooms.size >= MAX_ROOMS) return error('FULL', 'The server has no room for another game');
        let room;
        try {
          const seed = m.seed ?? randomInt(MAX_SEED + 1);
          room = createRoom({ map, scenario: m.scenario, modules: m.modules ?? [], players: m.players, first: m.first, seats: m.seats, seed, describe: logEntries });
        } catch (e) {
          return error('BAD_GAME', e.message);
        }
        const code = newCode();
        rooms.set(code, room);
        idleSince.set(code, now());
        return send({ type: 'created', code });
      },
      info(m) {
        const code = String(m.code ?? '').toUpperCase();
        const room = rooms.get(code);
        if (!room) return error('NO_GAME', `No game ${m.code}`);
        return send({ type: 'info', code, ...room.info() });
      },
      join(m) {
        if (seat) return error('ALREADY_JOINED', `You are ${seat.player} in this game`);
        const code = String(m.code ?? '').toUpperCase();
        const room = rooms.get(code);
        if (!room) return error('NO_GAME', `No game ${m.code}`);
        const r = room.join(m.player, send);
        if (!r.ok) return error(r.code, r.message);
        return hold(room, code, m.player);
      },
      rejoin(m) {
        if (seat) return error('ALREADY_JOINED', `You are ${seat.player} in this game`);
        const code = String(m.code ?? '').toUpperCase();
        const room = rooms.get(code);
        if (!room) return error('NO_GAME', `No game ${m.code}`);
        const r = room.rejoin(m.token, send);
        if (!r.ok) return error(r.code, r.message);
        return hold(room, code, r.player);
      },
      action(m) {
        if (!seat) return error('NOT_JOINED', 'Join a game first');
        return seat.room.receive(seat.player, m);
      },
    };

    conn.on('message', (text) => {
      let m;
      try {
        m = JSON.parse(text);
      } catch {
        return error('BAD_MESSAGE', 'Messages are JSON');
      }
      const handler = Object.hasOwn(handlers, m?.type) ? handlers[m.type] : null;
      if (!handler) return error('BAD_MESSAGE', `Unknown message: ${m?.type}`);
      // One bad message never takes the server down.
      try {
        return handler(m);
      } catch (e) {
        return error('SERVER_ERROR', e.message);
      }
    });
    conn.on('close', () => {
      if (!seat) return;
      seat.room.leave(seat.player, send);
      if (seat.room.connected.length === 0 && !idleSince.has(seat.code)) idleSince.set(seat.code, now());
    });
  });
  return { rooms, sweep };
}
