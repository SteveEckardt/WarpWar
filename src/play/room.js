// A room (Phase 9c): one game held on the server. It runs the game loop; each player is a remote seat (a browser,
// through a remote controller) or a computer seat played on the server (strategy 'plan' or 'random'). No I/O:
// join(player, send) gives a remote seat its connection, and receive(player, message) takes what it sends.
//
// The game starts once every remote seat is taken: the first player is set from the settings (§4), and the
// second player's choice of side is the loop's first decision. After each accepted action every remote player is
// sent their own view of the game (D-039); once it is over, that is everything.
//
// The public log (Phase 9c-2): describe(before, action, after) returns the entries both players may read about an
// action ({ turn, text }; the page's logEntries). They are sent to every remote player as { type: 'log', entries },
// and a player who joins is sent the log so far. Actions themselves are never sent: they can hold secrets.
//
// Rejoining (Phase 9c-3): joining gives the seat a secret token, and rejoin(token, send) takes the seat back on a
// new connection, which is sent what it missed: the latest view, the decision waiting and the whole log. The
// seat's last connection is the one it keeps; an older one leaving takes nothing with it. The other players are
// told when a player drops and comes back ({ type: 'presence', player, connected }).

import { createGame, applyAction } from '../engine/game.js';
import { viewFor } from '../engine/view.js';
import { createGameLoop } from './loop.js';
import { createRemoteController } from './remote.js';
import { createComputerController, computerSeed, STRATEGIES, MAX_SEED } from './computer.js';

export const SEAT_KINDS = ['remote', ...STRATEGIES];

// settings: { map, scenario, modules, players: [p1, p2], first: player, seats: { [player]: SEAT_KINDS }, seed,
// describe, newToken }. Throws a RangeError for settings that do not make a game.
export function createRoom({
  map, scenario, modules = [], players, first, seats, seed, describe = () => [], newToken = () => globalThis.crypto.randomUUID(),
}) {
  const created = createGame({ map, scenario, players, modules });
  if (!seats || players.some((p) => !SEAT_KINDS.includes(seats[p]))) {
    throw new RangeError(`Each player's seat is ${SEAT_KINDS.join(', ')}`);
  }
  if (!players.some((p) => seats[p] === 'remote')) throw new RangeError('A room needs a remote player');
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) throw new RangeError(`A seed is a whole number from 0 to ${MAX_SEED}`);
  const firstAction = { type: 'setFirstPlayer', player: first };
  const r = applyAction(created, firstAction);
  if (!r.ok) throw new RangeError(r.message);
  const log = [...describe(created, firstAction, r.state)];

  const shown = { scenario, modules: [...modules], players: [...players], first, seats: { ...seats } };
  const controllers = Object.fromEntries(players.map((p, i) => [p,
    seats[p] === 'remote' ? createRemoteController() : createComputerController({ seed: computerSeed(seed, i), strategy: seats[p] })]));
  const remotes = players.filter((p) => seats[p] === 'remote');
  const taken = new Set();
  const tokens = new Map(); // token: player
  const sends = new Map(); // player: their connection's send, while connected
  let state = r.state;
  let loop = null;
  let failure = null;
  let finish;
  const done = new Promise((resolve) => {
    finish = resolve;
  });

  const showAll = (s) => {
    for (const p of remotes) controllers[p].show(viewFor(s, s.sides?.[p] ?? null));
  };

  const presence = (player, connected) => {
    for (const p of remotes) if (p !== player && sends.has(p)) controllers[p].tell({ type: 'presence', player, connected });
  };

  // Puts a connection in a seat: tells it where it is, then sends what it missed.
  function seat(player, send, token) {
    sends.set(player, send);
    const connected = Object.fromEntries(remotes.map((p) => [p, sends.has(p)]));
    send({ type: 'joined', player, settings: shown, token, connected });
    if (log.length > 0) send({ type: 'log', entries: [...log] });
    controllers[player].attach(send);
    presence(player, true);
  }

  function start() {
    showAll(state);
    loop = createGameLoop({
      state,
      controllers,
      onAction(before, action, after) {
        state = after;
        const entries = describe(before, action, after);
        log.push(...entries);
        if (entries.length > 0) for (const p of remotes) controllers[p].tell({ type: 'log', entries });
        showAll(after);
      },
    });
    // A game that stops on an error (a computer seat with no legal action, say) is over for the room: its
    // players are told, and done resolves with the state it stopped at.
    loop.run().then(finish, (e) => {
      failure = e;
      for (const p of remotes) controllers[p].error?.('GAME_STOPPED', `The game stopped: ${e.message}`);
      finish(state);
    });
  }

  return {
    settings: shown,
    get state() {
      return state;
    },
    get started() {
      return loop != null;
    },
    // For a player about to join: the settings, the remote seats still open, and whether play has started.
    info() {
      return { settings: shown, open: remotes.filter((p) => !taken.has(p)), started: loop != null };
    },
    // The remote players connected now.
    get connected() {
      return remotes.filter((p) => sends.has(p));
    },
    // The game has ended, or stopped on an error.
    get over() {
      return state.step === 'over' || failure != null;
    },
    // The error the game stopped on, if it did.
    get failure() {
      return failure;
    },
    // Resolves with the final state once the game is over.
    done,
    join(player, send) {
      if (!players.includes(player)) return { ok: false, code: 'UNKNOWN_PLAYER', message: `No player ${player} in this game` };
      if (seats[player] !== 'remote') return { ok: false, code: 'NOT_REMOTE', message: `${player} is played by the computer` };
      if (taken.has(player)) return { ok: false, code: 'SEAT_TAKEN', message: `${player} has already joined` };
      taken.add(player);
      const token = newToken();
      tokens.set(token, player);
      seat(player, send, token);
      if (!loop && taken.size === remotes.length) start();
      return { ok: true };
    },
    // Takes a seat back with its token, on a new connection.
    rejoin(token, send) {
      const player = tokens.get(token);
      if (!player) return { ok: false, code: 'BAD_TOKEN', message: 'That seat token is not for this game' };
      seat(player, send, token);
      return { ok: true, player };
    },
    // A player's connection is gone. Only the seat's latest connection counts: an older one leaving is ignored.
    leave(player, send) {
      if (!sends.has(player) || sends.get(player) !== send) return;
      sends.delete(player);
      controllers[player].detach();
      presence(player, false);
    },
    receive(player, message) {
      if (taken.has(player)) controllers[player].receive(message);
    },
    stop() {
      loop?.stop();
    },
  };
}
