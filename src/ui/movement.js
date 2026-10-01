// The Movement event (§3 event 3, §6): plan one Warpship's path a step at a time, then submit it as one 'move'
// action. Pure: no DOM. Every candidate step is judged by the engine (previewMove), so the UI offers exactly
// the steps the rules allow: MP (§6.2), forced stops (§6.1 rule 1), the first turn (D-008), the edge (D-040).

import { previewMove } from '../engine/game.js';
import { neighbors, starAt, starById } from '../engine/map.js';
import { esc } from './hexmap.js';
import { displayId } from './view.js';

// The side's Warpships on the map, in id order, and whether each has moved this turn.
export function movers(state, side) {
  return Object.entries(state.ships)
    .filter(([, sh]) => sh.owner === side && sh.WG)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([id, ship]) => ({ id, ship, moved: state.moved.includes(id) }));
}

// The hex a step leads to.
const stepEnd = (map, step) => (step.type === 'jump' ? (({ q, r }) => ({ q, r }))(starById(map, step.to)) : { ...step.to });

// The plan so far: { cost, mp, end, path: hexes from the start, targets: [{ step, to }], blocked }.
// blocked: why no further step is legal, in the engine's words, or null.
export function planInfo(state, id, steps) {
  const ship = state.ships[id];
  const start = { q: ship.q, r: ship.r };
  const path = [start, ...steps.map((s) => stepEnd(state.map, s))];
  const end = path[path.length - 1];
  const now = previewMove(state, id, steps);

  const candidates = neighbors(end).map((to) => ({ type: 'move', to }));
  const star = starAt(state.map, end);
  if (star) {
    for (const [a, b] of state.map.warplines) {
      if (a === star.id) candidates.push({ type: 'jump', to: b });
      else if (b === star.id) candidates.push({ type: 'jump', to: a });
    }
  }
  const targets = [];
  const reasons = [];
  for (const step of candidates) {
    const r = previewMove(state, id, [...steps, step]);
    if (r.errors.length === 0) targets.push({ step, to: stepEnd(state.map, step) });
    else reasons.push(r.errors[0]);
  }

  let blocked = null;
  if (targets.length === 0) {
    const stop = reasons.find((e) => e.code === 'MUST_STOP' || e.code === 'ZERO_PD');
    if (stop) blocked = stop.message;
    else if (now.cost >= ship.PD) blocked = `All ${ship.PD} MP used`;
    else blocked = reasons[0]?.message ?? null;
  }
  return { cost: now.cost, mp: ship.PD, end, path, targets, blocked };
}

const where = (state, hex) => {
  const star = starAt(state.map, hex);
  return star ? esc(star.name) : `space ${hex.q}, ${hex.r}`;
};

function stepLabel(state, step) {
  if (step.type === 'jump') return `Warpline to ${esc(starById(state.map, step.to).name)}`;
  return `To ${where(state, step.to)}`;
}

// ui: { plan: { ship, steps } | null, error }.
export function renderMovement(state, player, { plan, error }) {
  const side = state.sides[player];
  const out = [];
  out.push(`<h2>Movement</h2>`);

  if (plan) {
    const info = planInfo(state, plan.ship, plan.steps);
    const ship = state.ships[plan.ship];
    out.push(`<p class="meta">Moving <strong>${esc(displayId(plan.ship))}</strong> from ${where(state, ship)} · <strong>${info.cost} of ${info.mp} MP</strong> used</p>`);
    if (plan.steps.length === 0) {
      out.push(`<p class="hint">Click a highlighted hex on the map: a neighbouring hex, or a star at the far end of a warpline. Each step costs 1 MP.</p>`);
    } else {
      out.push(`<ol class="steps">${plan.steps.map((s) => `<li>${stepLabel(state, s)}</li>`).join('')}</ol>`);
    }
    if (info.blocked) out.push(`<p class="hint">No further steps: ${esc(info.blocked)}</p>`);
    if (error) out.push(`<p class="error" role="alert">${esc(error)}</p>`);
    out.push(`<div class="buttons">`);
    out.push(`<button type="button" class="primary" data-action="confirm-move"${plan.steps.length === 0 ? ' disabled' : ''}>Confirm move</button>`);
    out.push(`<button type="button" data-action="undo-step"${plan.steps.length === 0 ? ' disabled' : ''}>Undo step</button>`);
    out.push(`<button type="button" data-action="cancel-plan">Cancel</button>`);
    out.push(`</div>`);
    out.push(`<p class="hint">A confirmed move cannot be taken back.</p>`);
    return out.join('\n');
  }

  const ships = movers(state, side);
  if (ships.length === 0) {
    out.push(`<p class="hint">You have no Warpships on the map.</p>`);
  } else {
    out.push(`<table class="movers"><thead><tr><th>Ship</th><th>At</th><th>MP</th><th></th></tr></thead><tbody>`);
    for (const { id, ship, moved } of ships) {
      let action;
      if (moved) action = `<span class="hint">Moved</span>`;
      else if (ship.PD === 0) action = `<span class="hint">PD 0: cannot move</span>`;
      else action = `<button type="button" data-action="plan" data-id="${esc(id)}">Move</button>`;
      out.push(`<tr><th scope="row">${esc(displayId(id))}</th><td>${where(state, ship)}</td><td>${ship.PD}</td><td>${action}</td></tr>`);
    }
    out.push(`</tbody></table>`);
  }
  if (error) out.push(`<p class="error" role="alert">${esc(error)}</p>`);
  out.push(`<p class="hint">Move some, none or all of your Warpships, then end movement. Combat follows wherever enemy ships share a star.</p>`);
  out.push(`<button type="button" class="primary" data-action="end-movement">End movement</button>`);
  return out.join('\n');
}
