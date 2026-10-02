// The page controller: holds the game and the UI's own state, renders, and turns clicks into engine actions.
// Every change to the game goes through applyAction. D-039: private views wait behind a handoff screen until
// the player who must act says they are at the screen. A round's public report (§7 step 2) is shown to both
// players before the next handoff. Add ?sample to the URL to load the Phase 7a sample game.

import { createGame, applyAction } from '../engine/game.js';
import { starAt } from '../engine/map.js';
import { renderMap, esc } from './hexmap.js';
import { renderHexPanel, renderStatus } from './panel.js';
import { renderNewGame, renderChooseSide } from './setup.js';
import { EMPTY_DESIGN, nextShipId, buildAction, buildCheck, renderBuilder, renderBuildCheck, renderDesignSummary } from './builder.js';
import { renderMovement, planInfo } from './movement.js';
import { renderRearrange, currentLoads, rearrangeActionAt } from './rearrange.js';
import {
  renderChoose, renderOrders, renderOrderCheck, blankOrders, pendingReport, renderHits, renderHitCheck,
  renderPlacement, placementShips, placementTargets, withdrawAction,
} from './combat.js';
import { logEntries, renderLog } from './log.js';
import { renderGameOver } from './gameover.js';
import { actor, displayId, plainIds } from './view.js';
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
  selected: null, // the hex { q, r } whose ships the panel shows
  plan: null, // the move being planned: { ship, steps }
  setup: {},
  design: { ...EMPTY_DESIGN },
  drafts: [],
  repairs: {}, // Build event: { id: { attr: points } }
  resupply: {}, // Build event: { id: Missiles }
  error: null,
  // Combat drafts, for the player at the screen; reset whenever the stage, round or player changes.
  draftKey: null,
  orders: {},
  allocations: {},
  dest: {},
  placing: null,
  pickups: {}, // forced withdrawal: { systemshipId: warpshipId }
  rearrange: {}, // after combat (§8): { starId: { systemshipId: warpshipId | null } } being edited
  seen: new Set(), // public round reports already shown
  log: [], // public game log entries, { turn, text }
  logOpen: false,
};

const needsHandoff = () => ui.game && actor(ui.game) != null && ui.viewer !== actor(ui.game);
const errorHtml = () => (ui.error ? `<p class="error" role="alert">${esc(ui.error)}</p>` : '');

// Starts fresh combat drafts when the decision at hand is a new one.
function syncDrafts() {
  const g = ui.game;
  const c = g?.step === 'combat' ? g.combat : null;
  const key = c ? `${c.star}:${c.round}:${c.stage}:${ui.viewer}` : null;
  if (key === ui.draftKey) return;
  ui.draftKey = key;
  ui.orders = {};
  ui.allocations = {};
  ui.dest = {};
  ui.placing = null;
  ui.pickups = {};
  if (!c || !ui.viewer) return;
  const side = g.sides[ui.viewer];
  if (c.stage === 'orders') ui.orders = blankOrders(g, side);
  if (c.stage === 'retreats' || c.stage === 'withdraw') ui.placing = placementShips(g, side)[0] ?? null;
}

// The map targets while placing an escaped or withdrawing ship.
function placementPlan() {
  const g = ui.game;
  const star = g.map.stars.find((s) => s.id === g.combat.star);
  const targets = placementTargets(g, g.sides[ui.viewer]).map((to) => ({ to, label: `Place ${displayId(ui.placing)} at ${to.q}, ${to.r}` }));
  return { path: [{ q: star.q, r: star.r }], targets };
}

