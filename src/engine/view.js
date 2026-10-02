// Whose decision is next, and what one side may see of the game. Rulings: D-039 in docs/decisions.md.
//
// viewFor(state, side) is the state as that side's player sees it: plain data, a copy, the same shape as the
// state, so the same code can read either. side null is the public view, what both players see together.
// A controller (src/play/) is only ever handed a view.

// The side whose decision the game is waiting for, or null when nobody's is (setup is decided openly; the game
// may be over). In combat both sides decide: orders, ECM, hits and retreats go phasing side first, then the
// other (§7). A forced withdrawal is the phasing side's.
export function actingSide(state) {
  if (state.step === 'setup' || state.step === 'over' || !state.active) return null;
  const c = state.combat;
  if (state.step === 'combat' && c) {
    const order = [state.active, state.active === 'A' ? 'B' : 'A'];
    if (c.stage === 'orders') return order.find((sd) => !c.orders[sd]) ?? null;
    if (c.stage === 'ecm') return order.find((sd) => c.needEcm.includes(sd) && !c.ecm[sd]) ?? null;
    if (c.stage === 'hits') return order.find((sd) => c.needHits.includes(sd) && !c.allocations[sd]) ?? null;
    if (c.stage === 'retreats') return order.find((sd) => Object.values(c.retreating).some((sh) => sh.owner === sd)) ?? null;
  }
  return state.active;
}

// D-039: an enemy ship is its counter: position (on the map), Warpship or Systemship, and the counter number,
// which is its id. Its cargo is not on the map. In combat its tech level is shown as well: it is revealed with
// the orders (D-055).
const counter = ({ owner, WG, q, r }) => ({ owner, WG, ...(q != null ? { q, r } : {}) });
const combatCounter = (ship) => ({ ...counter(ship), level: ship.level });

export function viewFor(state, side) {
  const view = structuredClone(state);
  // All records are shown when the game is over (D-039).
  if (state.step === 'over') return view;
  const hidden = (owner) => owner !== side;
  const redact = (ships, as) => Object.fromEntries(Object.entries(ships).map(([id, sh]) => [id, hidden(sh.owner) ? as(sh) : sh]));

  view.ships = redact(view.ships, counter);
  // D-039: enemy Build Point spending is not shown, so neither is what is left.
  view.bp = Object.fromEntries(Object.entries(view.bp).map(([sd, bp]) => [sd, hidden(sd) ? null : bp]));

  const c = view.combat;
  if (c) {
    c.hex.ships = redact(c.hex.ships, combatCounter);
    c.retreating = redact(c.retreating, counter);
    // Orders and ECM are shown once both are in (§7 step 2; the round report). Where a side takes its hits
    // stays on its own records (§7.2.2, D-039).
    // An enemy decision not yet shown is an empty object: known to be in, not what it says.
    const conceal = (bySide) => Object.fromEntries(Object.entries(bySide).map(([sd, d]) => [sd, hidden(sd) && d ? {} : d]));
    if (c.stage === 'orders') c.orders = conceal(c.orders);
    if (c.stage === 'ecm') c.ecm = conceal(c.ecm);
    c.allocations = conceal(c.allocations);
  }
  return view;
}
