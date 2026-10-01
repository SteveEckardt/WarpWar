// Who is at the screen and what they may see. D-039: a player sees their own ship records; of enemy ships
// only the counters (position, Warpship or Systemship, counter number). Everything is shown once the game is over.

// Engine ids carry the side so both players can have a W1: 'A-W1' is shown as 'W1'.
export const displayId = (id) => id.replace(/^[AB]-/, '');

export const playerOf = (state, side) => (state.sides ? state.players.find((p) => state.sides[p] === side) : null);

// The player whose private view the next decision needs, or null when it is made openly (setup) or nobody acts.
export function actor(state) {
  if (state.step === 'setup' || state.step === 'over' || !state.active) return null;
  return playerOf(state, state.active);
}

export function seesRecords(state, viewer, side) {
  if (state.step === 'over') return true;
  return viewer != null && state.sides?.[viewer] === side;
}
