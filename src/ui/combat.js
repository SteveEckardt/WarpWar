// The Combat event (§3 event 4, §7): choosing the star, secret orders, the public round report, hit
// allocation, and placing escaped or withdrawing ships. Pure: HTML strings, no DOM. The engine judges every
// order and allocation; the UI shows its objections as the player writes.
// D-039 and §7 step 2: orders are secret until both are in, then shown to both players with every shot and the
// effective hits on each ship. Where an owner takes hits is on their own record and is never shown to the enemy.

import { SIDES, previewDestination } from '../engine/game.js';
import { validateOrders, hitsOwed, checkHitAllocation, QUIET_ROUNDS_TO_WITHDRAW } from '../engine/combat.js';
import { ATTRIBUTES } from '../engine/ships.js';
import { MISSILES_PER_HIT } from '../engine/damage.js';
import { neighbors, onMap, starById } from '../engine/map.js';
import { esc } from './hexmap.js';
import { displayId, playerOf, plainIds } from './view.js';

const TACTIC_WORD = { attack: 'ATTACK', dodge: 'DODGE', retreat: 'RETREAT' };
const TACTIC_NAME = { attack: 'Attack', dodge: 'Dodge', retreat: 'Retreat' };

// An order as the rulebook writes it (§7.1.2, §7.1.3): one line for the ship, one per Missile.
export function orderText(id, ship, order) {
  const target = order.beamTarget != null ? displayId(order.beamTarget) : null;
  const verb = order.tactic === 'attack' && target ? `ATTACKS ${target}` : TACTIC_WORD[order.tactic] + (target ? `, Beam at ${target}` : '');
  const power = ['D', 'B', 'S', 'T'].map((k) => `${k}=${order[k] ?? 0}`).join(', ');
  const lines = [`${displayId(id)} (Level ${ship.level ?? 0}) ${verb}: ${power}.`];
  for (const m of order.missiles ?? []) lines.push(`M at ${displayId(m.target)}: D=${m.drive}.`);
  return lines;
}

// A ship named for both players: whose it is, and its counter (both sides can have a W1).
const tag = (state, side, id) => `<b class="ship-tag side-${side}">${esc(playerOf(state, side) ?? `Side ${side}`)}'s ${esc(displayId(id))}</b>`;
const ownShips = (state, side) =>
  Object.entries(state.combat.hex.ships).filter(([, sh]) => sh.owner === side).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
const enemyShips = (state, side) => ownShips(state, side === 'A' ? 'B' : 'A');

const header = (state) => {
  const c = state.combat;
  const star = starById(state.map, c.star);
  const round = c.stage === 'retreats' || c.stage === 'withdraw' ? `After round ${c.round - 1}` : `Round ${c.round}`;
  return `<h2>Combat at ${esc(star.name)}</h2><p class="meta">${round} · ${c.hex.quietRounds} of ${QUIET_ROUNDS_TO_WITHDRAW} rounds in a row without effective hits</p>`;
};

// --- choosing the star ---

export function renderChoose(state) {
  const out = [`<h2>Combat</h2>`, `<p>Ships of both sides share ${state.contested.length === 1 ? 'a star' : 'these stars'}. Choose which combat to resolve next.</p>`];
  for (const id of state.contested) {
    out.push(`<button type="button" class="primary" data-action="choose-combat" data-star="${esc(id)}">Combat at ${esc(starById(state.map, id).name)}</button>`);
  }
  return out.join('\n');
}

// --- orders ---

export function blankOrders(state, side) {
  return Object.fromEntries(ownShips(state, side).map(([id]) => [id, { tactic: 'attack', D: 0, B: 0, S: 0, T: 0 }]));
}

// The engine's objections to one side's orders, for that side's ships: [{ ship, message }].
export function orderProblems(state, side, orders) {
  const c = state.combat;
  // validateOrders wants an order for every ship; the enemy's stand-ins are blank and their problems ignored.
  const all = { ...blankOrders(state, side === 'A' ? 'B' : 'A'), ...orders };
  return validateOrders(c.hex, all)
    .filter((e) => c.hex.ships[e.ship]?.owner === side)
    .map(({ ship, message }) => ({ ship, message: plainIds(message) }));
}

const num = (name, value, max, label) =>
  `<label><span>${label}</span><input type="number" name="${name}" min="0" ${max != null ? `max="${max}"` : ''} step="1" value="${value ?? 0}" inputmode="numeric"></label>`;

