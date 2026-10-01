// Who is at the screen and what they may see. D-039: a player sees their own ship records; of enemy ships
// only the counters (position, Warpship or Systemship, counter number). Everything is shown once the game is over.

// Engine ids carry the side so both players can have a W1: 'A-W1' is shown as 'W1'.
export const displayId = (id) => id.replace(/^[AB]-/, '');

// An engine message with its ship ids shown as counter names ('B-W1 takes 12 hits' -> 'W1 takes 12 hits').
export const plainIds = (message) => String(message).replace(/\b[AB]-([WS]\d+)\b/g, '$1');

export const playerOf = (state, side) => (state.sides ? state.players.find((p) => state.sides[p] === side) : null);

// The player whose private view the next decision needs, or null when it is made openly (setup) or nobody acts.
// In combat both players decide: orders, hits and retreats go phasing player first, then the other (§7).
export function actor(state) {
  if (state.step === 'setup' || state.step === 'over' || !state.active) return null;
  const c = state.combat;
  if (state.step === 'combat' && c) {
    const order = [state.active, state.active === 'A' ? 'B' : 'A'];
    let side = state.active;
    if (c.stage === 'orders') side = order.find((sd) => !c.orders[sd]);
    else if (c.stage === 'hits') side = order.find((sd) => c.needHits.includes(sd) && !c.allocations[sd]);
    else if (c.stage === 'retreats') side = order.find((sd) => Object.values(c.retreating).some((sh) => sh.owner === sd));
    return side ? playerOf(state, side) : null;
  }
  return playerOf(state, state.active);
}

export function seesRecords(state, viewer, side) {
  if (state.step === 'over') return true;
  return viewer != null && state.sides?.[viewer] === side;
}
