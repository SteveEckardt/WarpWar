// A room (Phase 9c): one game held on the server. It runs the game loop; each player is a remote seat (a browser,
// through a remote controller) or a computer seat played on the server (strategy 'plan' or 'random'). No I/O:
// join(player, send) gives a remote seat its connection, and receive(player, message) takes what it sends.
//
// The game starts once every remote seat is taken: the first player is set from the settings (§4), and the
// second player's choice of side is the loop's first decision. After each accepted action every remote player is
// sent their own view of the game (D-039); once it is over, that is everything.

import { createGame, applyAction } from '../engine/game.js';
import { viewFor } from '../engine/view.js';
import { createGameLoop } from './loop.js';
import { createRemoteController } from './remote.js';
import { createComputerController, computerSeed, STRATEGIES, MAX_SEED } from './computer.js';

export const SEAT_KINDS = ['remote', ...STRATEGIES];

// settings: { map, scenario, modules, players: [p1, p2], first: player, seats: { [player]: SEAT_KINDS }, seed }.
// Throws a RangeError for settings that do not make a game.
export function createRoom({ map, scenario, modules = [], players, first, seats, seed }) {
  const created = createGame({ map, scenario, players, modules });
  if (!seats || players.some((p) => !SEAT_KINDS.includes(seats[p]))) {
    throw new RangeError(`Each player's seat is ${SEAT_KINDS.join(', ')}`);
  }
  if (!players.some((p) => seats[p] === 'remote')) throw new RangeError('A room needs a remote player');
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) throw new RangeError(`A seed is a whole number from 0 to ${MAX_SEED}`);
  const r = applyAction(created, { type: 'setFirstPlayer', player: first });
  if (!r.ok) throw new RangeError(r.message);

  const shown = { scenario, modules: [...modules], players: [...players], first, seats: { ...seats } };
  const controllers = Object.fromEntries(players.map((p, i) => [p,
    seats[p] === 'remote' ? createRemoteController() : createComputerController({ seed: computerSeed(seed, i), strategy: seats[p] })]));
  const remotes = players.filter((p) => seats[p] === 'remote');
  const taken = new Set();
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

  function start() {
    showAll(state);
    loop = createGameLoop({
      state,
      controllers,
      onAction(before, action, after) {
        state = after;
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
      send({ type: 'joined', player, settings: shown });
      controllers[player].attach(send);
      if (!loop && taken.size === remotes.length) start();
      return { ok: true };
    },
    // The player's connection is gone. Phase 9c-1: the seat stays taken (rejoining is 9c-3).
    leave(player) {
      controllers[player]?.detach?.();
    },
    receive(player, message) {
      if (taken.has(player)) controllers[player].receive(message);
    },
    stop() {
      loop?.stop();
    },
  };
}
