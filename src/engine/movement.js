// Warpship movement validation: MP costs, forced stops, the first-turn base restriction.
// Rules: docs/rules/classic.md §6, §6.1, §6.2. Rulings: D-006, D-008, D-016, D-018 in docs/decisions.md.
// Systemship pickup and drop while moving: §6.2 items 3-4, D-017.

import { isHex, isAdjacent, sameHex, starAt, starById, hasWarpline } from './map.js';

export const FIRST_TURN = 1;

// A path is a list of steps, each costing 1 MP (§6.2):
//   { type: 'move', to: { q, r } }  one hex to an adjacent hex
//   { type: 'jump', to: starId }    the full length of a warpline, from one end star to the other
//   { type: 'pickup', ship: id }    take a friendly Systemship on this star hex aboard (1 MP)
//   { type: 'drop', ship: id }      leave a carried Systemship on this star hex (1 MP)
// Pickups and drops are allowed after a forced stop (D-017); a move or jump is not.
//
// ship: { owner, WG, PD, SR?, carrying?: { id: record } } (PD and SR are current, after damage).
// from: the hex it starts on.
// world: { turn, ships: [{ owner, q, r, id?, WG? }] } - game-turn and every counter on the map.
// A Systemship can be picked up only if its counter has an id and WG: false.
// Returns { errors, cost, end }: errors are { code, message, step? } (step is the index of the
// offending step), cost is the MP used, end is where the ship stops (null when the path is illegal).
// A path with a pickup or drop also returns cargo: { carried, pickups, drops }, the ids aboard at the end
// and each { ship, at } that happened. An empty path is legal and costs nothing.
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
  const carried = Object.keys(ship.carrying ?? {});
  const loose = world.ships.filter((s) => s.id != null);
  const pickups = [];
  const drops = [];
  let usedCargo = false;
  for (const [i, step] of steps.entries()) {
    if (step?.type === 'pickup' || step?.type === 'drop') {
      usedCargo = true;
      if (!starAt(map, here)) {
        error('NOT_A_STAR_HEX', 'Systemships may only be picked up or dropped off at a star hex (§6.2, §5.1)', i);
        break;
      }
      if (step.type === 'drop') {
        if (!carried.includes(step.ship)) {
          error('NOT_CARRIED', `${step.ship} is not aboard this Warpship`, i);
          break;
        }
        carried.splice(carried.indexOf(step.ship), 1);
        loose.push({ id: step.ship, owner: ship.owner, WG: false, q: here.q, r: here.r });
        drops.push({ ship: step.ship, at: { q: here.q, r: here.r } });
      } else {
        if ((ship.SR ?? 0) - carried.length < 1) {
          error('NO_FREE_RACK', 'A Warpship carries one Systemship per undamaged SR (§5.1)', i);
          break;
        }
        const at = loose.findIndex((s) => s.id === step.ship && s.owner === ship.owner && s.WG === false && sameHex(s, here));
        if (at < 0) {
          error('NO_SYSTEMSHIP_HERE', `No friendly Systemship ${step.ship} on this hex`, i);
          break;
        }
        loose.splice(at, 1);
        carried.push(step.ship);
        pickups.push({ ship: step.ship, at: { q: here.q, r: here.r } });
      }
      cost += 1; // §6.2 items 3-4
      continue;
    }
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
  const result = { errors, cost, end: errors.length === 0 ? here : null };
  return usedCargo ? { ...result, cargo: { carried, pickups, drops } } : result;
}
