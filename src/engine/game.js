// The game as a state machine: setup, the player-turn sequence, the Learning scenario.
// Rules: docs/rules/classic.md §3, §4, §4.1. Rulings: D-007 to D-013, D-022 in docs/decisions.md.
//
// applyAction(state, action) returns { ok: true, state } or { ok: false, code, message }. The state is plain
// data and the one passed in is never changed. Every player decision is an action; the engine never chooses.
//
// Ships on the map live in state.ships: { id: ship record + owner + q, r }. Owners are sides, 'A' or 'B'.
// Actions name the acting player; state.sides maps each player to a side.
//
// Steps of a player-turn (§3): victory (checked automatically when the turn starts), 'build', 'movement',
// 'combat', 'rearrange', then endTurn. 'setup' comes first and 'over' ends the game.
// Inside 'combat', state.combat is null while the phasing player picks the next contested star, otherwise
// { star, round, stage, hex, ... } with stage 'orders', 'hits', 'retreats' or 'withdraw'.

import { loadMap, starAt, starById, isHex, isAdjacent, sameHex, onMap } from './map.js';
import { createShip, shipCost, validateShip } from './ships.js';
import { validateMove, FIRST_TURN } from './movement.js';
import { createHex, validateOrders, hitsOwed, checkHitAllocation, resolveRound } from './combat.js';
import { rearrange, withdrawSystemships } from './carrying.js';

export const SIDES = ['A', 'B'];

// §4.1. Basic and Advanced come in Phase 6c. `bases` names the base stars each side uses, as star ids on the
// map (data/maps/classic-original.json): Learning uses the middle base of each end. Other bases are ordinary stars.
export const SCENARIOS = {
  learning: { bp: 40, victoryPoints: 1, bases: { A: ['ur'], B: ['nippur'] } },
};

class Rejection extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const reject = (code, message) => {
  throw new Rejection(code, message);
};

const other = (side) => (side === 'A' ? 'B' : 'A');
const isObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const withoutPlace = ({ q, r, ...record }) => record;
const withoutOwnerOrPlace = ({ owner, q, r, ...record }) => record;

// The scenario's named bases must be base stars of that side on the map.
function checkBases(stars, scenario, bases) {
  for (const side of SIDES) {
    for (const id of bases[side]) {
      const star = stars.find((s) => s.id === id);
      if (!star) throw new RangeError(`The ${scenario} scenario names base ${id}, which is not on the map`);
      if (star.baseOwner !== side) {
        throw new RangeError(`The ${scenario} scenario names ${id} as a side ${side} base, but the map gives it to ${star.baseOwner}`);
      }
    }
  }
}

// A new game waiting for setup (§4). Throws on bad input.
export function createGame({ map, scenario, players }) {
  if (!(scenario in SCENARIOS)) throw new RangeError(`Only the learning scenario is built so far, not: ${scenario}`);
  if (!Array.isArray(players) || players.length !== 2 || players[0] === players[1]
    || !players.every((p) => typeof p === 'string' && p.length > 0)) {
    throw new RangeError('A game needs two different player names');
  }
  const loaded = loadMap(map);
  // Learning: only the named base of each side is used; the others are ordinary stars (§4.1).
  const bases = structuredClone(SCENARIOS[scenario].bases);
  checkBases(loaded.stars, scenario, bases);
  const active = new Set([...bases.A, ...bases.B]);
  const stars = loaded.stars.map((s) => ({ ...s, baseOwner: active.has(s.id) ? s.baseOwner : null }));
  return {
    scenario,
    map: { ...loaded, stars },
    bases,
    players: [...players],
    first: null,
    sides: null,
    turn: FIRST_TURN,
    active: null,
    step: 'setup',
    bp: Object.fromEntries(SIDES.map((side) => [side, SCENARIOS[scenario].bp])),
    hasBuilt: { A: false, B: false },
    ships: {},
    moved: [],
    contested: [],
    combat: null,
    lastRound: null,
    result: null,
  };
}

