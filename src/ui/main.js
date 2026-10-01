// The page: loads the map, builds the sample game and shows it. Phase 7a is read-only: nothing here calls
// applyAction in response to input. The only state the page keeps is which star is selected.

import { renderMap } from './hexmap.js';
import { renderStarPanel, renderStatus } from './panel.js';
import { sampleGame } from './sample.js';

const mapEl = document.getElementById('map');
const panelEl = document.getElementById('panel');
const statusEl = document.getElementById('status');

let state = null;
let selected = null;

function render() {
  statusEl.innerHTML = renderStatus(state);
  mapEl.innerHTML = renderMap(state, { selected });
  panelEl.innerHTML = renderStarPanel(state, selected);
}

function select(starId) {
  selected = starId;
  render();
  mapEl.querySelector(`[data-star="${CSS.escape(starId)}"]`)?.focus();
}

mapEl.addEventListener('click', (e) => {
  const star = e.target.closest('[data-star]');
  if (star) select(star.dataset.star);
});

mapEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const star = e.target.closest('[data-star]');
  if (!star) return;
  e.preventDefault();
  select(star.dataset.star);
});

try {
  const res = await fetch('data/maps/classic-original.json');
  if (!res.ok) throw new Error(`Map not found (HTTP ${res.status})`);
  state = sampleGame(await res.json());
  render();
} catch (e) {
  statusEl.textContent = `Could not load the game: ${e.message}`;
}
