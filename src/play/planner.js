// The planning computer player (Phase 9b-3): plays to win by rules of thumb, from its view alone.
//
// plannedActions(ai) yields actions in order of preference; the controller (computer.js) takes the first the engine
// accepts, and plays as the random player when none is. The planner never decides what is legal. What it knows of
// the game it reads from the engine: the Combat Results Table (lookupCRT), ship costs, the bases, the map.
//
//   Build: one strong, balanced Warpship. In Advanced it first repairs and resupplies the ships at its bases, then
//     saves until it has SHIP_BP for the next.
//   Move: each Warpship heads for the nearest target, an enemy base or one of its own bases the enemy holds,
//     along the fewest steps (hexes and warplines), and stays once there. But a base of its own that an enemy
//     Warpship away from home could reach this turn is covered first, by the nearest Warpship.
//   Combat: every ship fires at one enemy ship; its Drive, Beam, Screen, Missiles and Cannons are set for the
//     most hits expected on the CRT against what that ship wrote last round (or a spread of Drives). A Warpship
//     with no weapon left, or worn down to a third, retreats, unless the star is its target: there it Dodges and
//     holds on. Hits go first where they cost least.
//   Escaped and withdrawing ships go to the free hex nearest home.

import { SIDES, applyAction, controlledBases, repairCandidates, previewDestination } from '../engine/game.js';
import { lookupCRT } from '../engine/crt.js';
import { hitsCapacity } from '../engine/damage.js';
import { checkHitAllocation } from '../engine/combat.js';
import { carriedIds } from '../engine/carrying.js';
import { neighbors, onMap, sameHex, starAt, starById } from '../engine/map.js';
import { shipCost, techLevel, validateShip } from '../engine/ships.js';
import { allOrders, allEcm, withdrawAction as randomWithdraw } from './random-player.js';

// Build Points an Advanced player saves up before building its next Warpship.
const SHIP_BP = 25;
// Where hits go first: what a fighting Warpship misses least.
const HITS_ORDER = ['SR', 'M', 'SH', 'C', 'T', 'E', 'S', 'B', 'PD'];
// Drive settings guessed for an enemy ship whose orders have not been seen.
const GUESSED_DRIVES = [0, 1, 2, 3, 4, 5];
// Value of a point of Screen, against a point of expected Beam or Missile hits.
const SCREEN_VALUE = 0.5;

const other = (side) => (side === 'A' ? 'B' : 'A');
const key = (h) => `${h.q},${h.r}`;

export function* plannedActions(ai) {
  const { view, player, random } = ai;
  if (view.step === 'setup') yield { type: 'chooseSide', player, side: random.pick(SIDES) };
  if (view.step === 'build') yield* buildPlans(ai);
  if (view.step === 'movement') yield* movePlans(ai);
  if (view.step === 'rearrange') yield { type: 'endTurn', player };
  if (view.step !== 'combat') return;
  const c = view.combat;
  if (!c) for (const star of view.contested) yield { type: 'chooseCombat', player, star };
  else if (c.stage === 'orders') yield { type: 'orders', player, orders: planOrders(ai) };
  else if (c.stage === 'hits') yield { type: 'allocateHits', player, allocations: planHits(ai) };
  else if (c.stage === 'retreats') yield { type: 'placeRetreats', player, destinations: homeward(ai, Object.keys(c.retreating).filter((id) => c.retreating[id].owner === ai.side)) };
  else if (c.stage === 'withdraw') {
    const withdraw = randomWithdraw(ai);
    yield { ...withdraw, destinations: homeward(ai, Object.keys(withdraw.destinations)) };
  }
}

// --- the map ---

// The steps out of a hex: to each neighbour on the map, and along each warpline from a star at one of its ends.
function links(map, here) {
  const out = neighbors(here).filter((to) => onMap(map, to)).map((to) => ({ step: { type: 'move', to }, to }));
  const star = starAt(map, here);
  if (!star) return out;
  for (const [a, b] of map.warplines) {
    const end = a === star.id ? b : b === star.id ? a : null;
    const to = end && starById(map, end);
    if (to) out.push({ step: { type: 'jump', to: to.id }, to: { q: to.q, r: to.r } });
  }
  return out;
}