export function applyAction(state, action) {
  try {
    if (state.step === 'over') reject('GAME_OVER', 'The game is over');
    const handler = HANDLERS[action?.type];
    if (!handler) reject('UNKNOWN_ACTION', `Unknown action: ${action?.type}`);
    const next = structuredClone(state);
    handler(next, action);
    return { ok: true, state: next };
  } catch (e) {
    if (e instanceof Rejection) return { ok: false, code: e.code, message: e.message };
    throw e;
  }
}

// --- guards ---

function stageOf(s) {
  if (s.step === 'setup') return s.first == null ? 'first' : 'side';
  if (s.step === 'combat') return s.combat?.stage ?? 'choose';
  return null;
}

function expectStep(s, step, stage = null) {
  if (s.step !== step || (stage != null && stageOf(s) !== stage)) {
    const now = stageOf(s) ? `${s.step} (${stageOf(s)})` : s.step;
    reject('OUT_OF_ORDER', `Not allowed now: the game is at ${now}`);
  }
}

function sideOf(s, player) {
  if (!s.players.includes(player)) reject('UNKNOWN_PLAYER', `Unknown player: ${player}`);
  return s.sides[player];
}

function activeSide(s, player) {
  const side = sideOf(s, player);
  if (side !== s.active) reject('NOT_YOUR_TURN', `It is not ${player}'s turn`);
  return side;
}

const playerOf = (s, side) => s.players.find((p) => s.sides[p] === side);

// --- map queries ---

const shipsAt = (s, hex) => Object.fromEntries(Object.entries(s.ships).filter(([, sh]) => sameHex(sh, hex)));
const enemyAt = (s, side, hex) => Object.values(s.ships).some((sh) => sh.owner !== side && sameHex(sh, hex));

// Star hexes holding ships of both sides (§7), in map order.
function contestedStars(s) {
  return s.map.stars
    .filter((star) => new Set(Object.values(shipsAt(s, star)).map((sh) => sh.owner)).size > 1)
    .map((star) => star.id);
}

// D-009, D-038: a ship is effective if it has PD of 1 or more and is a Warpship or carries a weapon it can
// power: a Beam (D-030), or a Tube with a Missile. Carried Systemships count too.
const effective = (ship) => ship.PD >= 1 && (ship.WG || ship.B >= 1 || (ship.T >= 1 && ship.M >= 1));

const hasEffectiveShip = (s, side) =>
  Object.values(s.ships).some((sh) => sh.owner === side && (effective(sh) || Object.values(sh.carrying ?? {}).some(effective)));

// D-010: one point per enemy base star occupied by any of the side's ships on the map.
const victoryPoints = (s, side) =>
  s.bases[other(side)].filter((id) => enemyAt(s, other(side), starById(s.map, id))).length;

// D-022: the owner picks a hex adjacent to the star; not a star hex with enemy ships, nor an enemy base
// star on the first turn.
function checkDestination(s, side, from, to, id) {
  if (!isHex(to)) reject('BAD_HEX', `${id}: a destination is a hex { q, r }`);
  if (!isAdjacent(from, to)) reject('NOT_ADJACENT', `${id}: the destination must be adjacent to the star hex`);
  if (!onMap(s.map, to)) reject('OFF_MAP', `${id}: the destination is off the map (D-040)`);
  const star = starAt(s.map, to);
  if (star && enemyAt(s, side, to)) reject('ENEMY_STAR', `${id}: ${star.name} holds enemy ships (D-022)`);
  if (star && s.turn === FIRST_TURN && star.baseOwner != null && star.baseOwner !== side) {
    reject('FIRST_TURN_BASE', `${id}: no ship may enter an enemy base star on the first turn (D-022)`);
  }
}

// --- the turn sequence ---

