// Combat round at one star hex: order validation, round resolution, end conditions.
// Rules: docs/rules/classic.md §7, §7.1, §7.2, §7.3. Rulings: docs/decisions.md.
// Retreat and forced-withdrawal destination hexes are chosen in game.js.

import { lookupCRT, TACTICS } from './crt.js';
import { hitDamage, roundDamage, applyHits, isDestroyed, MISSILES_PER_HIT, SHELLS_PER_HIT } from './damage.js';
import { carriedIds, freeRacks, cargoLost } from './carrying.js';

export const QUIET_ROUNDS_TO_WITHDRAW = 3;

const ORDER_KEYS = ['tactic', 'D', 'B', 'S', 'T', 'C', 'E', 'beamTarget', 'missiles', 'cannonTarget', 'shells', 'pickup', 'drop'];
// Fan §10.2.3: each Cannon fires 1 to 3 Shells a round.
const MAX_SHELLS_PER_CANNON = 3;
const MISS = { result: 'miss', bonus: 0 };

// A contested hex. ships: { id: ship record + owner } (records from createShip). A Warpship record may
// carry Systemships: `carrying: { id: record }`. They take no part in combat until dropped (D-020).
// gone remembers ships that left earlier rounds: { id: { owner, how: 'destroyed' | 'escaped' } }.
export function createHex(ships) {
  for (const [id, ship] of Object.entries(ships)) {
    if (typeof ship.owner !== 'string') {
      throw new RangeError(`Ship ${id} needs an owner`);
    }
  }
  return { ships, gone: {}, quietRounds: 0 };
}

const power = (order, key) => order[key] ?? 0;
const missilesOf = (order) => order.missiles ?? [];
const shellsOf = (order) => order.shells ?? [];
const sum = (list) => list.reduce((a, b) => a + b, 0);

// Order for one ship (§7.1): { tactic, D, B, S, T, beamTarget?, missiles?: [{ target, drive }], pickup?, drop? }.
// pickup / drop name one Systemship (§7.3, D-027).
// Returns a list of { code, message }; empty when the order is legal for that ship.
export function validateOrder(ship, order) {
  const errors = [];
  const error = (code, message) => errors.push({ code, message });

  for (const key of Object.keys(order)) {
    if (!ORDER_KEYS.includes(key)) error('UNKNOWN_FIELD', `Unknown order field: ${key}`);
  }
  if (!TACTICS.includes(order.tactic)) {
    error('BAD_TACTIC', `Unknown tactic: ${order.tactic}`);
  } else if (order.tactic === 'retreat' && !ship.WG) {
    error('SYSTEMSHIP_RETREAT', 'Systemships may not select the Retreat tactic');
  }
  for (const key of ['D', 'B', 'S', 'T', 'C', 'E']) {
    const v = power(order, key);
    if (!Number.isInteger(v) || v < 0) error('BAD_VALUE', `${key} must be a non-negative integer`);
  }
  const missiles = missilesOf(order);
  if (!Array.isArray(missiles)) {
    error('BAD_VALUE', 'missiles must be a list');
  } else {
    for (const m of missiles) {
      if (!Number.isInteger(m?.drive) || m.drive < 1) {
        error('BAD_MISSILE_DRIVE', 'A Missile drive setting must be an integer of 1 or more');
      }
    }
  }
  if (errors.length > 0) return errors;

  const { D, B, S, T, C, E } = Object.fromEntries(['D', 'B', 'S', 'T', 'C', 'E'].map((k) => [k, power(order, k)]));
  if (D + B + S + T + C + E > ship.PD) {
    error('OVER_PD', `Allocated ${D + B + S + T + C + E} power but PD is ${ship.PD}`);
  }
  // Fan §7.1.1, §5.2: ECM is powered up to the ECM built, alongside any other system.
  if (E > (ship.E ?? 0)) error('OVER_ECM', `ECM powered at ${E} but built to ${ship.E ?? 0}`);
  if (B > ship.B) error('OVER_BEAM', `Beam powered at ${B} but built to ${ship.B}`);
  if (S > ship.S) error('OVER_SCREEN', `Screen powered at ${S} but built to ${ship.S}`);
  if (T > ship.T) error('OVER_TUBES', `${T} Tubes powered but ship has ${ship.T}`);
  if (order.beamTarget != null && B < 1) {
    error('UNPOWERED_BEAM', 'A Beam must be powered at 1 or more to fire (D-030)');
  }
  if (missiles.length > T) error('TUBES', `${missiles.length} Missiles fired with ${T} Tubes powered`);
  if (missiles.length > ship.M) error('NO_MISSILES', `${missiles.length} Missiles fired from a stock of ${ship.M}`);
  if (missiles.length > 0 && (B > 0 || S > 0)) {
    error('MISSILES_WITH_BEAM_OR_SCREEN', 'No Beam or Screen power on a round that fires Missiles');
  }
  validateCannons(ship, order, C, B, S, error);
  if (order.pickup != null || order.drop != null) validateCarryOrder(ship, order, error);
  return errors;
}

