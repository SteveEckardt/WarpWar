// The side panel and status line as HTML strings. Pure: no DOM.

import { ATTRIBUTES } from '../engine/ships.js';
import { SIDES } from '../engine/game.js';
import { esc, shipsAt } from './hexmap.js';

const playerOf = (state, side) => (state.sides ? state.players.find((p) => state.sides[p] === side) : null);
const sideLabel = (state, side) => {
  const player = playerOf(state, side);
  return player ? `Side ${side} · ${esc(player)}` : `Side ${side}`;
};

// A strength cell: current value, and the built value after a slash if they differ (§5.3).
function cell(ship, attr) {
  const now = ship[attr] ?? 0;
  const built = ship.built?.[attr] ?? now;
  return now === built ? `<td>${now}</td>` : `<td class="damaged">${now}<span class="built">/${built}</span></td>`;
}

function row(id, ship, note = '') {
  const type = ship.WG ? 'Warpship' : 'Systemship';
  return `<tr><th scope="row">${esc(id)}</th><td>${type}${note}</td><td>${ship.level ?? 0}</td>${ATTRIBUTES.map((a) => cell(ship, a)).join('')}</tr>`;
}

export function renderStarPanel(state, starId) {
  const star = state.map.stars.find((s) => s.id === starId);
  if (!star) return `<p class="hint">Click a star to see the ships there.</p>`;
  const out = [];
  out.push(`<h2>${esc(star.name)}</h2>`);
  out.push(`<p class="meta">Hex ${star.q}, ${star.r} · ${star.baseOwner ? `Base star of side ${esc(star.baseOwner)}` : 'Star'}</p>`);
  const here = shipsAt(state, star);
  if (here.length === 0) {
    out.push(`<p class="hint">No ships here.</p>`);
    return out.join('\n');
  }
  for (const side of SIDES) {
    const ships = here.filter(([, sh]) => sh.owner === side);
    if (ships.length === 0) continue;
    out.push(`<section class="side side-${side}">`);
    out.push(`<h3>${sideLabel(state, side)}</h3>`);
    out.push(`<table><thead><tr><th>Ship</th><th>Type</th><th title="Tech level">Lvl</th>${ATTRIBUTES.map((a) => `<th>${a}</th>`).join('')}</tr></thead><tbody>`);
    for (const [id, ship] of ships) {
      out.push(row(id, ship));
      for (const [cid, carried] of Object.entries(ship.carrying ?? {})) {
        out.push(row(cid, carried, `<span class="carried">, carried by ${esc(id)}</span>`));
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
  const stage = state.step === 'combat' ? (state.combat ? `, ${state.combat.stage} at ${esc(state.combat.star)}` : ', choosing a contested star') : '';
  parts.push(`step: ${state.step}${stage}`);
  return parts.join(' · ');
}