// §3 event 1, then on to Build or Movement. Victory is checked before the draw (D-037).
function startPlayerTurn(s) {
  const side = s.active;
  const vp = victoryPoints(s, side);
  if (vp >= SCENARIOS[s.scenario].victoryPoints) {
    s.step = 'over';
    s.result = { winner: side, player: playerOf(s, side), victoryPoints: vp };
    return;
  }
  // D-009, checked at the start of each player-turn once both players have had their first Build event (D-036).
  if (SIDES.every((sd) => s.hasBuilt[sd]) && !SIDES.some((sd) => hasEffectiveShip(s, sd))) {
    s.step = 'over';
    s.result = { draw: true };
    return;
  }
  s.moved = [];
  // Learning: the only Build event is each player's first (§4.1).
  s.step = s.hasBuilt[side] ? 'movement' : 'build';
}

function setFirstPlayer(s, action) {
  expectStep(s, 'setup', 'first');
  if (!s.players.includes(action.player)) reject('UNKNOWN_PLAYER', `Unknown player: ${action.player}`);
  s.first = action.player;
}

// §4: the player moving second chooses which end of the map to defend.
function chooseSide(s, action) {
  expectStep(s, 'setup', 'side');
  if (!s.players.includes(action.player)) reject('UNKNOWN_PLAYER', `Unknown player: ${action.player}`);
  if (action.player === s.first) reject('WRONG_PLAYER', 'The player moving second chooses the side');
  if (!SIDES.includes(action.side)) reject('BAD_SIDE', `A side is A or B, not ${action.side}`);
  s.sides = { [action.player]: action.side, [s.first]: other(action.side) };
  s.active = s.sides[s.first];
  startPlayerTurn(s);
}

// §3 event 2, §4.1: all BP spent on Warpships in one Build event, placed on controlled bases (D-013).
// ships: [{ id, design, at: starId }].
function build(s, action) {
  expectStep(s, 'build');
  const side = activeSide(s, action.player);
  if (!Array.isArray(action.ships) || action.ships.length === 0) reject('BAD_BUILD', 'Build needs a list of ships');
  const ids = new Set();
  let total = 0;
  for (const entry of action.ships) {
    const { id, design, at } = entry ?? {};
    if (typeof id !== 'string' || id.length === 0) reject('BAD_BUILD', 'Each new ship needs an id');
    if (ids.has(id) || id in s.ships || Object.values(s.ships).some((sh) => id in (sh.carrying ?? {}))) {
      reject('DUPLICATE_ID', `Ship id already in use: ${id}`);
    }
    ids.add(id);
    const errors = validateShip(isObject(design) ? design : {}, s.scenario);
    if (errors.length > 0) reject(errors[0].code, `${id}: ${errors[0].message}`);
    if (!s.bases[side].includes(at)) reject('NOT_A_BASE', `${id}: ${at} is not one of your base stars in this scenario`);
    if (enemyAt(s, side, starById(s.map, at))) reject('BASE_NOT_CONTROLLED', `${id}: enemy ships are on ${at} (D-013)`);
    total += shipCost(design);
  }
  if (total > s.bp[side]) reject('OVER_BP', `Ships cost ${total} BP but you have ${s.bp[side]}`);
  if (total < s.bp[side]) reject('BP_NOT_SPENT', `All ${s.bp[side]} BP must be spent; these ships cost ${total} (§4.1)`);

  for (const { id, design, at } of action.ships) {
    const star = starById(s.map, at);
    s.ships[id] = { ...createShip(design, s.scenario, s.turn), owner: side, q: star.q, r: star.r };
  }
  s.bp[side] -= total;
  s.hasBuilt[side] = true;
  s.step = 'movement';
}