// Fan §10.2.3, §10.2.4, D-048: each powered Cannon (1 PD) fires one burst of 1 to 3 Shells, all at one target;
// `shells` lists the bursts, one per Cannon. Not with a Beam or Screen; with Missiles, yes.
function validateCannons(ship, order, C, B, S, error) {
  const shells = shellsOf(order);
  const ok = Array.isArray(shells) && shells.length === C
    && shells.every((n) => Number.isInteger(n) && n >= 1 && n <= MAX_SHELLS_PER_CANNON);
  if (!ok) {
    error('BAD_SHELLS', `Give each of the ${C} Cannons powered a burst of 1 to ${MAX_SHELLS_PER_CANNON} Shells`);
    return;
  }
  if (C === 0) {
    if (order.cannonTarget != null) error('UNPOWERED_CANNONS', 'Cannons must be powered (1 PD each) to fire');
    return;
  }
  if (C > (ship.C ?? 0)) error('OVER_CANNONS', `${C} Cannons powered but ship has ${ship.C ?? 0}`);
  const fired = shells.reduce((sum, n) => sum + n, 0);
  if (fired > (ship.SH ?? 0)) error('NO_SHELLS', `${fired} Shells fired from a stock of ${ship.SH ?? 0}`);
  if (order.cannonTarget == null) error('UNAIMED_CANNONS', 'Powered Cannons need a target');
  if (B > 0 || S > 0) error('CANNONS_WITH_BEAM_OR_SCREEN', 'No Beam or Screen power on a round that fires Cannons (fan §10.2.3)');
}

// §7.3: Drive 0, Screen 0, Dodge or Retreat, Beam allowed, no Missiles; one Systemship per Warpship (D-027).
function validateCarryOrder(ship, order, error) {
  if (!ship.WG) {
    error('SYSTEMSHIP_CARRIES', 'Systemships may not carry other Systemships');
    return;
  }
  if (order.pickup != null && order.drop != null) {
    error('ONE_PER_ROUND', 'Only one Systemship may be picked up or dropped per Warpship per round');
    return;
  }
  if (order.tactic !== 'dodge' && order.tactic !== 'retreat') {
    error('CARRY_TACTIC', 'A Warpship picking up or dropping a Systemship must Dodge or Retreat');
  }
  if (power(order, 'D') > 0 || power(order, 'S') > 0) {
    error('CARRY_DRIVE_SCREEN', 'A Warpship picking up or dropping a Systemship allocates Drive 0 and Screen 0');
  }
  if (missilesOf(order).length > 0) {
    error('CARRY_NO_MISSILES', 'A Warpship picking up or dropping a Systemship may not fire Missiles');
  }
  if (power(order, 'C') > 0) {
    error('CARRY_NO_CANNONS', 'A Warpship picking up or dropping a Systemship may not fire Cannons (fan §5.6)');
  }
  if (order.drop != null && !carriedIds(ship).includes(order.drop)) {
    error('NOT_CARRIED', `${order.drop} is not aboard this Warpship`);
  }
  if (order.pickup != null && freeRacks(ship) < 1) {
    error('NO_FREE_RACK', 'No free Systemship Rack to pick up into');
  }
}

