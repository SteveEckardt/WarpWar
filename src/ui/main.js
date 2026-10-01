// The page controller: holds the game and the UI's own state, renders, and turns clicks into engine actions.
// Every change to the game goes through applyAction. D-039: private views wait behind a handoff screen until
// the player who must act says they are at the screen. Add ?sample to the URL to load the Phase 7a sample game.

import { createGame, applyAction } from '../engine/game.js';
import { renderMap } from './hexmap.js';
import { renderStarPanel, renderStatus } from './panel.js';
import { renderNewGame, renderChooseSide } from './setup.js';
import { EMPTY_DESIGN, nextShipId, buildAction, renderBuilder, renderDesignSummary } from './builder.js';
import { actor } from './view.js';
import { esc } from './hexmap.js';
import { sampleGame } from './sample.js';

const $ = (id) => document.getElementById(id);
const mapEl = $('map');
const panelEl = $('panel');
const statusEl = $('status');
const handoffEl = $('handoff');
const mainEl = document.querySelector('main');

const ui = {
  mapData: null,
  preview: null, // an empty Learning game, for showing the map before setup
  game: null,
  viewer: null, // the player who last said they are at the screen
  selected: null,
  setup: {},
  design: { ...EMPTY_DESIGN },
  drafts: [],
  error: null,
};

const needsHandoff = () => ui.game && actor(ui.game) != null && ui.viewer !== actor(ui.game);

function actionsHtml() {
  const g = ui.game;
  if (!g) return renderNewGame(ui.setup);
  if (g.step === 'setup') return renderChooseSide(g);
  if (g.step === 'build') return renderBuilder(g, ui.viewer, ui);
  if (g.step === 'movement' || g.step === 'rearrange') {
    return [
      `<h2>Movement</h2>`,
      `<p class="hint">Moving ships comes in Phase 7c. For now you can only end your turn.</p>`,
      ui.error ? `<p class="error" role="alert">${esc(ui.error)}</p>` : '',
      `<button type="button" class="primary" data-action="end-turn">End turn</button>`,
    ].join('\n');
  }
  if (g.step === 'combat') return `<h2>Combat</h2><p class="hint">Combat comes in Phase 7d.</p>`;
  return '';
}

function render() {
  const state = ui.game ?? ui.preview;
  statusEl.innerHTML = ui.game ? renderStatus(ui.game) : 'Set up a new game';
  mapEl.innerHTML = renderMap(state, { selected: ui.selected });

  const hide = needsHandoff();
  handoffEl.hidden = !hide;
  mainEl.inert = hide;
  if (hide) {
    const next = actor(ui.game);
    handoffEl.innerHTML = `<div class="card"><h2>Pass the screen to ${esc(next)}</h2><p>${esc(next)}, press the button when only you can see the screen.</p><button type="button" class="primary" data-action="reveal">I am ${esc(next)}</button></div>`;
    panelEl.innerHTML = '';
    handoffEl.querySelector('button').focus();
    return;
  }
  const star = ui.selected ? renderStarPanel(state, ui.selected, { viewer: ui.viewer }) : `<p class="hint">Click a star to see the ships there.</p>`;
  panelEl.innerHTML = `<div class="actions">${actionsHtml()}</div><div class="star-info">${star}</div>`;
}

// Applies an action; on rejection keeps the message for the panel. Returns true if accepted.
function act(action) {
  const r = applyAction(ui.game, action);
  if (!r.ok) {
    ui.error = r.message;
    return false;
  }
  ui.game = r.state;
  ui.error = null;
  return true;
}

function startGame(form) {
  const data = new FormData(form);
  const players = [String(data.get('player1')).trim(), String(data.get('player2')).trim()];
  const first = Number(data.get('first'));
  ui.setup = { player1: players[0], player2: players[1], first };
  try {
    ui.game = createGame({ map: ui.mapData, scenario: 'learning', players });
  } catch (e) {
    ui.setup.error = e.message;
    return;
  }
  act({ type: 'setFirstPlayer', player: players[first] });
}

function readDesign(form) {
  const design = { ...EMPTY_DESIGN, WG: form.elements.WG ? form.elements.WG.checked : true };
  for (const input of form.querySelectorAll('input[type="number"]')) {
    design[input.name] = input.value.trim() === '' ? 0 : Number(input.value);
  }
  return design;
}

const handlers = {
  reveal() {
    ui.viewer = actor(ui.game);
    ui.design = { ...EMPTY_DESIGN };
    ui.drafts = [];
    ui.error = null;
  },
  side(el) {
    const second = ui.game.players.find((p) => p !== ui.game.first);
    act({ type: 'chooseSide', player: second, side: el.dataset.side });
  },
  add() {
    const form = panelEl.querySelector('form.design');
    const side = ui.game.sides[ui.viewer];
    const design = readDesign(form);
    const at = form.elements.at?.value ?? ui.game.bases[side][0];
    ui.drafts = [...ui.drafts, { id: nextShipId(ui.game, side, ui.drafts, design.WG), design, at }];
    ui.design = { ...EMPTY_DESIGN, WG: design.WG };
    ui.error = null;
  },
  remove(el) {
    ui.drafts = ui.drafts.filter((d) => d.id !== el.dataset.id);
    ui.error = null;
  },
  build() {
    if (act(buildAction(ui.viewer, ui.drafts))) ui.drafts = [];
  },
  // A stand-in until Phase 7c: end movement without moving, then end the turn.
  'end-turn'() {
    const player = ui.viewer;
    if (act({ type: 'endMovement', player }) && ui.game.step === 'rearrange') act({ type: 'endTurn', player });
  },
};

document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-action]');
  if (button && !button.disabled && handlers[button.dataset.action]) {
    handlers[button.dataset.action](button);
    render();
    return;
  }
  const star = e.target.closest('#map [data-star]');
  if (star) {
    ui.selected = star.dataset.star;
    render();
    mapEl.querySelector(`[data-star="${CSS.escape(ui.selected)}"]`)?.focus();
  }
});

mapEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const star = e.target.closest('[data-star]');
  if (!star) return;
  e.preventDefault();
  star.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.matches('form.new-game')) {
    startGame(e.target);
    render();
  }
});

// The builder's inputs only refresh the cost and errors, so focus stays in the field being typed in.
document.addEventListener('input', (e) => {
  const form = e.target.closest('form.design');
  if (!form) return;
  ui.design = readDesign(form);
  $('design-summary').innerHTML = renderDesignSummary(ui.game, ui.game.sides[ui.viewer], ui.design, ui.drafts);
});

try {
  const res = await fetch('data/maps/classic-original.json');
  if (!res.ok) throw new Error(`Map not found (HTTP ${res.status})`);
  ui.mapData = await res.json();
  ui.preview = createGame({ map: ui.mapData, scenario: 'learning', players: ['1', '2'] });
  if (new URLSearchParams(location.search).has('sample')) ui.game = sampleGame(ui.mapData);
  render();
} catch (e) {
  statusEl.textContent = `Could not load the game: ${e.message}`;
}