// Steps from every hex to the nearest of the targets (a breadth-first search; links run both ways).
function stepsTo(map, targets) {
  const dist = new Map(targets.map((t) => [key(t), 0]));
  const queue = [...targets];
  for (let i = 0; i < queue.length; i += 1) {
    const d = dist.get(key(queue[i]));
    for (const { to } of links(map, queue[i])) {
      if (!dist.has(key(to))) {
        dist.set(key(to), d + 1);
        queue.push(to);
      }
    }
  }
  return dist;
}

const homeDistances = (view, side) => stepsTo(view.map, view.bases[side].map((id) => starById(view.map, id)));

// --- Build ---

// A Warpship costing `budget` BP: Beam 30%, Screen 20%, Armor 10% (with the module), the rest on Power/Drive.
function design(view, budget) {
  const level = techLevel(view.scenario, view.turn);
  const rest = budget - shipCost({ WG: true }, level);
  if (rest < 1) return null;
  const d = { WG: true, B: Math.floor(rest * 0.3), S: Math.floor(rest * 0.2) };
  if (view.modules.includes('armor')) d.A = Math.floor(rest * 0.1) * (2 + level);
  d.PD = budget - shipCost(d, level);
  return validateShip(d, view.scenario, view.modules).length === 0 ? d : null;
}

function nextWarpshipId(view, side) {
  const used = new Set(Object.entries(view.ships).flatMap(([id, sh]) => [id, ...carriedIds(sh)]));
  for (let n = 1; ; n += 1) if (!used.has(`${side}-W${n}`)) return `${side}-W${n}`;
}

// Repair and resupply in full, if the engine accepts it, else repair alone, else nothing; then one Warpship with
// what is left once there is enough, else save.
function* buildPlans({ view, tried, side, player }) {
  const repairs = {};
  const resupply = {};
  for (const { id, ship } of repairCandidates(view, side)) {
    for (const [attr, built] of Object.entries(ship.built ?? {})) {
      const n = built - (ship[attr] ?? 0);
      if (n <= 0) continue;
      const into = attr === 'M' || attr === 'SH' ? resupply : repairs;
      into[id] = { ...(into[id] ?? {}), [attr]: n };
    }
  }
  const fixes = [{ repairs, resupply }, { repairs }, {}].filter((f, i, all) => i === all.length - 1
    || Object.values(f).some((m) => Object.keys(m).length > 0));
  const at = controlledBases(view, side)[0] ?? view.bases[side][0];
  for (const fix of fixes) {
    const empty = Object.values(fix).every((m) => Object.keys(m).length === 0);
    const r = applyAction(tried, { type: 'build', player, ships: [], ...fix });
    const left = r.ok ? r.state.bp[side] : empty ? view.bp[side] : null;
    if (left == null) continue;
    const ship = left >= SHIP_BP || !r.ok ? design(view, left) : null;
    if (ship) yield { type: 'build', player, ships: [{ id: nextWarpshipId(view, side), design: ship, at }], ...fix };
    yield { type: 'build', player, ships: [], ...fix };
  }
}

// --- Movement ---

// Enemy bases, and the side's own bases with enemy ships on them.
function targets(view, side) {
  const enemyAt = (star) => Object.values(view.ships).some((sh) => sh.owner !== side && sameHex(sh, star));
  return [
    ...view.bases[other(side)].map((id) => starById(view.map, id)),
    ...view.bases[side].map((id) => starById(view.map, id)).filter(enemyAt),
  ];
}

// The side's bases an enemy Warpship could reach this turn, with none of the side's Warpships on them. An enemy
// Warpship on one of its own bases is not counted. Enemy PD is hidden: the side's fastest PD stands in for it.
function threatened(view, side) {
  const star = (id) => starById(view.map, id);
  const mine = Object.values(view.ships).filter((sh) => sh.owner === side && sh.WG);
  const reach = Math.max(0, ...mine.map((sh) => sh.PD));
  const enemies = Object.values(view.ships).filter((sh) => sh.owner !== side && sh.WG && sh.q != null);
  const away = enemies.filter((sh) => !view.bases[other(side)].some((id) => sameHex(star(id), sh)));
  return view.bases[side].map(star).filter((base) => {
    if (mine.some((sh) => sameHex(sh, base))) return false;
    const dist = stepsTo(view.map, [base]);
    return away.some((sh) => (dist.get(key(sh)) ?? Infinity) <= reach);
  });
}

