// The computer opponent (Phase 9b). It is handed only viewFor(state, side), never the state, and holds no rules
// of its own: every action it takes is one applyAction accepts on a copy of its view.
//
// Strategies:
//   random: a random legal player (9b-1, 9b-2; random-player.js). For each decision it lists the candidate
//     actions and picks one at random among those the engine accepts.
//   plan: plays to win by rules of thumb (9b-3; planner.js). The planner proposes actions in order of preference
//     and the first the engine accepts is taken; if it has none, the computer plays as the random player.
// A seeded random number generator makes a given seed always play the same game.
//
// The copy: in combat, the other side's decision at the current stage counts as not yet made, even when the view
// shows it is in (as {}, D-039) or none is owed. So applyAction stops once it has checked this side's decision
// instead of going on to resolve the round with enemy records the view does not hold.

import { applyAction } from '../engine/game.js';
import { createRandom } from './random.js';
import { guess, randomCandidates } from './random-player.js';
import { plannedActions } from './planner.js';

export const STRATEGIES = ['random', 'plan'];

const other = (side) => (side === 'A' ? 'B' : 'A');

// Per combat stage: the decisions, and the list of sides that owe one (orders are owed by both).
const DECISIONS = { orders: ['orders', null], ecm: ['ecm', 'needEcm'], hits: ['allocations', 'needHits'] };

// The copy of the view the candidates are tried on (see above).
function board(view, side) {
  const copy = structuredClone(view);
  const c = copy.combat;
  if (!c || !DECISIONS[c.stage]) return copy;
  const [decided, owing] = DECISIONS[c.stage];
  c[decided][other(side)] = null;
  if (owing && !c[owing].includes(other(side))) c[owing] = [...c[owing], other(side)];
  return copy;
}

export function createComputerController({ seed, strategy = 'random' } = {}) {
  if (!STRATEGIES.includes(strategy)) throw new RangeError(`A strategy is ${STRATEGIES.join(' or ')}, not: ${strategy}`);
  const random = createRandom(seed);
  return {
    kind: 'computer',
    strategy,
    nextAction(view, { side, player }) {
      const tried = board(view, side);
      const accepts = (action) => applyAction(tried, action).ok;
      const ai = { view, tried, side, player, random, accepts };
      if (strategy === 'plan') {
        for (const action of plannedActions(ai)) if (action && accepts(action)) return action;
      }
      // A candidate is an action, or a function that guesses one. Picked at random; dropped if it has no legal action.
      const legal = (candidate) => (typeof candidate === 'function' ? guess(candidate, (a) => a != null && accepts(a)) : accepts(candidate) ? candidate : null);
      let left = randomCandidates(ai);
      while (left.length > 0) {
        const i = random.int(left.length);
        const action = legal(left[i]);
        if (action) return action;
        left = left.filter((_, j) => j !== i);
      }
      throw new Error(`The computer found no legal action for ${player} at ${view.step}${view.combat ? ` (${view.combat.stage})` : ''}`);
    },
  };
}
