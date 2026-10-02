// Systemship pickup and drop after combat (§3 event 5, §8): a free rearrangement at each star hex where the
// phasing player has a Warpship with racks and Systemships. Pure: HTML strings, no DOM. The engine checks
// every rearrangement; the screen tries the action on the engine and shows its verdict.

import { applyAction } from '../engine/game.js';
import { starById } from '../engine/map.js';
import { esc } from './hexmap.js';
import { displayId, plainIds } from './view.js';

const at = (sh, star) => sh.q === star.q && sh.r === star.r;
const byId = ([a], [b]) => a.localeCompare(b, undefined, { numeric: true });

// The side's ships at a star: its Warpships with racks, and every Systemship there, loose or carried.
function cargoAt(state, starId, side) {
  const star = starById(state.map, starId);
  const here = Object.entries(state.ships).filter(([, sh]) => sh.owner === side && at(sh, star)).sort(byId);
  const carriers = here.filter(([, sh]) => sh.WG && sh.SR > 0).map(([id]) => id);
  const loads = {};
  for (const [id, sh] of here) {
    if (!sh.WG) loads[id] = null;
    for (const cid of Object.keys(sh.carrying ?? {})) loads[cid] = id;
  }
  return { carriers, loads };
}

// The stars where the side has something to rearrange, in map order.
export function rearrangeStars(state, side) {
  return state.map.stars
    .filter((star) => {
      const { carriers, loads } = cargoAt(state, star.id, side);
      return carriers.length > 0 && Object.keys(loads).length > 0;
    })
    .map((star) => star.id);
}

// Who carries each of the side's Systemships at the star now: { systemshipId: warpshipId | null }.
export const currentLoads = (state, starId, side) => cargoAt(state, starId, side).loads;

// loads: { systemshipId: warpshipId | null }. Every Warpship with racks at the star gets its new load.
export function rearrangeAction(player, starId, loads, carriers = null) {
  const names = carriers ?? [...new Set(Object.values(loads).filter(Boolean))];
  const assignment = Object.fromEntries(names.map((w) => [w, Object.keys(loads).filter((s) => loads[s] === w).sort()]));
  return { type: 'rearrange', player, star: starId, assignment };
}

const actionFor = (state, player, starId, loads) =>
  rearrangeAction(player, starId, loads, cargoAt(state, starId, state.sides[player]).carriers);

// The engine's objection to a rearrangement, or null.
export function rearrangeCheck(state, player, starId, loads) {
  const r = applyAction(state, actionFor(state, player, starId, loads));
  return r.ok ? null : plainIds(r.message);
}

export { actionFor as rearrangeActionAt };

// The End of turn panel. drafts: { starId: loads } being edited; error: the last rejection.
export function renderRearrange(state, player, drafts, error) {
  const side = state.sides[player];
  const out = [`<h2>End of turn</h2>`];
  const stars = rearrangeStars(state, side);
  if (stars.length === 0) {
    out.push(`<p class="hint">Movement and combat are over for this turn.</p>`);
  } else {
    out.push(`<p>Before ending the turn you may move your Systemships between Warpships, or put them down, at any star where you have both (§8). It costs no movement.</p>`);
    for (const starId of stars) {
      const star = starById(state.map, starId);
      const { carriers } = cargoAt(state, starId, side);
      const loads = drafts[starId] ?? currentLoads(state, starId, side);
      out.push(`<form class="rearrange" data-star="${esc(starId)}" autocomplete="off"><h3>${esc(star.name)}</h3>`);
      for (const sid of Object.keys(loads).sort()) {
        const options = [`<option value=""${loads[sid] == null ? ' selected' : ''}>Left on ${esc(star.name)}</option>`]
          .concat(carriers.map((w) => `<option value="${esc(w)}"${loads[sid] === w ? ' selected' : ''}>${esc(displayId(w))}</option>`));
        out.push(`<label>${esc(displayId(sid))}: carried by <select name="${esc(sid)}">${options.join('')}</select></label>`);
      }
      const problem = drafts[starId] ? rearrangeCheck(state, player, starId, loads) : null;
      if (problem) out.push(`<p class="hint">${esc(problem)}</p>`);
      out.push(`<button type="button" data-action="apply-rearrange" data-star="${esc(starId)}"${problem ? ' disabled' : ''}>Rearrange at ${esc(star.name)}</button>`);
      out.push(`</form>`);
    }
  }
  if (error) out.push(`<p class="error" role="alert">${esc(error)}</p>`);
  out.push(`<button type="button" class="primary" data-action="end-turn">End turn</button>`);
  return out.join('\n');
}
