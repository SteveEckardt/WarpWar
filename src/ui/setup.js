// Setup screens (§4): the players, who moves first, and the second player's choice of end. All made openly.
// Pure: HTML strings, no DOM.

import { SIDES } from '../engine/game.js';
import { esc } from './hexmap.js';

const SCENARIO_TEXT = {
  learning: 'Learning (§4.1): 40 BP of Warpships each, the middle bases only; 1 victory point wins.',
  basic: 'Basic (§4.2): 50 BP of Warpships and Systemships, the middle bases only; 2 victory points win.',
  advanced: 'Advanced (§4.3): 20 BP, then 10 every turn; all three bases, repair, resupply and technology; 3 victory points win.',
};

// Fan rules a game may be created with (docs/rules/fan-modules.md), off by default.
const MODULE_TEXT = {
  armor: 'Armor (fan §10.2.2): 1 BP buys 2 + tech level points; Armor takes hits after Screens, on its own.',
  cannons: 'Cannons and Shells (fan §10.2.3, §10.2.4): 1 PD a Cannon fires 1 to 3 Shells, 1 hit each; 6 Shells a BP.',
};

// values: { player1, player2, first: 0 | 1, scenario, modules, error }.
export function renderNewGame({ player1 = 'Player 1', player2 = 'Player 2', first = 0, scenario = 'learning', modules = [], error = null } = {}) {
  const module = (id) => `<label class="scenario"><input type="checkbox" name="module" value="${id}"${modules.includes(id) ? ' checked' : ''}> ${MODULE_TEXT[id]}</label>`;
  const radio = (n) => `<input type="radio" name="first" value="${n}"${first === n ? ' checked' : ''}>`;
  const choice = (id) => `<label class="scenario"><input type="radio" name="scenario" value="${id}"${scenario === id ? ' checked' : ''}> ${SCENARIO_TEXT[id]}</label>`;
  return [
    `<h2>New game</h2>`,
    `<form class="new-game" autocomplete="off">`,
    `<fieldset><legend>Scenario</legend>${Object.keys(SCENARIO_TEXT).map(choice).join('')}</fieldset>`,
    `<fieldset><legend>Fan rules (optional)</legend>${Object.keys(MODULE_TEXT).map(module).join('')}</fieldset>`,
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