// Checks every ship has a legal order and that every target is an enemy ship in the hex.
// Returns a list of { ship, code, message }.
export function validateOrders(hex, orders) {
  const errors = [];
  for (const id of Object.keys(orders)) {
    if (!(id in hex.ships)) errors.push({ ship: id, code: 'UNKNOWN_SHIP', message: `No ship ${id} in this hex` });
  }
  for (const [id, ship] of Object.entries(hex.ships)) {
    const order = orders[id];
    if (!order) {
      errors.push({ ship: id, code: 'MISSING_ORDER', message: 'Every ship needs an order' });
      continue;
    }
    const own = validateOrder(ship, order);
    errors.push(...own.map((e) => ({ ship: id, ...e })));
    const targets = [order.beamTarget, order.cannonTarget, ...missilesOf(order).map((m) => m?.target)].filter((t) => t != null);
    for (const t of targets) {
      if (!(t in hex.ships) || hex.ships[t].owner === ship.owner) {
        errors.push({ ship: id, code: 'BAD_TARGET', message: `${t} is not an enemy ship in this hex` });
      }
    }
  }

  // A pickup names a friendly Systemship on the hex (carried ones are not in hex.ships), once only.
  const pickedBy = {};
  for (const [id, ship] of Object.entries(hex.ships)) {
    const target = orders[id]?.pickup;
    if (target == null || !ship.WG) continue;
    const t = hex.ships[target];
    if (!t || t.owner !== ship.owner || t.WG) {
      errors.push({ ship: id, code: 'BAD_PICKUP', message: `${target} is not a friendly Systemship on this hex` });
    } else if (target in pickedBy) {
      errors.push({ ship: id, code: 'DOUBLE_PICKUP', message: `${target} is already being picked up by ${pickedBy[target]}` });
    } else {
      pickedBy[target] = id;
    }
  }
  // A picked-up Systemship may power only Screens: no weapon (§7.3) and Drive 0 (D-031).
  for (const target of Object.keys(pickedBy)) {
    const o = orders[target];
    if (o && power(o, 'D') > 0) {
      errors.push({ ship: target, code: 'PICKED_UP_DRIVE', message: 'A Systemship being picked up has Drive 0 that round (D-031)' });
    }
    if (o && (power(o, 'B') > 0 || power(o, 'T') > 0 || power(o, 'C') > 0 || o.beamTarget != null || missilesOf(o).length > 0)) {
      errors.push({ ship: target, code: 'PICKED_UP_CANNOT_FIRE', message: 'A Systemship being picked up may not fire any weapon' });
    }
  }
  return errors;
}

// Hits a ship can still take: one per point, Missiles in groups of 3 (§7.2.2). Only free racks count
// (D-021), so `racks` is the free SR. A carried Systemship's own capacity is added by the caller.
function hitCapacity(ship, racks = ship.SR) {
  return ship.PD + ship.B + ship.S + ship.T + racks + Math.ceil(ship.M / MISSILES_PER_HIT)
    + (ship.C ?? 0) + Math.ceil((ship.SH ?? 0) / SHELLS_PER_HIT);
}

// Hits the owner places after Armor has taken its share (D-042).
const toPlace = (damage) => damage.effective - (damage.armor ?? 0);

