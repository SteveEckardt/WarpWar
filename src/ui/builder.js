// The Build event (§3 event 2, §5): new ships, and in Advanced repair and Missile resupply (§5.3). Pure logic and
// HTML strings, no DOM. The player drafts ships one at a time and marks repairs, then submits everything as one
// 'build' action. The engine decides what is legal: the builder shows its verdict as the player goes, by trying
// the action on the engine (applyAction never changes the state it is given).

import { applyAction, controlledBases, repairCandidates, SCENARIOS } from '../engine/game.js';
import { ATTRIBUTES, attributesFor, shipCost, techLevel, validateShip } from '../engine/ships.js';
import { esc } from './hexmap.js';
import { displayId, plainIds } from './view.js';

export const EMPTY_DESIGN = Object.freeze({ WG: true, PD: 0, B: 0, S: 0, T: 0, M: 0, SR: 0 });

const LABELS = { PD: 'Power/Drive', B: 'Beam', S: 'Screen', T: 'Tubes', M: 'Missiles', SR: 'Systemship Racks', A: 'Armor' };
const MISSILES_PER_BP = 3; // for showing the cost; the engine charges it
const ARMOR_REPAIR_PER_BP = 2; // fan §7.5, D-044; likewise

// The tech level of ships built now (§5.2), which sets the price of Armor (fan §10.2.2).
const levelNow = (state) => techLevel(state.scenario, state.turn);

