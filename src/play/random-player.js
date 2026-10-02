// The random legal player's candidates (Phase 9b-1, 9b-2): for each decision, actions or functions that guess one
// at random. The controller (computer.js) keeps those the engine accepts. Guesses are first checked part by part
// with the engine's own checks (validateShip, validateOrder, checkHitAllocation, checkEcm).

import { SIDES, repairCandidates } from '../engine/game.js';
import { TACTICS } from '../engine/crt.js';
import { hitsCapacity } from '../engine/damage.js';
import { validateOrder, checkHitAllocation, checkEcm, incomingMissiles } from '../engine/combat.js';
import { carriedIds, freeRacks } from '../engine/carrying.js';
import { neighbors, sameHex, starAt } from '../engine/map.js';
import { attributesFor, shipCost, techLevel, validateShip } from '../engine/ships.js';

// Guesses at a decision with many possible answers before it is taken to have no legal one.
export const GUESSES = 200;

// The first guess the check accepts (it returns true, or throws a RangeError), or null.
export function guess(make, check) {
  for (let i = 0; i < GUESSES; i += 1) {
    const g = make();
    try {
      if (check(g) !== false) return g;
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
    }
  }
  return null;
}

export function randomCandidates(ai) {
  const { view, player } = ai;
  if (view.step === 'setup') return SIDES.map((side) => ({ type: 'chooseSide', player, side }));
  if (view.step === 'build') return [() => buildAction(ai)];
  if (view.step === 'movement') return movementActions(ai);
  if (view.step === 'rearrange') return [{ type: 'endTurn', player }, ...rearrangeActions(ai)];
  const c = view.step === 'combat' ? view.combat : null;
  if (view.step === 'combat' && !c) return view.contested.map((star) => ({ type: 'chooseCombat', player, star }));
  if (c?.stage === 'orders') return [() => ({ type: 'orders', player, orders: randomOrders(ai) })];
  if (c?.stage === 'ecm') return [() => ({ type: 'allocateEcm', player, ecm: randomEcm(ai) })];
  if (c?.stage === 'hits') return [() => ({ type: 'allocateHits', player, allocations: randomHits(ai) })];
  if (c?.stage === 'retreats') {
    const mine = Object.keys(c.retreating).filter((id) => c.retreating[id].owner === ai.side);
    return [() => ({ type: 'placeRetreats', player, destinations: randomPlaces(ai, mine) })];
  }
  if (c?.stage === 'withdraw') return [() => withdrawAction(ai)];
  return [];
}

// --- Build ---

// A Build event: perhaps some repair and resupply of ships at the bases, then new ships for all or part of the
// Build Points left (a scenario may require all of them).
function buildAction(ai) {
  const { view, side, player, random } = ai;
  const budget = view.bp[side];
  const { repairs, resupply } = random.next() < 0.5 ? randomRepairs(ai) : { repairs: {}, resupply: {} };
  const repairing = Object.keys(repairs).length + Object.keys(resupply).length > 0;
  let spend = random.next() < 0.5 ? budget : random.int(budget + 1);
  // What repair costs is the engine's to say: new ships get a random part of the rest.
  if (repairing) spend = random.int(spend + 1);
  const ships = randomShips(ai, spend);
  if (ships == null) return null;
  return {
    type: 'build', player, ships,
    ...(Object.keys(repairs).length > 0 ? { repairs } : {}),
    ...(Object.keys(resupply).length > 0 ? { resupply } : {}),
  };
}

// Random repair and resupply, up to the strength each ship was built with, for the ships that may have it.
export function randomRepairs({ view, side, random }) {
  const repairs = {};
  const resupply = {};
  for (const { id, ship } of repairCandidates(view, side)) {
    if (random.next() < 0.5) continue;
    for (const [attr, built] of Object.entries(ship.built ?? {})) {
      const n = random.int(Math.max(0, built - (ship[attr] ?? 0)) + 1);
      if (n === 0) continue;
      const into = attr === 'M' || attr === 'SH' ? resupply : repairs;
      into[id] = { ...(into[id] ?? {}), [attr]: n };
    }
  }
  return { repairs, resupply };
}