function actionsHtml() {
  const g = ui.game;
  if (!g) return renderNewGame(ui.setup);
  if (g.step === 'setup') return renderChooseSide(g);
  if (g.step === 'build') return renderBuilder(g, ui.viewer, ui);
  if (g.step === 'movement') return renderMovement(g, ui.viewer, ui);
  if (g.step === 'combat') {
    const c = g.combat;
    if (!c) return renderChoose(g) + errorHtml();
    if (c.stage === 'orders') return renderOrders(g, ui.viewer, ui.orders) + errorHtml();
    if (c.stage === 'hits') return renderHits(g, ui.viewer, ui.allocations) + errorHtml();
    return renderPlacement(g, ui.viewer, ui.dest, ui.placing, ui.pickups) + errorHtml();
  }
  if (g.step === 'over') return renderGameOver(g, ui.log);
  if (g.step === 'rearrange') return renderRearrange(g, ui.viewer, ui.rearrange, ui.error);
  return '';
}

function render() {
  const state = ui.game ?? ui.preview;
  const report = ui.game ? pendingReport(ui.game, ui.seen) : null;
  const hide = report != null || needsHandoff();
  statusEl.innerHTML = ui.game ? renderStatus(ui.game) : 'Set up a new game';
  if (!hide) syncDrafts();
  let plan = null;
  if (!hide && ui.plan) plan = planInfo(ui.game, ui.plan.ship, ui.plan.steps);
  if (!hide && ui.placing) plan = placementPlan();
  const star = ui.selected ? starAt(state.map, ui.selected) : null;
  mapEl.innerHTML = renderMap(state, { selected: star?.id ?? null, selectedHex: star ? null : ui.selected, plan });

  handoffEl.hidden = !hide;
  mainEl.inert = hide;
  if (report) {
    // Public: both players look together (§7 step 2). No private view is open behind it.
    handoffEl.innerHTML = `<div class="card report">${report.html}<button type="button" class="primary" data-action="seen" data-key="${esc(report.key)}">Continue</button></div>`;
    panelEl.innerHTML = '';
    handoffEl.querySelector('button').focus();
    return;
  }
  if (hide) {
    const next = actor(ui.game);
    handoffEl.innerHTML = `<div class="card"><h2>Pass the screen to ${esc(next)}</h2><p>${esc(next)}, press the button when only you can see the screen.</p><button type="button" class="primary" data-action="reveal">I am ${esc(next)}</button></div>`;
    panelEl.innerHTML = '';
    handoffEl.querySelector('button').focus();
    return;
  }
  const info = ui.selected ? renderHexPanel(state, ui.selected, { viewer: ui.viewer }) : `<p class="hint">Click a star or hex to see the ships there.</p>`;
  // The game-over screen carries the whole log itself.
  const log = ui.game && ui.game.step !== 'over'
    ? `<details class="game-log"${ui.logOpen ? ' open' : ''}><summary>Game log (${ui.log.length})</summary>${renderLog(ui.log)}</details>`
    : '';
  panelEl.innerHTML = `<div class="actions">${actionsHtml()}</div><div class="star-info">${info}</div>${log}`;
  const list = panelEl.querySelector('.game-log ol');
  if (list) list.scrollTop = list.scrollHeight;
}

// Applies an action; on rejection keeps the message for the panel. Returns true if accepted.
function act(action) {
  const r = applyAction(ui.game, action);
  if (!r.ok) {
    ui.error = plainIds(r.message);
    return false;
  }
  ui.log.push(...logEntries(ui.game, action, r.state));
  ui.game = r.state;
  ui.error = null;
  return true;
}

function startGame(form) {
  const data = new FormData(form);
  const players = [String(data.get('player1')).trim(), String(data.get('player2')).trim()];
  const first = Number(data.get('first'));
  const scenario = String(data.get('scenario') ?? 'learning');
  ui.setup = { player1: players[0], player2: players[1], first, scenario };
  try {
    ui.game = createGame({ map: ui.mapData, scenario, players });
  } catch (e) {
    ui.setup.error = e.message;
    return;
  }
  ui.log = [];
  act({ type: 'setFirstPlayer', player: players[first] });
}

const count = (input) => (input.value.trim() === '' ? 0 : Number(input.value));