// Where each Warpship is going: to cover a threatened base, the nearest Warpship not yet given one goes there;
// every other Warpship to the nearest target. { id: steps-to-goal map }.
function goals(view, side) {
  const attack = stepsTo(view.map, targets(view, side));
  const mine = Object.keys(view.ships).filter((id) => view.ships[id].owner === side && view.ships[id].WG);
  const out = Object.fromEntries(mine.map((id) => [id, attack]));
  const free = new Set(mine);
  for (const base of threatened(view, side)) {
    const dist = stepsTo(view.map, [base]);
    const [nearest] = [...free].sort((a, b) => (dist.get(key(view.ships[a])) ?? Infinity) - (dist.get(key(view.ships[b])) ?? Infinity));
    if (nearest == null) break;
    out[nearest] = dist;
    free.delete(nearest);
  }
  return out;
}

// For each Warpship not yet moved and not at its goal: the way toward it, as far as its PD goes, then shorter (the
// engine stops it where it must: an enemy star, the first turn's enemy bases). Then end movement.
function* movePlans({ view, side, player, random }) {
  const goal = goals(view, side);
  for (const [id, ship] of Object.entries(view.ships)) {
    if (ship.owner !== side || !ship.WG || view.moved.includes(id)) continue;
    const dist = goal[id];
    const path = [];
    let here = { q: ship.q, r: ship.r };
    while (path.length < ship.PD && (dist.get(key(here)) ?? 0) > 0) {
      const d = dist.get(key(here));
      const closer = links(view.map, here).filter(({ to }) => dist.get(key(to)) === d - 1);
      if (closer.length === 0) break;
      const next = random.pick(closer);
      path.push(next.step);
      here = next.to;
    }
    for (let n = path.length; n > 0; n -= 1) yield { type: 'move', player, ship: id, path: path.slice(0, n) };
  }
  yield { type: 'endMovement', player };
}

// --- Combat ---

// What an enemy ship may do this round: what it wrote last round at this star, else Attack at a spread of Drives.
function enemyGuesses(view, id) {
  const last = view.lastRound?.star === view.combat.star ? view.lastRound.orders?.[id] : null;
  return last ? [{ tactic: last.tactic, D: last.D ?? 0 }] : GUESSED_DRIVES.map((D) => ({ tactic: 'attack', D }));
}

// Hits expected from a weapon fired on `row` at Drive `drive`, doing `base` plus the CRT bonus when it hits.
function expected(row, drive, base, guesses) {
  let sum = 0;
  for (const g of guesses) {
    const cell = lookupCRT(row, g.tactic, drive - g.D);
    if (cell.result === 'hit') sum += base + cell.bonus;
  }
  return sum / guesses.length;
}

const armed = (ship) => ship.B > 0 || (ship.T > 0 && ship.M > 0) || ((ship.C ?? 0) > 0 && (ship.SH ?? 0) > 0);
const strength = (ship) => ['PD', 'B', 'S', 'T'].reduce((sum, a) => sum + (ship[a] ?? 0), 0);
const builtStrength = (ship) => ['PD', 'B', 'S', 'T'].reduce((sum, a) => sum + (ship.built?.[a] ?? 0), 0);