// §3 event 3: one path per Warpship, validated by validateMove (§6, D-008, D-017).
function move(s, action) {
  expectStep(s, 'movement');
  const side = activeSide(s, action.player);
  const id = action.ship;
  const ship = s.ships[id];
  if (!ship) reject('UNKNOWN_SHIP', `No ship ${id} on the map`);
  if (ship.owner !== side) reject('NOT_YOUR_SHIP', `${id} is not yours`);
  if (s.moved.includes(id)) reject('ALREADY_MOVED', `${id} has already moved this turn`);
  if (!Array.isArray(action.path)) reject('BAD_PATH', 'A move needs a path: a list of steps');

  const result = previewMove(s, id, action.path);
  if (result.errors.length > 0) reject(result.errors[0].code, `${id}: ${result.errors[0].message}`);

  ship.q = result.end.q;
  ship.r = result.end.r;
  if (result.cargo) {
    const pool = { ...(ship.carrying ?? {}) };
    for (const { ship: cid } of result.cargo.pickups) {
      if (cid in s.ships) {
        pool[cid] = withoutOwnerOrPlace(s.ships[cid]);
        delete s.ships[cid];
      }
    }
    ship.carrying = Object.fromEntries(result.cargo.carried.map((cid) => [cid, pool[cid]]));
    for (const { ship: cid, at } of result.cargo.drops) {
      if (!result.cargo.carried.includes(cid)) s.ships[cid] = { ...pool[cid], owner: side, q: at.q, r: at.r };
    }
  }
  s.moved.push(id);
}

// What a move would do, without doing it: validateMove against every other counter on the map. The move
// action makes the same check. Returns validateMove's result, or null if there is no such ship on the map.
export function previewMove(state, id, path) {
  const ship = state.ships[id];
  if (!ship) return null;
  const world = {
    turn: state.turn,
    ships: Object.entries(state.ships)
      .filter(([key]) => key !== id)
      .map(([key, sh]) => ({ id: key, owner: sh.owner, WG: sh.WG, q: sh.q, r: sh.r })),
  };
  return validateMove(state.map, ship, { q: ship.q, r: ship.r }, path, world);
}

function endMovement(s, action) {
  expectStep(s, 'movement');
  activeSide(s, action.player);
  s.contested = contestedStars(s);
  s.combat = null;
  s.step = s.contested.length > 0 ? 'combat' : 'rearrange';
}

// §7: the phasing player picks which contested star hex to resolve next.
function chooseCombat(s, action) {
  expectStep(s, 'combat', 'choose');
  activeSide(s, action.player);
  if (!s.contested.includes(action.star)) reject('NOT_CONTESTED', `${action.star} is not a contested star hex`);
  const star = starById(s.map, action.star);
  const ships = Object.fromEntries(Object.entries(shipsAt(s, star)).map(([id, sh]) => [id, withoutPlace(sh)]));
  s.combat = {
    star: star.id,
    round: 1,
    stage: 'orders',
    hex: createHex(ships),
    orders: { A: null, B: null },
    owed: null,
    needHits: [],
    allocations: { A: null, B: null },
    retreating: {},
    end: null,
  };
}

const allOrders = (c) => ({ ...c.orders.A, ...c.orders.B });

// §7 step 1: each player writes an order for every one of their ships in the hex.
function submitOrders(s, action) {
  expectStep(s, 'combat', 'orders');
  const side = sideOf(s, action.player);
  const c = s.combat;
  if (c.orders[side]) reject('ALREADY_SUBMITTED', 'Orders for this round are already in');
  if (!isObject(action.orders)) reject('BAD_ORDERS', 'Orders map each of your ships to its order');
  for (const id of Object.keys(action.orders)) {
    if (!(id in c.hex.ships)) reject('UNKNOWN_SHIP', `No ship ${id} in this combat`);
    if (c.hex.ships[id].owner !== side) reject('NOT_YOUR_SHIP', `${id} is not yours`);
  }
  const errors = validateOrders(c.hex, action.orders).filter((e) => c.hex.ships[e.ship]?.owner === side);
  if (errors.length > 0) reject(errors[0].code, `${errors[0].ship}: ${errors[0].message}`);
  c.orders[side] = action.orders;
  if (c.orders.A && c.orders.B) afterOrders(s);
}

// §7 step 2: orders revealed. Owners whose ships took effective hits must allocate them (§7.2.2).
function afterOrders(s) {
  const c = s.combat;
  const { owed } = hitsOwed(c.hex, allOrders(c));
  c.owed = owed;
  c.needHits = SIDES.filter((side) => Object.entries(owed).some(([id, n]) => n > 0 && c.hex.ships[id].owner === side));
  if (c.needHits.length === 0) resolve(s);
  else c.stage = 'hits';
}

