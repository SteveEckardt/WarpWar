// Who is at the screen and what they may see. D-039: a player sees their own ship records; of enemy ships
// only the counters (position, Warpship or Systemship, counter number). Everything is shown once the game is over.

import { actingSide } from '../engine/view.js';

// Engine ids carry the side so both players can have a W1: 'A-W1' is shown as 'W1'.
export const displayId = (id) => id.replace(/^[AB]-/, '');

// An engine message with its ship ids shown as counter names ('B-W1 takes 12 hits' -> 'W1 takes 12 hits').
export const plainIds = (message) => String(message).replace(/\b[AB]-([WS]\d+)\b/g, '$1');

export const playerOf = (state, side) => (state.sides ? state.players.find((p) => state.sides[p] === side) : null);

// The player whose private view the next decision needs, or null when it is made openly (setup) or nobody acts.
// In combat both players decide: orders, hits and retreats go phasing player first, then the other (§7).
export function actor(state) {
  const side = actingSide(state);
  return side ? playerOf(state, side) : null;
}

export function seesRecords(state, viewer, side) {
  if (state.step === 'over') return true;
  return viewer != null && state.sides?.[viewer] === side;
}

// D-039: a local player's private view waits behind a "pass to <player>" screen until they say they are at the
// screen. Only between two local players: kinds is { A, B } of controller kinds, or null before sides are chosen.
export function needsHandoff(state, kinds, viewer) {
  if (!state || kinds == null || !Object.values(kinds).every((k) => k === 'local')) return false;
  const next = actor(state);
  return next != null && viewer !== next;
}