const sumHits = (hits) => Object.values(hits).reduce((sum, h) => sum + h, 0);
const withoutOwner = ({ owner, ...record }) => record;
function endReason(hows) {
  if (hows.every((h) => h === 'destroyed')) return 'all destroyed';
  if (hows.every((h) => h === 'escaped')) return 'all escaped';
  return 'all destroyed or escaped';
}

// Validates the orders and reads every weapon off the CRT. Returns { ids, afterFiring, shots, damage }.
// --- ECM (fan §7.1.1, §7.2; D-052, D-053) ---

// The Missiles fired at a ship this round: [{ ref: 'firer:index', from, drive, level }]. A Missile's tech level is
// its firing ship's (D-053).
export function incomingMissiles(hex, orders, id) {
  const out = [];
  for (const [from, order] of Object.entries(orders)) {
    for (const [i, m] of missilesOf(order ?? {}).entries()) {
      if (m?.target === id) out.push({ ref: `${from}:${i}`, from, drive: m.drive, level: hex.ships[from]?.level ?? 0 });
    }
  }
  return out;
}

// The sides, A before B, with a ship that powered ECM and has Missiles fired at it.
export function needsEcm(hex, orders) {
  const sides = new Set();
  for (const [id, ship] of Object.entries(hex.ships)) {
    if (power(orders[id] ?? {}, 'E') > 0 && incomingMissiles(hex, orders, id).length > 0) sides.add(ship.owner);
  }
  return ['A', 'B'].filter((sd) => sides.has(sd));
}

const ecmShift = (ecm, target, ref) => ecm?.[target]?.[ref]?.shift ?? 0;

// Checks one side's ECM. ecm: { shipId: { ref: { points, shift } } }. Throws RangeError.
// Points on a ship's Missiles total no more than the ECM it powered; a Missile's working points are its points
// plus (ship TL − Missile TL), never below 0 (D-053); its Drive moves by no more than that, up or down, and never
// below 1 (D-052).
export function checkEcm(hex, orders, side, ecm) {
  const plural = (n) => `${n} working point${n === 1 ? '' : 's'}`;
  for (const [id, byMissile] of Object.entries(ecm)) {
    const ship = hex.ships[id];
    if (!ship || ship.owner !== side) throw new RangeError(`${id} is not yours`);
    const powered = power(orders[id] ?? {}, 'E');
    const incoming = incomingMissiles(hex, orders, id);
    let used = 0;
    for (const [ref, entry] of Object.entries(byMissile ?? {})) {
      const missile = incoming.find((m) => m.ref === ref);
      if (!missile) throw new RangeError(`${ref} is not a Missile fired at ${id}`);
      const { points, shift } = entry ?? {};
      if (!Number.isInteger(points) || points < 1) throw new RangeError(`${id}: ECM on ${ref} takes a whole number of points, 1 or more`);
      if (!Number.isInteger(shift)) throw new RangeError(`${id}: the Drive change on ${ref} is a whole number`);
      const working = Math.max(0, points + ship.level - missile.level);
      if (Math.abs(shift) > working) {
        throw new RangeError(`${id}: ${points} points on ${ref} give ${plural(working)} (D-053); it cannot move the Missile ${Math.abs(shift)}`);
      }
      if (missile.drive + shift < 1) throw new RangeError(`${id}: a Missile's Drive cannot go below 1 (D-052)`);
      used += points;
    }
    if (used > powered) throw new RangeError(`${id}: ${used} ECM points but ${powered} powered`);
  }
}

