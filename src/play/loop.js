// The game loop: asks the acting side's controller for its next action, with that side's view of the game, and
// passes the action to applyAction. It holds the one real state; controllers only ever see views (D-039).
//
// It starts once sides are chosen. Setup (§4) is decided openly, before either side has a controller.
// onAction(before, action, after) is called for each action the engine accepts, for whoever keeps the shared
// screen (the public log). run() resolves with the final state when nobody has a decision left to make, which
// is when the game is over.

import { applyAction } from '../engine/game.js';
import { actingSide, viewFor } from '../engine/view.js';

// controllers: { A, B }, from controllers.js.
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
        const side = actingSide(current);
        if (side == null) break;
        const controller = controllers[side];
        const action = await controller.nextAction(viewFor(current, side), { side, rejection });
        if (stopped) break;
        const player = current.players.find((p) => current.sides[p] === side);
        const r = action?.player === player
          ? applyAction(current, action)
          : { ok: false, code: 'NOT_YOUR_SIDE', message: `Side ${side} acts for ${player} only` };
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