function orderForm(state, id, ship, order, enemies) {
  const out = [];
  out.push(`<fieldset class="order" data-ship="${esc(id)}">`);
  out.push(`<legend>${esc(displayId(id))} · ${ship.WG ? 'Warpship' : 'Systemship'} · PD ${ship.PD}, B ${ship.B}, S ${ship.S}, T ${ship.T}, M ${ship.M}</legend>`);
  out.push(`<div class="tactics">`);
  for (const t of ['attack', 'dodge', 'retreat']) {
    const off = t === 'retreat' && !ship.WG;
    out.push(`<label><input type="radio" name="tactic-${esc(id)}" value="${t}"${order.tactic === t ? ' checked' : ''}${off ? ' disabled' : ''}> ${TACTIC_NAME[t]}</label>`);
  }
  out.push(`</div>`);
  out.push(`<div class="powers">${num('D', order.D, null, 'Drive')}${num('B', order.B, ship.B, 'Beam')}${num('S', order.S, ship.S, 'Screen')}${num('T', order.T, ship.T, 'Tubes')}</div>`);
  const options = (selected) => enemies.map(([eid]) => `<option value="${esc(eid)}"${selected === eid ? ' selected' : ''}>${esc(displayId(eid))}</option>`).join('');
  if (ship.B > 0) {
    out.push(`<label class="target">Beam target <select name="beamTarget"><option value="">None</option>${options(order.beamTarget)}</select></label>`);
  }
  if (ship.T > 0 && ship.M > 0) {
    out.push(`<div class="missiles">`);
    for (const [i, m] of (order.missiles ?? []).entries()) {
      out.push(`<div class="missile" data-index="${i}">Missile at <select name="missileTarget">${options(m.target)}</select> ${num('drive', m.drive, null, 'Drive')} <button type="button" class="link" data-action="remove-missile" data-ship="${esc(id)}" data-index="${i}">Remove</button></div>`);
    }
    out.push(`<button type="button" data-action="add-missile" data-ship="${esc(id)}">Add Missile</button>`);
    out.push(`</div>`);
  }
  out.push(`</fieldset>`);
  return out.join('\n');
}

// The power used by each order and the engine's objections; refreshed as the player types.
export function renderOrderCheck(state, side, orders) {
  const problems = orderProblems(state, side, orders);
  const out = [];
  out.push(`<ul class="power-used">`);
  for (const [id, ship] of ownShips(state, side)) {
    const o = orders[id] ?? {};
    const used = ['D', 'B', 'S', 'T'].reduce((sum, k) => sum + (Number(o[k]) || 0), 0);
    out.push(`<li>${esc(displayId(id))}: power ${used} of ${ship.PD}</li>`);
  }
  out.push(`</ul>`);
  if (problems.length > 0) out.push(`<ul class="problems">${problems.map((p) => `<li>${esc(displayId(p.ship))}: ${esc(p.message)}</li>`).join('')}</ul>`);
  out.push(`<button type="button" class="primary" data-action="submit-orders"${problems.length > 0 ? ' disabled' : ''}>Submit orders</button>`);
  return out.join('\n');
}

export function renderOrders(state, player, orders) {
  const side = state.sides[player];
  const enemies = enemyShips(state, side);
  const out = [header(state)];
  out.push(`<p>${esc(player)}, write an order for each of your ships. Your opponent sees them only when both of you have finished (§7).</p>`);
  out.push(`<p class="hint">Enemy ships here: ${enemies.map(([id]) => esc(displayId(id))).join(', ')}.</p>`);
  out.push(`<form class="orders" autocomplete="off">`);
  for (const [id, ship] of ownShips(state, side)) out.push(orderForm(state, id, ship, orders[id] ?? blankOrders(state, side)[id], enemies));
  out.push(`</form>`);
  out.push(`<div id="order-check">${renderOrderCheck(state, side, orders)}</div>`);
  return out.join('\n');
}

// --- the public report (§7 step 2) ---

function resultText(shot) {
  if (shot.result === 'miss') return 'Miss';
  if (shot.result === 'escapes') return 'Escapes';
  return shot.bonus > 0 ? `Hit +${shot.bonus}` : 'Hit';
}