// checked: the orders were validated when they were written, so they are not checked again.
function prepareRound(hex, orders, ecm = {}, { checked = false } = {}) {
  const errors = checked ? [] : validateOrders(hex, orders);
  if (errors.length > 0) {
    throw new Error(errors.map((e) => `${e.ship}: ${e.code}: ${e.message}`).join('; '));
  }
  const ids = Object.keys(hex.ships);

  // D-029: Missiles leave the stock when fired and cannot absorb this round's hits. Shells too (D-050).
  const afterFiring = Object.fromEntries(ids.map((id) => {
    const ship = hex.ships[id];
    const after = { ...ship, M: ship.M - missilesOf(orders[id]).length };
    if (ship.SH != null) after.SH = ship.SH - sum(shellsOf(orders[id]));
    return [id, after];
  }));

  // Every weapon is read off the CRT from the orders as written (§7 step 2).
  const shots = [];
  for (const id of ids) {
    const order = orders[id];
    const firer = hex.ships[id];
    const fire = (to, weapon, row, drive, shift = 0) => {
      const cell = lookupCRT(row, orders[to].tactic, drive - power(orders[to], 'D'));
      // D-025: a Missile's Escapes is a Miss. A Beam's Escapes does no damage either.
      const damage = hitDamage(weapon, firer.level, cell.result === 'escapes' ? MISS : cell);
      if (weapon.type === 'shells') shots.push({ from: id, to, weapon: 'cannon', shells: weapon.count, result: cell.result, bonus: cell.bonus, damage });
      else shots.push({ from: id, to, weapon: weapon.type, result: cell.result, bonus: cell.bonus, damage, ...(shift ? { ecm: shift } : {}) });
    };
    if (order.beamTarget != null) {
      fire(order.beamTarget, { type: 'beam', power: order.B }, order.tactic, power(order, 'D'));
    }
    // D-052: a Missile flies at its written Drive moved by the target's ECM, if any.
    for (const [i, m] of missilesOf(order).entries()) {
      const shift = ecmShift(ecm, m.target, `${id}:${i}`);
      fire(m.target, { type: 'missile' }, 'attack', m.drive + shift, shift);
    }
    // Fan §5.4, D-048: each Cannon's burst is read like Beam fire, on the ship's own tactic and Drive.
    if (order.cannonTarget != null) {
      for (const n of shellsOf(order)) fire(order.cannonTarget, { type: 'shells', count: n }, order.tactic, power(order, 'D'));
    }
  }

  // All hits on a ship are summed, then its Screen subtracts once (§7.2.2). Then Armor takes what it can of the
  // effective hits, on its own (D-042): `armor` is set only for a ship built with Armor.
  const damage = {};
  for (const id of ids) {
    const hits = shots.filter((s) => s.to === id).map((s) => s.damage);
    damage[id] = roundDamage(hits, power(orders[id], 'S'), hex.ships[id].level);
    if (hex.ships[id].A > 0) damage[id].armor = Math.min(damage[id].effective, hex.ships[id].A);
  }
  return { ids, afterFiring, shots, damage };
}

// How many of its effective hits one ship must take this round, and where they can go.
function hitLimits(hex, orders, afterFiring, id, effective) {
  const base = hex.ships[id];
  const dropId = orders[id].drop;
  // D-020, D-021: only Systemships carried into the round, and not dropped in it, can take its hits.
  const cargo = Object.fromEntries(Object.entries(base.carrying ?? {}).filter(([cid]) => cid !== dropId));
  // D-032: a rack in use for a pickup is occupied. D-033: a rack freed by a drop is empty.
  const pickRack = orders[id].pickup != null ? 1 : 0;
  const racks = base.SR - Object.keys(cargo).length - pickRack;
  // Most the ship can take apart from the pickup rack: its hittable attributes, its carried Systemships,
  // and the racks they free.
  // A carried Systemship's Armor takes hits too (D-046).
  const capacity = Object.values(cargo).reduce((sum, rec) => sum + hitCapacity(rec) + (rec.A ?? 0) + 1, hitCapacity(afterFiring[id], racks));
  return { cargo, racks, capacity, owed: Math.min(effective, capacity + pickRack) };
}

