// The computer opponent, Phase 9b-1: a random legal player, for the Learning scenario.
//
// It is handed only viewFor(state, side), never the state. For each decision it lists the candidate actions and
// picks one at random among those applyAction accepts on a copy of its view. A decision with too many answers to
// list (a build, a move, combat orders) is a candidate that guesses at random until applyAction accepts a guess.
// It holds no rules of its own: the candidates are guesses, and the engine says which are legal. A seeded random
// number generator makes a given seed always play the same game.
//
// The copy: in combat, the other side's decision at the current stage counts as not yet made, even when the view
// shows it is in (as {}, D-039) or none is owed. So applyAction stops once it has checked this side's decision
// instead of going on to resolve the round with enemy records the view does not hold.

import { applyAction, SIDES } from '../engine/game.js';
import { TACTICS } from '../engine/crt.js';
import { hitsCapacity } from '../engine/damage.js';
import { neighbors, starAt } from '../engine/map.js';
import { shipCost } from '../engine/ships.js';
import { createRandom } from './random.js';

// Guesses at a decision with many possible answers before it is taken to have no legal one.
const GUESSES = 200;

const other = (side) => (side === 'A' ? 'B' : 'A');

// Per combat stage: the decisions, and the list of sides that owe one (orders are owed by both).
const DECISIONS = { orders: ['orders', null], ecm: ['ecm', 'needEcm'], hits: ['allocations', 'needHits'] };

// The copy of the view the candidates are tried on (see above).
function board(view, side) {
  const copy = structuredClone(view);
  const c = copy.combat;
  if (!c || !DECISIONS[c.stage]) return copy;
  const [decided, owing] = DECISIONS[c.stage];
  c[decided][other(side)] = null;
  if (owing && !c[owing].includes(other(side))) c[owing] = [...c[owing], other(side)];
  return copy;
}

export function createComputerController({ seed } = {}) {
  const random = createRandom(seed);
  return {
    kind: 'computer',
    nextAction(view, { side, player }) {
      const tried = board(view, side);
      const accepts = (action) => applyAction(tried, action).ok;
      const ai = { view, side, player, random, accepts };
      // A candidate is an action, or a function that guesses one. Picked at random; dropped if it has no legal action.
      const legal = (candidate) => {
        if (typeof candidate !== 'function') return accepts(candidate) ? candidate : null;
        for (let i = 0; i < GUESSES; i += 1) {
          const action = candidate();
          if (action && accepts(action)) return action;
        }
        return null;
      };
      let left = candidates(ai);
      while (left.length > 0) {
        const i = random.int(left.length);
        const action = legal(left[i]);
        if (action) return action;
        left = left.filter((_, j) => j !== i);
      }
      throw new Error(`The computer found no legal action for ${player} at ${view.step}${view.combat ? ` (${view.combat.stage})` : ''}`);
    },
  };
}

function candidates(ai) {
  const { view, player } = ai;
  if (view.step === 'setup') return SIDES.map((side) => ({ type: 'chooseSide', player, side }));
  if (view.step === 'build') return [() => buildAction(ai)];
  if (view.step === 'movement') return movementActions(ai);
  if (view.step === 'rearrange') return [{ type: 'endTurn', player }];
  const c = view.step === 'combat' ? view.combat : null;
  if (view.step === 'combat' && !c) return view.contested.map((star) => ({ type: 'chooseCombat', player, star }));
  if (c?.stage === 'orders') return [() => ({ type: 'orders', player, orders: randomOrders(ai) })];
  if (c?.stage === 'hits') return [() => ({ type: 'allocateHits', player, allocations: randomHits(ai) })];
  if (c?.stage === 'retreats') {
    const mine = Object.keys(c.retreating).filter((id) => c.retreating[id].owner === ai.side);
    return [() => ({ type: 'placeRetreats', player, destinations: randomPlaces(ai, mine) })];
  }
  if (c?.stage === 'withdraw') {
    const mine = Object.keys(c.hex.ships).filter((id) => c.hex.ships[id].owner === ai.side && c.hex.ships[id].WG);
    return [() => ({ type: 'withdraw', player, destinations: randomPlaces(ai, mine) })];
  }
  return [];
}