// The best order for one ship firing at `target` (see the top of the file). holding: the star is a target.
function planOrder(ship, target, guesses, holding) {
  const blank = { D: 0, B: 0, S: 0, T: 0 };
  if (!armed(ship) || (ship.WG && !holding && strength(ship) * 3 < builtStrength(ship))) {
    return { ...blank, tactic: ship.WG && !holding ? 'retreat' : 'dodge', D: ship.PD };
  }
  const level = ship.level ?? 0;
  const bestDrive = (base) => {
    let best = { drive: 1, value: 0 };
    for (let drive = 1; drive <= 12; drive += 1) {
      const value = expected('attack', drive, base, guesses);
      if (value > best.value) best = { drive, value };
    }
    return best;
  };
  let best = { value: -1, order: { ...blank, tactic: 'attack', D: ship.PD } };
  for (let D = 0; D <= ship.PD; D += 1) {
    let left = ship.PD - D;
    // Beam and Screen.
    const B = Math.min(ship.B, left);
    const S = Math.min(ship.S, left - B);
    const beam = B > 0 ? expected('attack', D, B + level, guesses) : 0;
    const value = beam + SCREEN_VALUE * S;
    if (value > best.value) best = { value, order: { ...blank, tactic: 'attack', D, B, S, ...(B > 0 ? { beamTarget: target } : {}) } };
    // Missiles and Cannons.
    const T = Math.min(ship.T, ship.M, left);
    left -= T;
    const C = Math.min(ship.C ?? 0, left, Math.floor((ship.SH ?? 0) / 3));
    if (T + C === 0) continue;
    const missile = bestDrive(2 + level);
    const fire = T * missile.value + C * expected('attack', D, 3 + level, guesses);
    if (fire > best.value) {
      best = {
        value: fire,
        order: {
          ...blank, tactic: 'attack', D, T,
          ...(T > 0 ? { missiles: Array.from({ length: T }, () => ({ target, drive: missile.drive })) } : {}),
          ...(C > 0 ? { C, shells: Array(C).fill(3), cannonTarget: target } : {}),
        },
      };
    }
  }
  return best.order;
}

// Every ship fires at one enemy ship, the one the side's ships hit last round if it is still here.
function planOrders({ view, side, random }) {
  const { ships } = view.combat.hex;
  const enemies = Object.keys(ships).filter((id) => ships[id].owner !== side);
  const last = view.lastRound?.star === view.combat.star ? Object.entries(view.lastRound.orders ?? {}) : [];
  const before = last.filter(([id]) => ships[id]?.owner === side).map(([, o]) => o.beamTarget ?? o.missiles?.[0]?.target ?? o.cannonTarget);
  const target = before.find((id) => enemies.includes(id)) ?? random.pick(enemies);
  const guesses = enemyGuesses(view, target);
  const star = starById(view.map, view.combat.star);
  const holding = targets(view, side).some((t) => sameHex(t, star));
  return Object.fromEntries(Object.entries(ships).filter(([, sh]) => sh.owner === side)
    .map(([id, sh]) => [id, planOrder(sh, target, guesses, holding)]));
}

// Each ship's hits on its attributes in HITS_ORDER, as many as each can take.
function planHits({ view, side }) {
  const c = view.combat;
  const allocations = {};
  for (const [id, owed] of Object.entries(c.owed)) {
    const ship = c.hex.ships[id];
    if (owed === 0 || ship.owner !== side) continue;
    let left = owed;
    const allocation = {};
    for (const attr of HITS_ORDER) {
      const n = Math.min(left, hitsCapacity(ship, attr) - (attr === 'SR' ? carriedIds(ship).length : 0));
      if (n > 0) allocation[attr] = n;
      left -= Math.max(0, n);
    }
    try {
      checkHitAllocation(c.hex, allOrders(c), id, allocation, allEcm(c));
    } catch (e) {
      if (e instanceof RangeError) return null;
      throw e;
    }
    allocations[id] = allocation;
  }
  return allocations;
}

// Each ship to the hex next to the combat star nearest the side's bases that the engine allows.
function homeward({ view, tried, side }, ids) {
  const star = starById(view.map, view.combat.star);
  const home = homeDistances(view, side);
  const free = neighbors(star).filter((to) => previewDestination(tried, side, to) == null)
    .sort((a, b) => (home.get(key(a)) ?? Infinity) - (home.get(key(b)) ?? Infinity));
  if (free.length === 0) return null;
  return Object.fromEntries(ids.map((id) => [id, free[0]]));
}
