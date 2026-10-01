// Setup screens (§4): the players, who moves first, and the second player's choice of end. All made openly.
// Pure: HTML strings, no DOM.

import { SIDES } from '../engine/game.js';
import { esc } from './hexmap.js';

// values: { player1, player2, first: 0 | 1, error }.
export function renderNewGame({ player1 = 'Player 1', player2 = 'Player 2', first = 0, error = null } = {}) {
  const radio = (n) => `<input type="radio" name="first" value="${n}"${first === n ? ' checked' : ''}>`;
  return [
    `<h2>New game</h2>`,
    `<p class="meta">Learning scenario (§4.1): 40 BP of Warpships each; first to occupy the enemy base wins.</p>`,
    `<form class="new-game" autocomplete="off">`,
    `<label>Player 1 <input name="player1" value="${esc(player1)}" required maxlength="24"></label>`,
    `<label>Player 2 <input name="player2" value="${esc(player2)}" required maxlength="24"></label>`,
    `<fieldset><legend>Who moves first?</legend>`,
    `<label>${radio(0)} Player 1</label> <label>${radio(1)} Player 2</label>`,
    `</fieldset>`,
    error ? `<p class="error" role="alert">${esc(error)}</p>` : '',
    `<button type="submit" class="primary">Start</button>`,
    `</form>`,
  ].join('\n');
}

// §4: "the player moving second chooses which end of the map will be his/hers to defend."
export function renderChooseSide(state) {
  const second = state.players.find((p) => p !== state.first);
  const starName = (id) => state.map.stars.find((s) => s.id === id)?.name ?? id;
  const out = [];
  out.push(`<h2>Choose your end</h2>`);
  out.push(`<p>${esc(state.first)} moves first. <strong>${esc(second)}</strong>, you move second, so you choose which end of the map to defend.</p>`);
  for (const side of SIDES) {
    const bases = state.bases[side].map(starName).join(', ');
    out.push(`<button type="button" class="side-choice side-${side}" data-action="side" data-side="${side}">Side ${side}: base ${esc(bases)}</button>`);
  }
  return out.join('\n');
}