// New ships costing `spend` BP in all, each placed at a random base, or null if no legal set was found.
function randomShips({ view, side, random }, spend) {
  const level = techLevel(view.scenario, view.turn);
  const attrs = attributesFor(view.modules);
  const count = spend === 0 ? 0 : 1 + random.int(Math.min(4, spend));
  // Split the spend at random, every ship 1 BP or more.
  const cuts = [0, ...Array.from({ length: count - 1 }, () => 1 + random.int(spend - 1)).sort((a, b) => a - b), spend];
  const shares = cuts.slice(1).map((c, i) => c - cuts[i]);
  if (shares.some((n) => n < 1)) return null;
  const designs = shares.map((cost) => guess(() => randomDesign(random, attrs, level, cost), (d) => d && validateShip(d, view.scenario, view.modules).length === 0));
  if (designs.some((d) => d == null)) return null;

  const used = new Set();
  for (const [id, sh] of Object.entries(view.ships)) {
    used.add(id);
    carriedIds(sh).forEach((cid) => used.add(cid));
  }
  const nextId = (warpship) => {
    for (let n = 1; ; n += 1) {
      const id = warpship ? `${side}-W${n}` : `${side}-S${String(n).padStart(2, '0')}`;
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
  };
  return designs.map((design) => ({ id: nextId(design.WG), design, at: random.pick(view.bases[side]) }));
}

// A Warpship (mostly) or Systemship costing exactly `cost` BP: 1 PD, then random attributes one point at a time.
function randomDesign(random, attrs, level, cost) {
  const design = { WG: random.next() < 0.7, ...Object.fromEntries(attrs.map((a) => [a, 0])), PD: 1 };
  const price = () => shipCost(design, level);
  if (price() > cost) return null;
  const weighted = ['PD', 'PD', ...attrs];
  while (price() < cost) {
    const attr = random.pick(weighted);
    design[attr] += 1;
    if (price() > cost) design[attr] -= 1;
  }
  return design;
}

// --- Movement ---

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

// The steps out of a hex: to each neighbour, along each warpline from a star at one of its ends, and picking up
// or dropping each of the side's Systemships there or aboard (§6.2).
function stepsFrom({ view, side }, here, aboard, taken) {
  const steps = neighbors(here).map((to) => ({ step: { type: 'move', to }, to }));
  const star = starAt(view.map, here);
  if (!star) return steps;
  for (const [a, b] of view.map.warplines) {
    const end = a === star.id ? b : b === star.id ? a : null;
    const to = end && view.map.stars.find((s) => s.id === end);
    if (to) steps.push({ step: { type: 'jump', to: to.id }, to: { q: to.q, r: to.r } });
  }
  for (const [id, sh] of Object.entries(view.ships)) {
    if (sh.owner === side && !sh.WG && sameHex(sh, here) && !taken.has(id)) steps.push({ step: { type: 'pickup', ship: id }, to: here });
  }
  for (const id of aboard) steps.push({ step: { type: 'drop', ship: id }, to: here });
  return steps;
}

// A random walk of up to PD steps, each one kept only if the move so far is still accepted.
function randomPath(ai, id) {
  const { view, player, random, accepts } = ai;
  const ship = view.ships[id];
  const length = 1 + random.int(Math.max(ship.PD, 1));
  const path = [];
  const aboard = new Set(carriedIds(ship));
  const taken = new Set();
  let here = { q: ship.q, r: ship.r };
  while (path.length < length) {
    const next = random.shuffle(stepsFrom(ai, here, aboard, taken))
      .find(({ step }) => accepts({ type: 'move', player, ship: id, path: [...path, step] }));
    if (!next) break;
    path.push(next.step);
    here = next.to;
    if (next.step.type === 'pickup') {
      aboard.add(next.step.ship);
      taken.add(next.step.ship);
    }
    if (next.step.type === 'drop') aboard.delete(next.step.ship);
  }
  return path;
}

// --- After combat (§8) ---

// At each star where the side has Warpships with racks and Systemships: a random new arrangement.
function rearrangeActions({ view, side, player, random }) {
  const out = [];
  for (const star of view.map.stars) {
    const here = Object.entries(view.ships).filter(([, sh]) => sh.owner === side && sameHex(sh, star));
    const carriers = here.filter(([, sh]) => sh.WG && sh.SR > 0).map(([id]) => id);
    const systemships = here.flatMap(([id, sh]) => (sh.WG ? carriedIds(sh) : [id]));
    if (carriers.length === 0 || systemships.length === 0) continue;
    out.push(() => {
      const assignment = Object.fromEntries(carriers.map((id) => [id, []]));
      for (const sid of systemships) {
        const to = random.pick([null, ...carriers]);
        if (to && assignment[to].length < view.ships[to].SR) assignment[to].push(sid);
      }
      return { type: 'rearrange', player, star: star.id, assignment };
    });
  }
  return out;
}

// --- Combat ---

export const allOrders = (c) => ({ ...c.orders.A, ...c.orders.B });
export const allEcm = (c) => ({ ...c.ecm?.A, ...c.ecm?.B });

// An order for each of the side's ships in the combat (see randomOrder).
export function randomOrders({ view, side, random }) {
  const { ships } = view.combat.hex;
  const enemies = Object.keys(ships).filter((id) => ships[id].owner !== side);
  const loose = Object.keys(ships).filter((id) => ships[id].owner === side && !ships[id].WG);
  const orders = {};
  for (const [id, ship] of Object.entries(ships)) {
    if (ship.owner !== side) continue;
    orders[id] = guess(() => randomOrder(random, ship, enemies, loose), (o) => validateOrder(ship, o).length === 0)
      ?? { tactic: 'attack', D: 0, B: 0, S: 0, T: 0 };
  }
  return orders;
}

// A random tactic and ECM, then the ship's PD spread at random over either Beam and Screen or Tubes and Cannons,
// the rest on Drive; now and then a Systemship picked up or dropped (§7.3).
function randomOrder(random, ship, enemies, loose) {
  let left = ship.PD;
  const take = (most) => {
    const n = random.int(Math.max(0, Math.min(most ?? 0, left)) + 1);
    left -= n;
    return n;
  };
  const order = { tactic: random.pick(TACTICS), D: 0, B: 0, S: 0, T: 0 };
  if (ship.E) order.E = take(ship.E);
  if (random.next() < 0.5) {
    order.B = take(ship.B);
    if (order.B > 0) order.beamTarget = random.pick(enemies);
    order.S = take(ship.S);
  } else {
    order.T = take(Math.min(ship.T, ship.M));
    if (order.T > 0) {
      order.missiles = Array.from({ length: order.T }, () => ({ target: random.pick(enemies), drive: 1 + random.int(ship.PD + 1) }));
    }
    if (ship.C) {
      order.C = take(ship.C);
      order.shells = Array.from({ length: order.C }, () => 1 + random.int(3));
      if (order.C > 0) order.cannonTarget = random.pick(enemies);
    }
  }
  if (ship.WG && random.next() < 0.2) {
    const aboard = carriedIds(ship);
    if (aboard.length > 0 && random.next() < 0.5) order.drop = random.pick(aboard);
    else if (loose.length > 0) order.pickup = random.pick(loose);
  }
  order.D = take(left);
  return order;
}

// For each of the side's ships with ECM powered and Missiles fired at it: random points and Drive changes on them.
export function randomEcm({ view, side, random }) {
  const c = view.combat;
  const orders = allOrders(c);
  const ecm = {};
  for (const [id, ship] of Object.entries(c.hex.ships)) {
    const powered = orders[id]?.E ?? 0;
    if (ship.owner !== side || powered === 0) continue;
    const incoming = incomingMissiles(c.hex, orders, id);
    if (incoming.length === 0) continue;
    const mine = guess(() => {
      let left = powered;
      const byMissile = {};
      for (const m of incoming) {
        const points = random.int(left + 1);
        left -= points;
        if (points > 0) byMissile[m.ref] = { points, shift: random.int(2 * points + 3) - points - 1 };
      }
      return byMissile;
    }, (byMissile) => checkEcm(c.hex, orders, side, { [id]: byMissile }));
    if (mine && Object.keys(mine).length > 0) ecm[id] = mine;
  }
  return ecm;
}

// Each hit the side's ships owe, one at a time on a random attribute that can still take one: the ship's own, or
// those of a Systemship it carries (D-021).
export function randomHits({ view, side, random }) {
  const c = view.combat;
  const orders = allOrders(c);
  const attrs = attributesFor(view.modules);
  const allocations = {};
  for (const [id, owed] of Object.entries(c.owed)) {
    const ship = c.hex.ships[id];
    if (owed === 0 || ship.owner !== side) continue;
    allocations[id] = guess(() => {
      const room = [];
      for (const attr of attrs) room.push({ cargo: null, attr, left: hitsCapacity(ship, attr) });
      for (const [cid, rec] of Object.entries(ship.carrying ?? {})) {
        for (const attr of attrs) room.push({ cargo: cid, attr, left: hitsCapacity(rec, attr) });
      }
      const allocation = {};
      for (let i = 0; i < owed; i += 1) {
        const open = room.filter((r) => r.left > 0);
        if (open.length === 0) break;
        const r = random.pick(open);
        r.left -= 1;
        const into = r.cargo ? ((allocation.carried ??= {})[r.cargo] ??= {}) : allocation;
        into[r.attr] = (into[r.attr] ?? 0) + 1;
      }
      return allocation;
    }, (allocation) => checkHitAllocation(c.hex, orders, id, allocation, allEcm(c))) ?? {};
  }
  return allocations;
}

// A random hex next to the combat star for each ship.
export function randomPlaces({ view, random }, ids) {
  const star = view.map.stars.find((s) => s.id === view.combat.star);
  return Object.fromEntries(ids.map((id) => [id, random.pick(neighbors(star))]));
}

// Forced withdrawal (§7 step 6(c), D-023): each Warpship to a random adjacent hex, and the loose Systemships
// shared at random among the Warpships' free racks.
export function withdrawAction(ai) {
  const { view, side, player, random } = ai;
  const { ships } = view.combat.hex;
  const warpships = Object.keys(ships).filter((id) => ships[id].owner === side && ships[id].WG);
  const loose = Object.keys(ships).filter((id) => ships[id].owner === side && !ships[id].WG);
  const racks = Object.fromEntries(warpships.map((id) => [id, freeRacks(ships[id])]));
  const pickups = {};
  for (const sid of random.shuffle(loose)) {
    const open = warpships.filter((id) => racks[id] > 0);
    if (open.length === 0) break;
    const to = random.pick(open);
    racks[to] -= 1;
    (pickups[to] ??= []).push(sid);
  }
  return { type: 'withdraw', player, destinations: randomPlaces(ai, warpships), pickups };
}