// Checks one ship's hit allocation and applies it, after its Armor's share (D-042). Returns { ship, cargoAfter }.
// Throws RangeError.
function takeHits(hex, orders, afterFiring, id, damage, hitAllocation = {}) {
  const { cargo, racks, capacity, owed } = hitLimits(hex, orders, afterFiring, id, toPlace(damage));
  const { carried: cargoHits = {}, ...allocation } = hitAllocation;
  if ('A' in allocation) throw new RangeError(`${id}: Armor takes hits on its own (D-042)`);
  for (const [cid, hits] of Object.entries(cargoHits)) {
    if (!(cid in cargo)) throw new RangeError(`${id} does not carry ${cid}`);
    // D-046: hits on a carried Systemship go to its Armor until it is used up.
    const onArmor = hits.A ?? 0;
    if (sumHits(hits) > onArmor && onArmor < (cargo[cid].A ?? 0)) {
      throw new RangeError(`${cid}: hits on a carried Systemship go to its Armor first (D-046)`);
    }
  }
  // D-034: a carried Systemship destroyed by this round's hits frees its rack, which can then take hits.
  const cargoAfter = Object.fromEntries(Object.entries(cargo).map(([cid, rec]) => [cid, applyHits(rec, cargoHits[cid] ?? {})]));
  const freed = Object.values(cargoAfter).filter(isDestroyed).length;
  // D-035: the pickup rack takes a hit only when it is the last hittable thing left. The pickup then fails.
  const rackHit = owed > capacity ? 1 : 0;
  if ((allocation.SR ?? 0) > racks + freed + rackHit) {
    throw new RangeError(`${id} has ${racks + freed + rackHit} racks that can take hits; occupied racks cannot (D-021, D-032, D-034)`);
  }
  const assigned = sumHits(allocation) + Object.values(cargoHits).reduce((sum, h) => sum + sumHits(h), 0);
  if (assigned !== owed) {
    throw new RangeError(`${id} takes ${owed} hits but ${assigned} were assigned`);
  }
  const armored = damage.armor > 0 ? { ...afterFiring[id], A: afterFiring[id].A - damage.armor } : afterFiring[id];
  return { ship: applyHits(armored, allocation), cargoAfter };
}

// A round's shots and damage, and the hits each ship's owner must allocate (§7 step 2, §7.2.2), before any
// allocation is made. Returns { shots, damage, owed: { id: hits } }. Throws if the orders are illegal.
export function hitsOwed(hex, orders, ecm = {}) {
  const { ids, afterFiring, shots, damage } = prepareRound(hex, orders, ecm);
  const owed = Object.fromEntries(ids.map((id) => [id, hitLimits(hex, orders, afterFiring, id, toPlace(damage[id])).owed]));
  return { shots, damage, owed };
}

// Checks one ship's hit allocation on its own, exactly as resolveRound will. Throws RangeError.
// The orders are those already accepted this round, so they are not validated again: a side's view of the hex
// (D-039) holds only counters for enemy ships, and the hits on its own ship need nothing more.
export function checkHitAllocation(hex, orders, id, allocation, ecm = {}) {
  if (!(id in hex.ships)) throw new RangeError(`Hit allocation for unknown ship: ${id}`);
  const { afterFiring, damage } = prepareRound(hex, orders, ecm, { checked: true });
  takeHits(hex, orders, afterFiring, id, damage[id], allocation);
}