// Every order, every shot with its CRT row, and the hits on each ship. orders: { id: order }; ships: { id: record }.
function reportBody(state, ships, orders, shots, damage) {
  const out = [];
  out.push(`<h4>Orders</h4>`);
  for (const side of SIDES) {
    const ids = Object.keys(orders).filter((id) => ships[id]?.owner === side).sort();
    if (ids.length === 0) continue;
    out.push(`<p class="orders-text side-${side}"><strong>Side ${side} · ${esc(playerOf(state, side) ?? '')}</strong><br>${ids.map((id) => orderText(id, ships[id], orders[id]).map(esc).join('<br>')).join('<br>')}</p>`);
  }
  out.push(`<h4>Fire</h4>`);
  if (shots.length === 0) out.push(`<p class="hint">Nobody fired.</p>`);
  else {
    out.push(`<ul class="shots">`);
    const missileIndex = {};
    for (const s of shots) {
      const from = orders[s.from];
      const to = orders[s.to];
      let drive = from.D ?? 0;
      let weapon = 'Beam';
      let tactic = from.tactic;
      if (s.weapon === 'missile') {
        const i = missileIndex[s.from] ?? 0;
        missileIndex[s.from] = i + 1;
        drive = from.missiles[i].drive;
        weapon = 'Missile';
        tactic = 'attack';
      }
      const diff = drive - (to.D ?? 0);
      out.push(`<li>${tag(state, ships[s.from].owner, s.from)} → ${tag(state, ships[s.to].owner, s.to)}: ${weapon}, ${TACTIC_NAME[tactic]} vs ${TACTIC_NAME[to.tactic]}, Drive ${diff > 0 ? '+' : ''}${diff}: <strong>${resultText(s)}</strong>${s.damage > 0 ? `, ${s.damage} hits` : ''}</li>`);
    }
    out.push(`</ul>`);
  }
  out.push(`<h4>Hits taken</h4><ul class="damage">`);
  for (const [id, d] of Object.entries(damage).sort()) {
    if (!ships[id]) continue;
    out.push(`<li>${tag(state, ships[id].owner, id)}: ${d.total} hits, ${d.absorbed} absorbed by Screens, <strong>${d.effective} effective</strong></li>`);
  }
  out.push(`</ul>`);
  return out.join('\n');
}

// A report the players have not both seen yet, or null. seen: a Set of report keys already shown.
// After a round: its full result. During the hits stage: the orders and fire, before hits are taken.
export function pendingReport(state, seen) {
  const last = state.lastRound;
  if (last) {
    const key = `round:${last.star}:${last.round}`;
    if (!seen.has(key) && last.orders) {
      const ships = last.ships;
      const star = starById(state.map, last.star);
      const out = [`<h3>Round ${last.round} at ${esc(star.name)}</h3>`, reportBody(state, ships, last.orders, last.shots, last.damage)];
      out.push(`<h4>Result</h4><ul>`);
      out.push(last.destroyed.length > 0 ? `<li>Destroyed: ${last.destroyed.map((id) => tag(state, last.ships[id]?.owner, id)).join(', ')}</li>` : `<li>No ship destroyed.</li>`);
      if (last.escaped.length > 0) out.push(`<li>Escaped from the star: ${last.escaped.map((id) => tag(state, last.ships[id]?.owner, id)).join(', ')}</li>`);
      if (last.end) out.push(`<li>Combat over: ${esc(endText(last.end))}.</li>`);
      else out.push(`<li>${last.quietRounds} of ${QUIET_ROUNDS_TO_WITHDRAW} rounds in a row without effective hits.</li>`);
      out.push(`</ul>`);
      return { key, html: out.join('\n') };
    }
  }
  const c = state.combat;
  if (state.step === 'combat' && c?.stage === 'hits') {
    const key = `orders:${c.star}:${c.round}`;
    if (seen.has(key)) return null;
    const orders = { ...c.orders.A, ...c.orders.B };
    const { shots, damage } = hitsOwed(c.hex, orders);
    const star = starById(state.map, c.star);
    return { key, html: [`<h3>Round ${c.round} at ${esc(star.name)}: orders revealed</h3>`, reportBody(state, c.hex.ships, orders, shots, damage)].join('\n') };
  }
  return null;
}

function endText(end) {
  const sides = (end.owners ?? []).map((o) => `side ${o}`).join(' and ');
  if (end.reason === 'forced withdrawal') return `three rounds without effective hits; the phasing player must withdraw (§7 step 6(c))`;
  if (end.reason === 'all destroyed') return `all ships of ${sides} destroyed`;
  if (end.reason === 'all escaped') return `all ships of ${sides} escaped`;
  return `${sides} has no ships left here`;
}

// --- hits (§7.2.2) ---

const allOrders = (c) => ({ ...c.orders.A, ...c.orders.B });

// The ships of a side that must take hits this round, with how many: [{ id, owed, ship }]. Private to the owner.
export function hitsToTake(state, side) {
  const c = state.combat;
  const orders = allOrders(c);
  return Object.entries(c.owed)
    .filter(([id, n]) => n > 0 && c.hex.ships[id].owner === side)
    .map(([id, owed]) => {
      const fired = (orders[id].missiles ?? []).length;
      return { id, owed, ship: { ...c.hex.ships[id], M: c.hex.ships[id].M - fired } };
    });
}