// §7 step 3, §7.2.2: "The player owning a ship decides where the hits are to be taken."
function allocateHits(s, action) {
  expectStep(s, 'combat', 'hits');
  const side = sideOf(s, action.player);
  const c = s.combat;
  if (!c.needHits.includes(side)) reject('NO_HITS_OWED', 'None of your ships took effective hits');
  if (c.allocations[side]) reject('ALREADY_SUBMITTED', 'Hit allocations for this round are already in');
  const allocations = action.allocations;
  if (!isObject(allocations)) reject('BAD_ALLOCATION', 'Allocations map each of your hit ships to its hits');
  for (const id of Object.keys(allocations)) {
    if (!(id in c.hex.ships)) reject('UNKNOWN_SHIP', `No ship ${id} in this combat`);
    if (c.hex.ships[id].owner !== side) reject('NOT_YOUR_SHIP', `${id} is not yours`);
  }
  for (const [id, n] of Object.entries(c.owed)) {
    if (n > 0 && c.hex.ships[id].owner === side && !(id in allocations)) {
      reject('MISSING_ALLOCATION', `${id} must take ${n} hits`);
    }
  }
  for (const [id, allocation] of Object.entries(allocations)) {
    try {
      checkHitAllocation(c.hex, allOrders(c), id, allocation);
    } catch (e) {
      if (e instanceof RangeError) reject('BAD_ALLOCATION', e.message);
      throw e;
    }
  }
  c.allocations[side] = allocations;
  if (c.needHits.every((sd) => c.allocations[sd])) resolve(s);
}

// Writes the combat hex's ships back onto the map at its star.
function syncHex(s) {
  const star = starById(s.map, s.combat.star);
  for (const id of Object.keys(shipsAt(s, star))) delete s.ships[id];
  for (const [id, rec] of Object.entries(s.combat.hex.ships)) s.ships[id] = { ...rec, q: star.q, r: star.r };
}

function resolve(s) {
  const c = s.combat;
  const r = resolveRound(c.hex, allOrders(c), { ...c.allocations.A, ...c.allocations.B });
  s.lastRound = {
    star: c.star,
    round: c.round,
    shots: r.shots,
    damage: r.damage,
    destroyed: r.destroyed,
    escaped: Object.keys(r.escaped),
    end: r.end,
  };
  c.hex = r.hex;
  Object.assign(c.retreating, r.escaped);
  syncHex(s);
  c.end = r.end;
  c.round += 1;
  c.orders = { A: null, B: null };
  c.owed = null;
  c.needHits = [];
  c.allocations = { A: null, B: null };
  advanceCombat(s);
}

// After a round: place escaped ships (§7 step 4), then forced withdrawal (§7 step 6(c)), then the next
// round or the end of this combat.
function advanceCombat(s) {
  const c = s.combat;
  if (Object.keys(c.retreating).length > 0) c.stage = 'retreats';
  else if (c.end?.reason === 'forced withdrawal') c.stage = 'withdraw';
  else if (c.end) finishCombat(s);
  else c.stage = 'orders';
}

function finishCombat(s) {
  s.combat = null;
  s.contested = contestedStars(s);
  s.step = s.contested.length > 0 ? 'combat' : 'rearrange';
}

// §7 step 4, D-022: the owner of each escaped ship picks its adjacent hex. destinations: { id: { q, r } }.
function placeRetreats(s, action) {
  expectStep(s, 'combat', 'retreats');
  const side = sideOf(s, action.player);
  const c = s.combat;
  const destinations = isObject(action.destinations) ? action.destinations : {};
  for (const id of Object.keys(destinations)) {
    if (c.retreating[id]?.owner !== side) reject('NOT_YOUR_SHIP', `${id} is not one of your escaped ships`);
  }
  const mine = Object.keys(c.retreating).filter((id) => c.retreating[id].owner === side);
  if (mine.length === 0) reject('NOTHING_TO_PLACE', 'You have no escaped ships to place');
  const star = starById(s.map, c.star);
  for (const id of mine) {
    if (!(id in destinations)) reject('MISSING_DESTINATION', `${id} needs a destination hex`);
    checkDestination(s, side, star, destinations[id], id);
  }
  for (const id of mine) {
    const to = destinations[id];
    s.ships[id] = { ...c.retreating[id], q: to.q, r: to.r };
    delete c.retreating[id];
  }
  advanceCombat(s);
}

