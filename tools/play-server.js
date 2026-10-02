// Remote play (Phase 9c): WebSockets at /play, each game a room (src/play/room.js) found by a short code.
// attachPlay(server, { map }) adds it to an http server, beside the static files (serve.js).
//
// Messages from a browser, as JSON text (the room's own are in src/play/remote.js):
//   { type: 'create', scenario, modules?, players: [p1, p2], first, seats: { [player]: 'remote' | 'plan' | 'random' },
//     seed? }                                    makes a game; answered { type: 'created', code }
//   { type: 'info', code }                       answered { type: 'info', code, settings, open, started }: the
//                                                seats still open to join (Phase 9c-2)
//   { type: 'join', code, player }               takes that player's remote seat; answered { type: 'joined', ... }
//   { type: 'action', id, action }               answers a decision, once joined
// Mistakes are answered { type: 'error', code, message } and the connection stays open.

import { randomInt } from 'node:crypto';
import { acceptUpgrade } from './websocket.js';
import { createRoom } from '../src/play/room.js';
import { MAX_SEED } from '../src/play/computer.js';
// The public log (D-039): the page's own words for each action, so every player reads the same log.
import { logEntries } from '../src/ui/log.js';

// Game codes: five letters and digits that cannot be mistaken for each other.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
// Rooms the server keeps at once (Phase 9c-1 never closes them; 9c-3 cleans up).
const MAX_ROOMS = 200;

export function attachPlay(server, { map }) {
  const rooms = new Map();
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
    let seat = null; // { room, player } once joined

    const handlers = {
      create(m) {
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
        const room = rooms.get(String(m.code ?? '').toUpperCase());
        if (!room) return error('NO_GAME', `No game ${m.code}`);
        const r = room.join(m.player, send);
        if (!r.ok) return error(r.code, r.message);
        seat = { room, player: m.player };
        return null;
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
    conn.on('close', () => seat?.room.leave(seat.player));
  });
  return { rooms };
}