function readDesign(form) {
  const design = { ...EMPTY_DESIGN, WG: form.elements.WG ? form.elements.WG.checked : true };
  for (const input of form.querySelectorAll('input[type="number"]')) design[input.name] = count(input);
  return design;
}

function readOrders(form) {
  const orders = {};
  for (const set of form.querySelectorAll('fieldset[data-ship]')) {
    const order = { tactic: set.querySelector('input[type="radio"]:checked')?.value ?? 'attack' };
    for (const k of ['D', 'B', 'S', 'T']) order[k] = count(set.querySelector(`.powers input[name="${k}"]`));
    const beam = set.querySelector('select[name="beamTarget"]');
    if (beam) order.beamTarget = beam.value || null;
    const missiles = [...set.querySelectorAll('.missile')].map((row) => ({
      target: row.querySelector('select').value,
      drive: count(row.querySelector('input[name="drive"]')),
    }));
    if (missiles.length > 0) order.missiles = missiles;
    // §7.3: 'pickup:S01' or 'drop:S01'.
    const [kind, sid] = (set.querySelector('select[name="carry"]')?.value ?? '').split(':');
    if (kind === 'pickup' || kind === 'drop') order[kind] = sid;
    orders[set.dataset.ship] = order;
  }
  return orders;
}

// A ship's hits, and those it puts on its carried Systemships (D-021): { PD, ..., carried: { id: { PD, ... } } }.
function readAllocations(form) {
  const read = (inputs) => {
    const a = {};
    for (const input of inputs) {
      const n = count(input);
      if (n !== 0) a[input.name] = n;
    }
    return a;
  };
  const allocations = {};
  for (const set of form.querySelectorAll('fieldset[data-ship]')) {
    const a = read([...set.querySelectorAll('input[type="number"]')].filter((i) => !i.closest('fieldset[data-carried]')));
    for (const inner of set.querySelectorAll('fieldset[data-carried]')) {
      const ca = read(inner.querySelectorAll('input[type="number"]'));
      if (Object.keys(ca).length > 0) a.carried = { ...(a.carried ?? {}), [inner.dataset.carried]: ca };
    }
    allocations[set.dataset.ship] = a;
  }
  return allocations;
}

// Orders as the engine takes them: no empty Beam target, no empty Missile list.
function cleanOrders(orders) {
  return Object.fromEntries(Object.entries(orders).map(([id, o]) => {
    const { beamTarget, missiles, ...rest } = o;
    return [id, { ...rest, ...(beamTarget ? { beamTarget } : {}), ...(missiles?.length ? { missiles } : {}) }];
  }));
}

