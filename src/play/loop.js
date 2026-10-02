// The game loop: asks the acting player's controller for its next action, with that player's view of the game, and
// passes the action to applyAction. It holds the one real state; controllers only ever see views (D-039).
//
// Controllers belong to players, since a player has no side until the player moving second chooses one (§4). The
// loop starts once the first player is set: the side choice is its first decision, made with the public view.
// onAction(before, action, after) is called for each action the engine accepts, for whoever keeps the shared
// screen (the public log). run() resolves with the final state when nobody has a decision left to make, which
// is when the game is over.

import { applyAction } from '../engine/game.js';
import { actingPlayer, viewFor } from '../engine/view.js';

// controllers: { [player]: controller }, from controllers.js. Each is asked with nextAction(view, { side, player,
// rejection }), side null before sides are chosen.
export function createGameLoop({ state, controllers, onAction = () => {} }) {
  let current = state;
  let stopped = false;
  return {
    get state() {
      return current;
    },
    // Abandons the game: no further action is applied, and run() resolves.
    stop() {
      stopped = true;
    },
    async run() {
      let rejection = null;
      while (!stopped) {
        const player = actingPlayer(current);
        if (player == null) break;
        const side = current.sides?.[player] ?? null;
        const controller = controllers[player];
        const action = await controller.nextAction(viewFor(current, side), { side, player, rejection });
        if (stopped) break;
        const r = action?.player === player
          ? applyAction(current, action)
          : { ok: false, code: 'NOT_YOUR_SIDE', message: `This controller acts for ${player} only` };
        if (r.ok) {
          const before = current;
          current = r.state;
          rejection = null;
          onAction(before, action, current);
        } else {
          rejection = { code: r.code, message: r.message };
        }
        controller.outcome?.(r.ok ? { ok: true } : { ok: false, ...rejection });
      }
      return current;
    },
  };
}