// What the scenario and the game's modules let a player build, asked of the engine rather than restated.
export function buildOptions(scenario, modules = []) {
  return {
    systemships: validateShip({ WG: false, PD: 1 }, scenario, modules).length === 0,
    racks: validateShip({ WG: true, PD: 1, SR: 1 }, scenario, modules).length === 0,
    armor: validateShip({ WG: true, PD: 1, A: 1 }, scenario, modules).length === 0,
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

export const draftTotal = (drafts, level = 0) => drafts.reduce((sum, d) => sum + shipCost(d.design, level), 0);

// Only the attributes the design uses, so the engine sees what the player chose.
const compact = (design) => Object.fromEntries(Object.entries(design).filter(([k, v]) => (k === 'WG' ? v : v > 0)));

// Repairs and resupply without the zeros left in the form.
const cleanRepairs = (repairs = {}) => Object.fromEntries(
  Object.entries(repairs).map(([id, a]) => [id, Object.fromEntries(Object.entries(a).filter(([, n]) => n !== 0))]).filter(([, a]) => Object.keys(a).length > 0),
);
const cleanResupply = (resupply = {}) => Object.fromEntries(Object.entries(resupply).filter(([, n]) => n !== 0));

export function buildAction(player, drafts, repairs = {}, resupply = {}) {
  const action = { type: 'build', player, ships: drafts.map(({ id, design, at }) => ({ id, design: compact(design), at })) };
  const r = cleanRepairs(repairs);
  const m = cleanResupply(resupply);
  if (Object.keys(r).length > 0) action.repairs = r;
  if (Object.keys(m).length > 0) action.resupply = m;
  return action;
}

// What the Build event so far costs, and the engine's verdict on it: { ships, repairs, resupply, total, left,
// message }. message is null when the engine would accept the build as it stands.
export function buildCheck(state, player, { drafts = [], repairs = {}, resupply = {} }) {
  const side = state.sides[player];
  const ships = draftTotal(drafts, levelNow(state));
  // Armor is mended at 2 points per BP, pooled across ships (D-044); everything else at 1 point per BP.
  let armorPoints = 0;
  let points = 0;
  for (const a of Object.values(cleanRepairs(repairs))) {
    for (const [attr, n] of Object.entries(a)) {
      if (attr === 'A') armorPoints += Number(n) || 0;
      else points += Number(n) || 0;
    }
  }
  points += Math.ceil(armorPoints / ARMOR_REPAIR_PER_BP);
  const missiles = Object.values(cleanResupply(resupply)).reduce((sum, n) => sum + (Number(n) || 0), 0);
  const resupplyCost = Math.ceil(missiles / MISSILES_PER_BP);
  const total = ships + points + resupplyCost;
  const r = applyAction(state, buildAction(player, drafts, repairs, resupply));
  return { ships, repairs: points, resupply: resupplyCost, total, left: state.bp[side] - total, message: r.ok ? null : plainIds(r.message) };
}

// The totals, the engine's verdict and the button that ends the Build event. Re-rendered as the player types.
export function renderBuildCheck(state, player, ui) {
  const check = buildCheck(state, player, ui);
  const scenario = SCENARIOS[state.scenario];
  const parts = [`ships ${check.ships}`];
  if (scenario.repair) parts.push(`repair ${check.repairs}`, `Missiles ${check.resupply}`);
  const out = [];
  out.push(`<p class="total">Total ${check.total} BP (${parts.join(', ')}) · <strong>${check.left} BP left</strong></p>`);
  if (check.message) out.push(`<p class="hint">${esc(check.message)}</p>`);
  const label = scenario.spendAll ? 'Build these ships' : 'End Build event';
  out.push(`<button type="button" class="primary" data-action="build"${check.message ? ' disabled' : ''}>${label}</button>`);
  return out.join('\n');
}

const record = (design, modules) => attributesFor(modules).map((a) => `${a}=${design[a] ?? 0}`).join(', ');

// The cost of the design being edited, its errors, and the Add button. Re-rendered on every keystroke.
// committed: BP already marked for repair and resupply.
export function renderDesignSummary(state, side, design, drafts, committed = 0) {
  const left = state.bp[side] - draftTotal(drafts, levelNow(state)) - committed;
  const cost = shipCost(design, levelNow(state));
  const problems = validateShip(compact(design), state.scenario, state.modules).map((e) => e.message);
  if (problems.length === 0 && cost > left) problems.push(`Costs ${cost} BP, more than the ${left} BP left`);
  const out = [];
  out.push(`<p class="cost">This ship: <strong>${cost} BP</strong></p>`);
  if (problems.length > 0) out.push(`<ul class="problems">${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`);
  out.push(`<button type="button" data-action="add"${problems.length > 0 ? ' disabled' : ''}>Add ship</button>`);
  return out.join('\n');
}

const needsWork = (ship, modules) => attributesFor(modules).some((a) => (ship[a] ?? 0) < (ship.built?.[a] ?? 0));

// §5.3: the side's ships at its bases that are damaged or short of Missiles, with a field for each.
function renderRepairs(state, side, repairs, resupply) {
  const starName = (hex) => state.map.stars.find((s) => s.q === hex.q && s.r === hex.r)?.name ?? '';
  const out = [`<h3>Repair and resupply</h3>`];
  const ships = repairCandidates(state, side).filter(({ ship }) => needsWork(ship, state.modules));
  if (ships.length === 0) {
    out.push(`<p class="hint">None of your ships at your bases is damaged or short of Missiles.</p>`);
    return out.join('\n');
  }
  const armorNote = state.modules?.includes('armor') ? ' One BP repairs 2 points of Armor, across ships (D-044).' : '';
  out.push(`<p class="hint">One BP repairs one point, up to the strength the ship was built with. One BP resupplies up to 3 Missiles, across ships (§5.3).${armorNote}</p>`);
  out.push(`<form class="repairs" autocomplete="off">`);
  for (const { id, ship, carrier } of ships) {
    const where = carrier ? `carried by ${displayId(carrier)}` : `at ${starName(state.ships[id])}`;
    out.push(`<fieldset class="repair" data-ship="${esc(id)}"><legend>${esc(displayId(id))} · ${ship.WG ? 'Warpship' : 'Systemship'} · ${esc(where)}</legend><div class="powers">`);
    for (const a of attributesFor(state.modules)) {
      const missing = (ship.built?.[a] ?? 0) - (ship[a] ?? 0);
      if (missing <= 0) continue;
      const value = a === 'M' ? (resupply[id] ?? 0) : (repairs[id]?.[a] ?? 0);
      const label = a === 'M' ? `Missiles ${ship.M}/${ship.built.M}` : `${a} ${ship[a] ?? 0}/${ship.built[a]}`;
      out.push(`<label><span>${label}</span><input type="number" name="${a}" min="0" max="${missing}" step="1" value="${value}" inputmode="numeric"></label>`);
    }
    out.push(`</div></fieldset>`);
  }
  out.push(`</form>`);
  return out.join('\n');
}

// ui: { design, drafts: [{ id, design, at }], error, repairs: { id: { attr: n } }, resupply: { id: n } }.
export function renderBuilder(state, player, ui) {
  const { design, drafts, error } = ui;
  const repairs = ui.repairs ?? {};
  const resupply = ui.resupply ?? {};
  const side = state.sides[player];
  const scenario = SCENARIOS[state.scenario];
  const options = buildOptions(state.scenario, state.modules);
  const level = levelNow(state);
  const bases = state.bases[side];
  const controlled = controlledBases(state, side);
  const starName = (id) => state.map.stars.find((s) => s.id === id)?.name ?? id;
  const check = buildCheck(state, player, { drafts, repairs, resupply });
  const out = [];

  out.push(`<h2>Build ships</h2>`);
  const spending = scenario.spendAll ? 'they must all be spent in this Build event' : 'BP left unspent are saved for later turns';
  out.push(`<p class="meta">${esc(player)} (side ${side}) · <strong>${state.bp[side]} BP</strong> · ${spending} · ${esc(state.scenario)} scenario</p>`);

  out.push(`<form class="design" autocomplete="off">`);
  if (options.systemships) {
    out.push(`<label class="wg"><input type="checkbox" name="WG"${design.WG ? ' checked' : ''}> Warp Generator (5 BP): a Warpship</label>`);
  } else {
    out.push(`<p class="hint">Warpships only: every ship has a Warp Generator (5 BP).</p>`);
  }
  out.push(`<div class="attrs">`);
  for (const a of attributesFor(state.modules)) {
    if (a === 'SR' && !options.racks) continue;
    const per = a === 'M' ? '3 per BP' : a === 'A' ? `${2 + level} points per BP` : '1 BP each';
    out.push(`<label><span>${a}</span><input type="number" name="${a}" min="0" step="1" value="${design[a] ?? 0}" inputmode="numeric"><small>${LABELS[a]}, ${per}</small></label>`);
  }
  out.push(`</div>`);
  if (bases.length > 1) {
    // D-013: only bases with no enemy ships on them take new ships.
    const option = (id) => (controlled.includes(id)
      ? `<option value="${esc(id)}">${esc(starName(id))}</option>`
      : `<option value="${esc(id)}" disabled>${esc(starName(id))} (enemy ships here)</option>`);
    out.push(`<label class="at">Place at <select name="at">${bases.map(option).join('')}</select></label>`);
  } else {
    out.push(`<p class="hint">New ships are placed at ${esc(starName(bases[0]))}.</p>`);
  }
  out.push(`<div id="design-summary">${renderDesignSummary(state, side, design, drafts, check.repairs + check.resupply)}</div>`);
  out.push(`</form>`);

  out.push(`<h3>Ships to build</h3>`);
  if (drafts.length === 0) {
    out.push(`<p class="hint">None yet.</p>`);
  } else {
    out.push(`<table class="drafts"><tbody>`);
    for (const d of drafts) {
      out.push(`<tr><th scope="row">${esc(displayId(d.id))}</th><td class="rec">${record(d.design, state.modules)}<br><small>at ${esc(starName(d.at))}</small></td><td>${shipCost(d.design, level)} BP</td><td><button type="button" class="link" data-action="remove" data-id="${esc(d.id)}" aria-label="Remove ${esc(displayId(d.id))}">Remove</button></td></tr>`);
    }
    out.push(`</tbody></table>`);
  }
  if (scenario.repair) out.push(renderRepairs(state, side, repairs, resupply));
  if (error) out.push(`<p class="error" role="alert">${esc(error)}</p>`);
  out.push(`<div id="build-check">${renderBuildCheck(state, player, { drafts, repairs, resupply })}</div>`);
  return out.join('\n');
}