const handlers = {
  reveal() {
    ui.viewer = actor(ui.game);
    ui.plan = null;
    ui.rearrange = {};
    ui.design = { ...EMPTY_DESIGN };
    ui.drafts = [];
    ui.repairs = {};
    ui.resupply = {};
    ui.error = null;
  },
  seen(el) {
    ui.seen.add(el.dataset.key);
  },
  // Back to the setup form; the names from the last game stay filled in.
  'new-game'() {
    Object.assign(ui, {
      game: null, viewer: null, selected: null, plan: null, design: { ...EMPTY_DESIGN }, drafts: [], repairs: {}, resupply: {}, error: null,
      draftKey: null, orders: {}, allocations: {}, dest: {}, placing: null, pickups: {}, rearrange: {}, seen: new Set(), log: [], logOpen: false,
    });
    ui.setup = { ...ui.setup, error: null };
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
    if (act(buildAction(ui.viewer, ui.drafts, ui.repairs, ui.resupply))) {
      ui.drafts = [];
      ui.repairs = {};
      ui.resupply = {};
    }
  },
  plan(el) {
    const ship = ui.game.ships[el.dataset.id];
    ui.plan = { ship: el.dataset.id, steps: [] };
    ui.selected = { q: ship.q, r: ship.r };
    ui.error = null;
  },
  // A pickup or drop while moving (§6.2): 1 MP, on the hex the ship has reached.
  'cargo-step'(el) {
    const c = planInfo(ui.game, ui.plan.ship, ui.plan.steps).cargo[Number(el.dataset.index)];
    if (c) ui.plan = { ...ui.plan, steps: [...ui.plan.steps, c.step] };
    ui.error = null;
  },
  'apply-rearrange'(el) {
    const star = el.dataset.star;
    const loads = ui.rearrange[star] ?? currentLoads(ui.game, star, ui.game.sides[ui.viewer]);
    if (act(rearrangeActionAt(ui.game, ui.viewer, star, loads))) delete ui.rearrange[star];
  },
  'undo-step'() {
    ui.plan = { ...ui.plan, steps: ui.plan.steps.slice(0, -1) };
    ui.error = null;
  },
  'cancel-plan'() {
    ui.plan = null;
    ui.error = null;
  },
  'confirm-move'() {
    const { ship, steps } = ui.plan;
    if (act({ type: 'move', player: ui.viewer, ship, path: steps })) {
      ui.plan = null;
      ui.selected = { q: ui.game.ships[ship].q, r: ui.game.ships[ship].r };
    }
  },
  'end-movement'() {
    act({ type: 'endMovement', player: ui.viewer });
  },
  'end-turn'() {
    if (act({ type: 'endTurn', player: ui.viewer })) ui.rearrange = {};
  },
  'choose-combat'(el) {
    if (act({ type: 'chooseCombat', player: ui.viewer, star: el.dataset.star })) {
      const star = ui.game.map.stars.find((s) => s.id === el.dataset.star);
      ui.selected = { q: star.q, r: star.r };
    }
  },
  'add-missile'(el) {
    const id = el.dataset.ship;
    const { ships } = ui.game.combat.hex;
    const enemy = Object.keys(ships).find((sid) => ships[sid].owner !== ui.game.sides[ui.viewer]);
    const order = ui.orders[id];
    ui.orders = { ...ui.orders, [id]: { ...order, missiles: [...(order.missiles ?? []), { target: enemy, drive: 1 }] } };
  },
  'remove-missile'(el) {
    const id = el.dataset.ship;
    const missiles = ui.orders[id].missiles.filter((_, i) => i !== Number(el.dataset.index));
    ui.orders = { ...ui.orders, [id]: { ...ui.orders[id], missiles } };
  },
  'submit-orders'() {
    act({ type: 'orders', player: ui.viewer, orders: cleanOrders(ui.orders) });
  },
  'submit-hits'() {
    act({ type: 'allocateHits', player: ui.viewer, allocations: ui.allocations });
  },
  'pick-place'(el) {
    ui.placing = el.dataset.id;
  },
  'submit-placement'() {
    if (ui.game.combat.stage === 'retreats') act({ type: 'placeRetreats', player: ui.viewer, destinations: ui.dest });
    else act(withdrawAction(ui.viewer, ui.dest, ui.pickups));
  },
};

document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-action]');
  if (button && !button.disabled && handlers[button.dataset.action]) {
    handlers[button.dataset.action](button);
    render();
    return;
  }
  const target = e.target.closest('#map [data-target]');
  // A highlighted hex while placing a ship: that ship goes there; on to the next unplaced one.
  if (target && ui.placing) {
    const t = placementPlan().targets[Number(target.dataset.target)];
    if (t) {
      ui.dest = { ...ui.dest, [ui.placing]: t.to };
      ui.placing = placementShips(ui.game, ui.game.sides[ui.viewer]).find((id) => !ui.dest[id]) ?? null;
      render();
    }
    return;
  }
  // A highlighted target while planning: add that step to the path.
  if (target && ui.plan) {
    const t = planInfo(ui.game, ui.plan.ship, ui.plan.steps).targets[Number(target.dataset.target)];
    if (t) {
      ui.plan = { ...ui.plan, steps: [...ui.plan.steps, t.step] };
      ui.selected = t.to;
      ui.error = null;
      render();
      mapEl.querySelector('[data-target]')?.focus();
    }
    return;
  }
  // Any other star or hex: show the ships there.
  const starEl = e.target.closest('#map [data-star]');
  const hexEl = e.target.closest('#map [data-hex]');
  if (!starEl && !hexEl) return;
  const star = starEl && (ui.game ?? ui.preview).map.stars.find((s) => s.id === starEl.dataset.star);
  const [q, r] = star ? [star.q, star.r] : hexEl.dataset.hex.split(',').map(Number);
  ui.selected = { q, r };
  render();
  if (star) mapEl.querySelector(`[data-star="${CSS.escape(star.id)}"]`)?.focus();
});

mapEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest('[data-star], [data-target]');
  if (!el) return;
  e.preventDefault();
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});

// Remember whether the log is open across re-renders.
panelEl.addEventListener('toggle', (e) => {
  if (e.target.matches('details.game-log')) ui.logOpen = e.target.open;
}, true);

document.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.matches('form.new-game')) {
    startGame(e.target);
    render();
  }
});

// Form inputs only refresh their checks, so focus stays in the field being typed in.
document.addEventListener('input', (e) => {
  const orders = e.target.closest('form.orders');
  if (orders) {
    ui.orders = readOrders(orders);
    $('order-check').innerHTML = renderOrderCheck(ui.game, ui.game.sides[ui.viewer], ui.orders);
    return;
  }
  // Choices that change what else is offered: re-render the panel.
  const shuffle = e.target.closest('form.rearrange');
  if (shuffle) {
    ui.rearrange = { ...ui.rearrange, [shuffle.dataset.star]: Object.fromEntries([...shuffle.querySelectorAll('select')].map((s) => [s.name, s.value || null])) };
    render();
    return;
  }
  const pickups = e.target.closest('form.pickups');
  if (pickups) {
    ui.pickups = Object.fromEntries([...pickups.querySelectorAll('select')].map((s) => [s.name, s.value || null]));
    render();
    return;
  }
  const hits = e.target.closest('form.hits');
  if (hits) {
    ui.allocations = readAllocations(hits);
    $('hit-check').innerHTML = renderHitCheck(ui.game, ui.game.sides[ui.viewer], ui.allocations);
    return;
  }
  // The new-game form: show the chosen scenario's bases on the map.
  if (e.target.matches('form.new-game input[name="scenario"]')) {
    ui.setup = { ...ui.setup, scenario: e.target.value };
    ui.preview = createGame({ map: ui.mapData, scenario: e.target.value, players: ['1', '2'] });
    mapEl.innerHTML = renderMap(ui.preview, {});
    return;
  }
  const repairs = e.target.closest('form.repairs');
  if (repairs) {
    readRepairs(repairs);
    refreshBuildChecks();
    return;
  }
  const form = e.target.closest('form.design');
  if (!form) return;
  ui.design = readDesign(form);
  refreshBuildChecks();
});

// The repair and resupply fields: hits on Missiles go to resupply, the rest to repairs (§5.3).
function readRepairs(form) {
  ui.repairs = {};
  ui.resupply = {};
  for (const set of form.querySelectorAll('fieldset[data-ship]')) {
    const id = set.dataset.ship;
    for (const input of set.querySelectorAll('input[type="number"]')) {
      const n = count(input);
      if (n === 0) continue;
      if (input.name === 'M') ui.resupply[id] = n;
      else ui.repairs[id] = { ...(ui.repairs[id] ?? {}), [input.name]: n };
    }
  }
}

// The builder's live checks: the design being edited, and the whole Build event.
function refreshBuildChecks() {
  const check = buildCheck(ui.game, ui.viewer, ui);
  $('design-summary').innerHTML = renderDesignSummary(ui.game, ui.game.sides[ui.viewer], ui.design, ui.drafts, check.repairs + check.resupply);
  $('build-check').innerHTML = renderBuildCheck(ui.game, ui.viewer, ui);
}

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