// Resolves one round (§7 steps 2-5). `hitAllocations` is the owners' choice, { id: { PD, B, ... } }:
// for each ship it must total min(effective hits, hits the ship can still take). The engine
// does not choose. A Warpship's allocation may also hit its carried Systemships (D-021):
// { PD: 1, carried: { S20: { PD: 2 } } }. Occupied racks cannot take hits (D-021, D-032), except the
// rack in use for a pickup when it is the Warpship's last hittable attribute (D-035).
// Returns { hex, shots, damage, destroyed, escaped, end }: `destroyed` lists ids (carried ones too),
// `escaped` maps id to the ship's damaged record, Systemships aboard included (the caller places it;
// no destination is chosen here).
// `end` is null while both sides still have ships, otherwise { reason } (plus `owners` when a side is eliminated).
export function resolveRound(hex, orders, hitAllocations = {}, ecm = {}) {
  const { ids, afterFiring, shots, damage } = prepareRound(hex, orders, ecm);
  for (const id of Object.keys(hitAllocations)) {
    if (!(id in hex.ships)) throw new RangeError(`Hit allocation for unknown ship: ${id}`);
  }
  const survivors = {};
  const gone = { ...hex.gone };
  const destroyed = [];
  const escaped = {};
  for (const id of ids) {
    const base = hex.ships[id];
    const owner = base.owner;
    const dropId = orders[id].drop;
    const { ship, cargoAfter } = takeHits(hex, orders, afterFiring, id, damage[id], hitAllocations[id]);
    const kept = {};
    for (const [cid, hit] of Object.entries(cargoAfter)) {
      if (isDestroyed(hit)) {
        destroyed.push(cid);
        gone[cid] = { owner, how: 'destroyed' };
      } else {
        kept[cid] = hit;
      }
    }
    if (base.carrying) ship.carrying = kept;

    // A Systemship dropped this round is on the hex whatever becomes of its Warpship (§7.3).
    if (dropId != null) survivors[dropId] = { ...base.carrying[dropId], owner };

    if (isDestroyed(ship)) {
      destroyed.push(id);
      gone[id] = { owner, how: 'destroyed' };
      for (const cid of cargoLost(ship)) { // §5.1: a destroyed Warpship destroys what it carries
        destroyed.push(cid);
        gone[cid] = { owner, how: 'destroyed' };
      }
      continue;
    }
    // D-024: only Beam fire counts; with none on it the ship escapes. D-026: Missile hits don't stop it.
    // D-049: Cannon fire counts as Beam fire does.
    const beams = shots.filter((s) => s.to === id && (s.weapon === 'beam' || s.weapon === 'cannon'));
    if (orders[id].tactic === 'retreat' && beams.every((s) => s.result === 'escapes')) {
      escaped[id] = ship;
      gone[id] = { owner, how: 'escaped' };
      continue;
    }
    survivors[id] = ship;
  }

  // Pickups (§7.3, D-032, D-035): the Systemship was in the round as a ship. It goes aboard if it survived and
  // its Warpship survived with the rack; otherwise it stays on the hex.
  for (const id of ids) {
    const target = orders[id].pickup;
    const carrier = escaped[id] ?? survivors[id];
    if (target == null || !carrier || !(target in survivors) || freeRacks(carrier) < 1) continue;
    carrier.carrying = { ...(carrier.carrying ?? {}), [target]: withoutOwner(survivors[target]) };
    delete survivors[target];
    // D-028: a Systemship picked up on the round its Warpship escapes leaves with it.
    if (id in escaped) gone[target] = { owner: carrier.owner, how: 'escaped' };
  }

  const quiet = ids.every((id) => damage[id].effective === 0);
  const next = { ships: survivors, gone, quietRounds: quiet ? hex.quietRounds + 1 : 0 };

  // End conditions (§7 step 6). A side with no ships left ends the combat.
  const present = new Set(Object.values(survivors).map((s) => s.owner));
  const eliminated = [...new Set(ids.map((id) => hex.ships[id].owner))].filter((o) => !present.has(o));
  let end = null;
  if (eliminated.length > 0) {
    const reasons = eliminated.map((o) =>
      endReason(Object.values(gone).filter((g) => g.owner === o).map((g) => g.how)),
    );
    end = { reason: reasons.every((r) => r === reasons[0]) ? reasons[0] : 'all destroyed or escaped', owners: eliminated };
  } else if (next.quietRounds >= QUIET_ROUNDS_TO_WITHDRAW) {
    end = { reason: 'forced withdrawal' };
  }
  return { hex: next, shots, damage, destroyed, escaped, end };
}