// The engine's objections to a side's hit allocations: [{ ship, message }].
export function hitProblems(state, side, allocations) {
  const c = state.combat;
  const problems = [];
  for (const { id } of hitsToTake(state, side)) {
    try {
      checkHitAllocation(c.hex, allOrders(c), id, allocations[id] ?? {});
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      problems.push({ ship: id, message: plainIds(e.message) });
    }
  }
  return problems;
}

export function renderHitCheck(state, side, allocations) {
  const problems = hitProblems(state, side, allocations);
  const out = [];
  // The engine's allocation messages already name the ship.
  if (problems.length > 0) out.push(`<ul class="problems">${problems.map((p) => `<li>${esc(p.message)}</li>`).join('')}</ul>`);
  out.push(`<button type="button" class="primary" data-action="submit-hits"${problems.length > 0 ? ' disabled' : ''}>Take these hits</button>`);
  return out.join('\n');
}

export function renderHits(state, player, allocations) {
  const side = state.sides[player];
  const out = [header(state)];
  out.push(`<p>${esc(player)}, choose where your ships take their hits (§7.2.2). One hit removes one point, or 3 Missiles. Your opponent does not see this.</p>`);
  out.push(`<form class="hits" autocomplete="off">`);
  for (const { id, owed, ship } of hitsToTake(state, side)) {
    const a = allocations[id] ?? {};
    out.push(`<fieldset class="hit" data-ship="${esc(id)}"><legend><strong>${esc(displayId(id))}</strong> must take <strong>${owed} hits</strong></legend><div class="powers">`);
    for (const attr of ATTRIBUTES) {
      const can = attr === 'M' ? Math.ceil(ship.M / MISSILES_PER_HIT) : ship[attr];
      if (can === 0) continue;
      const label = attr === 'M' ? `M (${ship.M})` : `${attr} (${ship[attr]})`;
      out.push(num(attr, a[attr], can, label));
    }
    out.push(`</div></fieldset>`);
  }
  out.push(`</form>`);
  out.push(`<div id="hit-check">${renderHitCheck(state, side, allocations)}</div>`);
  return out.join('\n');
}

// --- retreats and forced withdrawal (§7 step 4, step 6(c), D-022) ---

// The side's ships to place: its escaped ships, or in a forced withdrawal every Warpship of the phasing player.
export function placementShips(state, side) {
  const c = state.combat;
  if (c.stage === 'retreats') return Object.keys(c.retreating).filter((id) => c.retreating[id].owner === side).sort();
  if (c.stage === 'withdraw') return ownShips(state, side).filter(([, sh]) => sh.WG).map(([id]) => id);
  return [];
}

// The hexes next to the combat star where the side may place a ship (the engine's check).
export function placementTargets(state, side) {
  const star = starById(state.map, state.combat.star);
  return neighbors(star).filter((h) => onMap(state.map, h) && previewDestination(state, side, h) === null);
}

// dest: { id: hex } chosen so far; placing: the ship whose hex the map is offering, or null.
export function renderPlacement(state, player, dest, placing) {
  const side = state.sides[player];
  const c = state.combat;
  const ships = placementShips(state, side);
  const out = [header(state)];
  if (c.stage === 'retreats') out.push(`<p>${esc(player)}, your ships escaped. Choose a hex next to the star for each (§7 step 4).</p>`);
  else out.push(`<p>${esc(player)}, three rounds passed without effective hits: withdraw all your ships to hexes next to the star (§7 step 6(c)).</p>`);
  out.push(`<table class="placing"><tbody>`);
  for (const id of ships) {
    const to = dest[id];
    const where = to ? (starAtHex(state, to)?.name ?? `space ${to.q}, ${to.r}`) : '<span class="hint">not placed</span>';
    const active = id === placing ? ' class="placing-now"' : '';
    out.push(`<tr${active}><th scope="row">${esc(displayId(id))}</th><td>${to ? esc(where) : where}</td><td><button type="button" class="link" data-action="pick-place" data-id="${esc(id)}">${id === placing ? 'Click a highlighted hex' : 'Choose hex'}</button></td></tr>`);
  }
  out.push(`</tbody></table>`);
  const ready = ships.every((id) => dest[id]);
  out.push(`<button type="button" class="primary" data-action="submit-placement"${ready ? '' : ' disabled'}>${c.stage === 'retreats' ? 'Place ships' : 'Withdraw'}</button>`);
  return out.join('\n');
}

const starAtHex = (state, h) => state.map.stars.find((s) => s.q === h.q && s.r === h.r) ?? null;