// Warpships that spend every Build Point: a few ships with a point of PD each, then one point at a time on a
// random ship and attribute (Missiles come three to the point).
function buildAction({ view, side, player, random }) {
  const budget = view.bp[side];
  const designs = Array.from({ length: 1 + random.int(4) }, () => ({ WG: true, PD: 1, B: 0, S: 0, T: 0, M: 0 }));
  const cost = () => designs.reduce((sum, d) => sum + shipCost(d), 0);
  while (cost() < budget) {
    const d = random.pick(designs);
    const attr = random.pick(['PD', 'PD', 'B', 'S', 'T', 'M']);
    d[attr] += attr === 'M' ? 3 : 1;
  }
  const used = new Set(Object.keys(view.ships));
  let n = 0;
  const nextId = () => {
    do n += 1; while (used.has(`${side}-W${n}`));
    return `${side}-W${n}`;
  };
  return { type: 'build', player, ships: designs.map((design) => ({ id: nextId(), design, at: random.pick(view.bases[side]) })) };
}

// Move a Warpship not yet moved, in random order, along a random path; end movement once none has a legal move.
// Picked at random among every legal action, ending movement (one action) would hardly ever beat the many paths.
function movementActions(ai) {
  const { view, side, player, random } = ai;
  const unmoved = Object.keys(view.ships).filter((id) => view.ships[id].owner === side && view.ships[id].WG && !view.moved.includes(id));
  return [() => {
    for (const id of random.shuffle(unmoved)) {
      const path = randomPath(ai, id);
      if (path.length > 0) return { type: 'move', player, ship: id, path };
    }
    return { type: 'endMovement', player };
  }];
}

// The steps out of a hex: to each neighbour, and along each warpline from a star at one of its ends.
function stepsFrom(map, here) {
  const steps = neighbors(here).map((to) => ({ step: { type: 'move', to }, to }));
  const star = starAt(map, here);
  if (!star) return steps;
  for (const [a, b] of map.warplines) {
    const end = a === star.id ? b : b === star.id ? a : null;
    const to = end && map.stars.find((s) => s.id === end);
    if (to) steps.push({ step: { type: 'jump', to: to.id }, to: { q: to.q, r: to.r } });
  }
  return steps;
}

// A random walk of up to PD steps, each one kept only if the move so far is still accepted.
function randomPath({ view, player, random, accepts }, id) {
  const ship = view.ships[id];
  const length = 1 + random.int(Math.max(ship.PD, 1));
  const path = [];
  let here = { q: ship.q, r: ship.r };
  while (path.length < length) {
    const next = random.shuffle(stepsFrom(view.map, here))
      .find(({ step }) => accepts({ type: 'move', player, ship: id, path: [...path, step] }));
    if (!next) break;
    path.push(next.step);
    here = next.to;
  }
  return path;
}

// An order for each of the side's ships in the combat: a random tactic, then its PD spread at random over either
// Beam and Screen or Tubes and Missiles, with the rest on Drive.
function randomOrders({ view, side, random }) {
  const { ships } = view.combat.hex;
  const enemies = Object.keys(ships).filter((id) => ships[id].owner !== side);
  const orders = {};
  for (const [id, ship] of Object.entries(ships)) {
    if (ship.owner !== side) continue;
    let left = ship.PD;
    const take = (most) => {
      const n = random.int(Math.min(most, left) + 1);
      left -= n;
      return n;
    };
    const order = { tactic: random.pick(TACTICS), D: 0, B: 0, S: 0, T: 0 };
    if (ship.T > 0 && ship.M > 0 && random.next() < 0.5) {
      order.T = take(Math.min(ship.T, ship.M));
      if (order.T > 0) {
        order.missiles = Array.from({ length: order.T }, () => ({ target: random.pick(enemies), drive: 1 + random.int(ship.PD + 1) }));
      }
    } else {
      order.B = take(ship.B);
      if (order.B > 0) order.beamTarget = random.pick(enemies);
      order.S = take(ship.S);
    }
    order.D = take(left);
    orders[id] = order;
  }
  return orders;
}

// Each hit the side's ships owe, one at a time on a random attribute that can still take one.
function randomHits({ view, side, random }) {
  const c = view.combat;
  const allocations = {};
  for (const [id, owed] of Object.entries(c.owed)) {
    const ship = c.hex.ships[id];
    if (owed === 0 || ship.owner !== side) continue;
    const room = Object.fromEntries(['PD', 'B', 'S', 'T', 'M'].map((attr) => [attr, hitsCapacity(ship, attr)]));
    const allocation = {};
    for (let i = 0; i < owed; i += 1) {
      const open = Object.keys(room).filter((attr) => room[attr] > 0);
      if (open.length === 0) break;
      const attr = random.pick(open);
      room[attr] -= 1;
      allocation[attr] = (allocation[attr] ?? 0) + 1;
    }
    allocations[id] = allocation;
  }
  return allocations;
}

// A random hex next to the combat star for each ship.
function randomPlaces({ view, random }, ids) {
  const star = view.map.stars.find((s) => s.id === view.combat.star);
  return Object.fromEntries(ids.map((id) => [id, random.pick(neighbors(star))]));
}
