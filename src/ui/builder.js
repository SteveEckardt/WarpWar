// The ship builder for a Build event (§3 event 2, §5.1): pure logic and HTML strings, no DOM.
// The player drafts ships one at a time, then submits them all as one 'build' action. The engine decides
// what is legal; the builder shows its costs and errors as the player goes.

import { ATTRIBUTES, shipCost, validateShip } from '../engine/ships.js';
import { esc } from './hexmap.js';
import { displayId } from './view.js';

export const EMPTY_DESIGN = Object.freeze({ WG: true, PD: 0, B: 0, S: 0, T: 0, M: 0, SR: 0 });

const LABELS = { PD: 'Power/Drive', B: 'Beam', S: 'Screen', T: 'Tubes', M: 'Missiles', SR: 'Systemship Racks' };

// What the scenario lets a player build, asked of the engine rather than restated (§4.1-4.3).
export function buildOptions(scenario) {
  return {
    systemships: validateShip({ WG: false, PD: 1 }, scenario).length === 0,
    racks: validateShip({ WG: true, PD: 1, SR: 1 }, scenario).length === 0,
  };
}

// §2: Warpship counters are W and a number, Systemships S and two digits. The id carries the side ('A-W1')
// so both players can have a W1. The lowest number not on the map, aboard a carrier, or already drafted.
export function nextShipId(state, side, drafts, warpship) {
  const used = new Set(drafts.map((d) => d.id));
  for (const [id, ship] of Object.entries(state.ships)) {
    used.add(id);
    for (const cid of Object.keys(ship.carrying ?? {})) used.add(cid);
  }
  const name = (n) => (warpship ? `${side}-W${n}` : `${side}-S${String(n).padStart(2, '0')}`);
  let n = 1;
  while (used.has(name(n))) n += 1;
  return name(n);
}

export const draftTotal = (drafts) => drafts.reduce((sum, d) => sum + shipCost(d.design), 0);

// Only the attributes the design uses, so the engine sees what the player chose.
const compact = (design) => Object.fromEntries(Object.entries(design).filter(([k, v]) => (k === 'WG' ? v : v > 0)));

export const buildAction = (player, drafts) => ({
  type: 'build',
  player,
  ships: drafts.map(({ id, design, at }) => ({ id, design: compact(design), at })),
});

const record = (design) => ATTRIBUTES.map((a) => `${a}=${design[a] ?? 0}`).join(', ');

// The cost of the design being edited, its errors, and the Add button. Re-rendered on every keystroke.
export function renderDesignSummary(state, side, design, drafts) {
  const left = state.bp[side] - draftTotal(drafts);
  const cost = shipCost(design);
  const problems = validateShip(compact(design), state.scenario).map((e) => e.message);
  if (problems.length === 0 && cost > left) problems.push(`Costs ${cost} BP, more than the ${left} BP left`);
  const out = [];
  out.push(`<p class="cost">This ship: <strong>${cost} BP</strong></p>`);
  if (problems.length > 0) out.push(`<ul class="problems">${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`);
  out.push(`<button type="button" data-action="add"${problems.length > 0 ? ' disabled' : ''}>Add ship</button>`);
  return out.join('\n');
}

// ui: { design, drafts: [{ id, design, at }], error }.
export function renderBuilder(state, player, { design, drafts, error }) {
  const side = state.sides[player];
  const options = buildOptions(state.scenario);
  const bases = state.bases[side];
  const total = draftTotal(drafts);
  const left = state.bp[side] - total;
  const starName = (id) => state.map.stars.find((s) => s.id === id)?.name ?? id;
  const out = [];

  out.push(`<h2>Build ships</h2>`);
  out.push(`<p class="meta">${esc(player)} (side ${side}) · <strong>${state.bp[side]} BP</strong> to spend · ${esc(state.scenario)} scenario</p>`);

  out.push(`<form class="design" autocomplete="off">`);
  if (options.systemships) {
    out.push(`<label class="wg"><input type="checkbox" name="WG"${design.WG ? ' checked' : ''}> Warp Generator (5 BP): a Warpship</label>`);
  } else {
    out.push(`<p class="hint">Warpships only: every ship has a Warp Generator (5 BP).</p>`);
  }
  out.push(`<div class="attrs">`);
  for (const a of ATTRIBUTES) {
    if (a === 'SR' && !options.racks) continue;
    const per = a === 'M' ? '3 per BP' : '1 BP each';
    out.push(`<label><span>${a}</span><input type="number" name="${a}" min="0" step="1" value="${design[a] ?? 0}" inputmode="numeric"><small>${LABELS[a]}, ${per}</small></label>`);
  }
  out.push(`</div>`);
  if (bases.length > 1) {
    out.push(`<label class="at">Place at <select name="at">${bases.map((id) => `<option value="${esc(id)}">${esc(starName(id))}</option>`).join('')}</select></label>`);
  } else {
    out.push(`<p class="hint">New ships are placed at ${esc(starName(bases[0]))}.</p>`);
  }
  out.push(`<div id="design-summary">${renderDesignSummary(state, side, design, drafts)}</div>`);
  out.push(`</form>`);

  out.push(`<h3>Ships to build</h3>`);
  if (drafts.length === 0) {
    out.push(`<p class="hint">None yet.</p>`);
  } else {
    out.push(`<table class="drafts"><tbody>`);
    for (const d of drafts) {
      out.push(`<tr><th scope="row">${esc(displayId(d.id))}</th><td class="rec">${record(d.design)}<br><small>at ${esc(starName(d.at))}</small></td><td>${shipCost(d.design)} BP</td><td><button type="button" class="link" data-action="remove" data-id="${esc(d.id)}" aria-label="Remove ${esc(displayId(d.id))}">Remove</button></td></tr>`);
    }
    out.push(`</tbody></table>`);
  }
  out.push(`<p class="total">Total ${total} BP · <strong>${left} BP left</strong></p>`);
  if (error) out.push(`<p class="error" role="alert">${esc(error)}</p>`);
  out.push(`<button type="button" class="primary" data-action="build"${drafts.length === 0 ? ' disabled' : ''}>Build these ships</button>`);
  return out.join('\n');
}
