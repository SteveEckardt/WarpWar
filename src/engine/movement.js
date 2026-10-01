// Warpship movement validation: MP costs, forced stops, the first-turn base restriction.
// Rules: docs/rules/classic.md §6, §6.1, §6.2. Rulings: D-006, D-008, D-016, D-018 in docs/decisions.md.
// Not built yet: picking up and dropping Systemships while moving (§6.2 items 3-4, D-017, phase 5b).

import { isHex, isAdjacent, starAt, starById, hasWarpline } from './map.js';

export const FIRST_TURN = 1;

// A path is a list of steps, each costing 1 MP (§6.2):
//   { type: 'move', to: { q, r } }  one hex to an adjacent hex
//   { type: 'jump', to: starId }    the full length of a warpline, from one end star to the other
//
// ship: { owner, WG, PD } (PD is current, after damage). from: the hex it starts on.
// world: { turn, ships: [{ owner, q, r }] } - game-turn and every counter on the map.
// Returns { errors, cost, end }: errors are { code, message, step? } (step is the index of the
// offending step), cost is the MP used, end is where the ship stops (null when the path is illegal).
// An empty path is legal and costs nothing.
export function validateMove(map, ship, from, steps, world) {
  if (!isHex(from)) throw new RangeError('Start must be a hex { q, r }');
  if (!Number.isInteger(world.turn) || world.turn < 1) {
    throw new RangeError(`Turn must be a positive integer: ${world.turn}`);
  }
  const errors = [];
  const error = (code, message, step) => errors.push({ code, message, ...(step === undefined ? {} : { step }) });

  if (steps.length > 0) {
    if (!ship.WG) error('SYSTEMSHIP_MOVE', 'Systemships cannot move on their own (§2)');
    else if (ship.PD === 0) error('ZERO_PD', 'A Warpship whose PD is 0 may not move (§6.1 rule 4)');
  }

  const enemyAt = (hex) => world.ships.some((s) => s.owner !== ship.owner && s.q === hex.q && s.r === hex.r);
  let here = from;
  let cost = 0;
  let mustStop = false;
  for (const [i, step] of steps.entries()) {
    if (mustStop) {
      error('MUST_STOP', 'A Warpship must stop on a star hex occupied by an enemy ship (§6.1 rule 1)', i);
      break;
    }
    let to;
    if (step?.type === 'move') {
      if (!isHex(step.to)) {
        error('BAD_STEP', 'A move needs a destination hex { q, r }', i);
        break;
      }
      if (!isAdjacent(here, step.to)) {
        error('NOT_ADJACENT', 'A move goes to an adjacent hex', i);
        break;
      }
      to = { q: step.to.q, r: step.to.r };
    } else if (step?.type === 'jump') {
      const origin = starAt(map, here);
      const target = typeof step.to === 'string' ? starById(map, step.to) : null;
      if (!origin) {
        error('NOT_A_STAR_HEX', 'A warpline can only be entered at a star at one of its ends (D-006)', i);
        break;
      }
      if (!target || !hasWarpline(map, origin.id, target.id)) {
        error('NO_WARPLINE', `No warpline from ${origin.id} to ${step.to}`, i);
        break;
      }
      to = { q: target.q, r: target.r };
    } else {
      error('BAD_STEP', `Unknown step type: ${step?.type}`, i);
      break;
    }

    cost += 1;
    here = to;
    const star = starAt(map, here);
    if (world.turn === FIRST_TURN && star?.baseOwner != null && star.baseOwner !== ship.owner) {
      error('FIRST_TURN_BASE', 'Ships may not move onto an enemy base star hex on the first turn (D-008)', i);
      break;
    }
    // Space hexes with enemy ships can be passed through or ended in (D-016); stars cannot (§6.1 rule 1).
    if (star && enemyAt(here)) mustStop = true;
  }

  if (cost > ship.PD) error('OVER_MP', `Path costs ${cost} MP but PD is ${ship.PD}`);
  return { errors, cost, end: errors.length === 0 ? here : null };
}