// §7 step 6(c), D-022, D-023: the phasing player withdraws every ship from the star. destinations place
// each Warpship; pickups ({ warpshipId: [systemshipIds] }) carry off loose Systemships, the rest are destroyed.
function withdraw(s, action) {
  expectStep(s, 'combat', 'withdraw');
  const side = activeSide(s, action.player);
  const c = s.combat;
  const destinations = isObject(action.destinations) ? action.destinations : {};
  const warpships = Object.keys(c.hex.ships).filter((id) => c.hex.ships[id].owner === side && c.hex.ships[id].WG);
  for (const id of Object.keys(destinations)) {
    if (!warpships.includes(id)) reject('NOT_YOUR_SHIP', `${id} is not one of your Warpships in this combat`);
  }
  const star = starById(s.map, c.star);
  for (const id of warpships) {
    if (!(id in destinations)) reject('MISSING_DESTINATION', `${id} needs a destination hex`);
    checkDestination(s, side, star, destinations[id], id);
  }
  let result;
  try {
    result = withdrawSystemships(c.hex.ships, side, isObject(action.pickups) ? action.pickups : {});
  } catch (e) {
    if (e instanceof RangeError) reject('BAD_PICKUP', e.message);
    throw e;
  }
  c.hex.ships = result.ships;
  const leaving = Object.fromEntries(warpships.map((id) => [id, c.hex.ships[id]]));
  for (const id of warpships) delete c.hex.ships[id];
  syncHex(s);
  for (const [id, rec] of Object.entries(leaving)) {
    s.ships[id] = { ...rec, q: destinations[id].q, r: destinations[id].r };
  }
  s.lastRound = { ...s.lastRound, withdrawalLosses: result.destroyed };
  finishCombat(s);
}

// §3 event 5, §8: free rearrangement of the phasing player's Systemships at one star hex.
function rearrangeAction(s, action) {
  expectStep(s, 'rearrange');
  const side = activeSide(s, action.player);
  const star = starById(s.map, action.star);
  if (!star) reject('UNKNOWN_STAR', `No star ${action.star}`);
  const here = shipsAt(s, star);
  if (!Object.values(here).some((sh) => sh.owner === side)) reject('NO_SHIPS_HERE', `You have no ships at ${star.name}`);
  let next;
  try {
    const records = Object.fromEntries(Object.entries(here).map(([id, sh]) => [id, withoutPlace(sh)]));
    next = rearrange(records, side, isObject(action.assignment) ? action.assignment : {});
  } catch (e) {
    if (e instanceof RangeError) reject('BAD_REARRANGEMENT', e.message);
    throw e;
  }
  for (const id of Object.keys(here)) delete s.ships[id];
  for (const [id, rec] of Object.entries(next)) s.ships[id] = { ...rec, q: star.q, r: star.r };
}

// §3 event 6, D-007: the other player's turn; the game-turn advances once both have played.
function endTurn(s, action) {
  expectStep(s, 'rearrange');
  const side = activeSide(s, action.player);
  if (side !== s.sides[s.first]) s.turn += 1;
  s.active = other(side);
  s.contested = [];
  startPlayerTurn(s);
}

const HANDLERS = {
  setFirstPlayer,
  chooseSide,
  build,
  move,
  endMovement,
  chooseCombat,
  orders: submitOrders,
  allocateHits,
  placeRetreats,
  withdraw,
  rearrange: rearrangeAction,
  endTurn,
};
