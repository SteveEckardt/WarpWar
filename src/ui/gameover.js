// The end of the game: who won and why, every surviving ship's record (D-039: all records are shown once the
// game is over), and the whole log. Pure: HTML strings, no DOM.

import { SIDES } from '../engine/game.js';
import { esc } from './hexmap.js';
import { renderHexPanel } from './panel.js';
import { renderLog, resultText } from './log.js';
import { playerOf } from './view.js';

export function renderGameOver(state, log) {
  const r = state.result;
  const out = [];
  out.push(`<section class="game-over">`);
  out.push(r.draw ? `<h2>A draw</h2>` : `<h2 class="side-${r.winner}">${esc(r.player)} wins</h2>`);
  out.push(`<p>${esc(resultText(state))}</p>`);
  out.push(`<p class="meta">Game-turn ${state.turn} · ${esc(state.scenario)} scenario</p>`);
  // Near the top: the log below can be long.
  out.push(`<button type="button" class="primary" data-action="new-game">New game</button>`);

  out.push(`<h3>Final fleets</h3>`);
  for (const side of SIDES) {
    const n = Object.values(state.ships).filter((sh) => sh.owner === side).length;
    out.push(`<p class="meta">Side ${side} · ${esc(playerOf(state, side))}: ${n} ship${n === 1 ? '' : 's'} left</p>`);
  }
  // Every hex with ships, records open to both players now.
  const hexes = new Map();
  for (const sh of Object.values(state.ships)) hexes.set(`${sh.q},${sh.r}`, { q: sh.q, r: sh.r });
  for (const hex of hexes.values()) out.push(`<div class="fleet">${renderHexPanel(state, hex)}</div>`);

  out.push(`<h3>Game log</h3>`);
  out.push(renderLog(log));
  out.push(`</section>`);
  return out.join('\n');
}
