// The side panel and status line as HTML strings. Pure: no DOM.

import { ATTRIBUTES } from '../engine/ships.js';
import { SIDES } from '../engine/game.js';
import { esc, shipsAt } from './hexmap.js';
import { displayId, playerOf, seesRecords } from './view.js';

const sideLabel = (state, side) => {
  const player = playerOf(state, side);
  return player ? `Side ${side} · ${esc(player)}` : `Side ${side}`;
};

const typeOf = (ship) => (ship.WG ? 'Warpship' : 'Systemship');

// A strength cell: current value, and the built value after a slash if they differ (§5.3).
function cell(ship, attr) {
  const now = ship[attr] ?? 0;
  const built = ship.built?.[attr] ?? now;
  return now === built ? `<td>${now}</td>` : `<td class="damaged">${now}<span class="built">/${built}</span></td>`;
}

function row(id, ship, note = '') {
  return `<tr><th scope="row">${esc(displayId(id))}</th><td>${typeOf(ship)}${note}</td><td>${ship.level ?? 0}</td>${ATTRIBUTES.map((a) => cell(ship, a)).join('')}</tr>`;
}

// D-039: an enemy ship is a counter. Its cargo is not on the map, so it is not shown.
const counterRow = (id, ship) =>
  `<tr><th scope="row">${esc(displayId(id))}</th><td>${typeOf(ship)}</td><td colspan="${ATTRIBUTES.length + 1}" class="hidden">Record hidden</td></tr>`;

// options.viewer: the player at the screen, who sees their own records (D-039).
export function renderStarPanel(state, starId, options = {}) {
  const star = state.map.stars.find((s) => s.id === starId);
  if (!star) return `<p class="hint">Click a star to see the ships there.</p>`;
  return renderHexPanel(state, star, options);
}

// Any hex: a star hex shows the star, a space hex its position. Then the ships there, by side.
export function renderHexPanel(state, hex, { viewer = null } = {}) {
  const star = state.map.stars.find((s) => s.q === hex.q && s.r === hex.r);
  const out = [];
  if (star) {
    out.push(`<h2>${esc(star.name)}</h2>`);
    out.push(`<p class="meta">Hex ${star.q}, ${star.r} · ${star.baseOwner ? `Base star of side ${esc(star.baseOwner)}` : 'Star'}</p>`);
  } else {
    out.push(`<h2>Space hex</h2>`);
    out.push(`<p class="meta">Hex ${hex.q}, ${hex.r}</p>`);
  }
  const here = shipsAt(state, hex);
  if (here.length === 0) {
    out.push(`<p class="hint">No ships here.</p>`);
    return out.join('\n');
  }
  for (const side of SIDES) {
    const ships = here.filter(([, sh]) => sh.owner === side);
    if (ships.length === 0) continue;
    const open = seesRecords(state, viewer, side);
    out.push(`<section class="side side-${side}">`);
    out.push(`<h3>${sideLabel(state, side)}</h3>`);
    out.push(`<table><thead><tr><th>Ship</th><th>Type</th><th title="Tech level">Lvl</th>${ATTRIBUTES.map((a) => `<th>${a}</th>`).join('')}</tr></thead><tbody>`);
    for (const [id, ship] of ships) {
      if (!open) {
        out.push(counterRow(id, ship));
        continue;
      }
      out.push(row(id, ship));
      for (const [cid, carried] of Object.entries(ship.carrying ?? {})) {
        out.push(row(cid, carried, `<span class="carried">, carried by ${esc(displayId(id))}</span>`));
      }
    }
    out.push(`</tbody></table></section>`);
  }
  return out.join('\n');
}

export function renderStatus(state) {
  if (state.step === 'over') {
    const r = state.result;
    if (r?.draw) return `Game over: a draw`;
    return `Game over: ${esc(r.player)} (${esc(r.winner)}) wins with ${r.victoryPoints} victory point${r.victoryPoints === 1 ? '' : 's'}`;
  }
  const parts = [`Game-turn ${state.turn}`, `${esc(state.scenario)} scenario`];
  if (state.active) parts.push(`${esc(playerOf(state, state.active))} (${state.active}) to play`);
  const starName = (id) => state.map.stars.find((s) => s.id === id)?.name ?? id;
  const stage = state.step === 'combat' ? (state.combat ? `, ${state.combat.stage} at ${esc(starName(state.combat.star))}` : ', choosing a contested star') : '';
  parts.push(`step: ${state.step}${stage}`);
  return parts.join(' · ');
}
