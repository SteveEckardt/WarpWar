// Combat round at one star hex: order validation, round resolution, end conditions.
// Rules: docs/rules/classic.md §7, §7.1, §7.2. Rulings: docs/decisions.md.
// Not built yet: Systemship pickup and drop (§7.3) and retreat destination hexes (see docs/roadmap.md).

import { lookupCRT, TACTICS } from './crt.js';
import { hitDamage, roundDamage, applyHits, isDestroyed, MISSILES_PER_HIT } from './damage.js';

export const QUIET_ROUNDS_TO_WITHDRAW = 3;

const ORDER_KEYS = ['tactic', 'D', 'B', 'S', 'T', 'beamTarget', 'missiles'];
const MISS = { result: 'miss', bonus: 0 };

// A contested hex. ships: { id: ship record + owner } (records from createShip).
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

// Order for one ship (§7.1): { tactic, D, B, S, T, beamTarget?, missiles?: [{ target, drive }] }.
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
  for (const key of ['D', 'B', 'S', 'T']) {
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

  const { D, B, S, T } = Object.fromEntries(['D', 'B', 'S', 'T'].map((k) => [k, power(order, k)]));
  if (D + B + S + T > ship.PD) {
    error('OVER_PD', `Allocated ${D + B + S + T} power but PD is ${ship.PD}`);
  }
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
  return errors;
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
    const targets = [order.beamTarget, ...missilesOf(order).map((m) => m?.target)].filter((t) => t != null);
    for (const t of targets) {
      if (!(t in hex.ships) || hex.ships[t].owner === ship.owner) {
        errors.push({ ship: id, code: 'BAD_TARGET', message: `${t} is not an enemy ship in this hex` });
      }
    }
  }
  return errors;
}

// Hits a ship can still take: one per point, Missiles in groups of 3 (§7.2.2).
function hitCapacity(ship) {
  return ship.PD + ship.B + ship.S + ship.T + ship.SR + Math.ceil(ship.M / MISSILES_PER_HIT);
}

function endReason(hows) {
  if (hows.every((h) => h === 'destroyed')) return 'all destroyed';
  if (hows.every((h) => h === 'escaped')) return 'all escaped';
  return 'all destroyed or escaped';
}

// Resolves one round (§7 steps 2-5). `hitAllocations` is the owners' choice, { id: { PD, B, ... } }:
// for each ship it must total min(effective hits, hits the ship can still take). The engine
// does not choose. Returns { hex, shots, damage, destroyed, escaped, end }: `destroyed` lists ids,
// `escaped` maps id to the ship's damaged record (the caller places it; no destination is chosen here).
// `end` is null while both sides still have ships, otherwise { reason } (plus `owners` when a side is eliminated).
export function resolveRound(hex, orders, hitAllocations = {}) {
  const errors = validateOrders(hex, orders);
  if (errors.length > 0) {
    throw new Error(errors.map((e) => `${e.ship}: ${e.code}: ${e.message}`).join('; '));
  }
  const ids = Object.keys(hex.ships);

  // D-029: Missiles leave the stock when fired and cannot absorb this round's hits.
  const afterFiring = Object.fromEntries(
    ids.map((id) => [id, { ...hex.ships[id], M: hex.ships[id].M - missilesOf(orders[id]).length }]),
  );

  // Every weapon is read off the CRT from the orders as written (§7 step 2).
  const shots = [];
  for (const id of ids) {
    const order = orders[id];
    const firer = hex.ships[id];
    const fire = (to, weapon, row, drive) => {
      const cell = lookupCRT(row, orders[to].tactic, drive - power(orders[to], 'D'));
      // D-025: a Missile's Escapes is a Miss. A Beam's Escapes does no damage either.
      const damage = hitDamage(weapon, firer.level, cell.result === 'escapes' ? MISS : cell);
      shots.push({ from: id, to, weapon: weapon.type, result: cell.result, bonus: cell.bonus, damage });
    };
    if (order.beamTarget != null) {
      fire(order.beamTarget, { type: 'beam', power: order.B }, order.tactic, power(order, 'D'));
    }
    for (const m of missilesOf(order)) fire(m.target, { type: 'missile' }, 'attack', m.drive);
  }

  // All hits on a ship are summed, then its Screen subtracts once (§7.2.2).
  const damage = {};
  for (const id of ids) {
    const hits = shots.filter((s) => s.to === id).map((s) => s.damage);
    damage[id] = roundDamage(hits, power(orders[id], 'S'), hex.ships[id].level);
  }

  for (const id of Object.keys(hitAllocations)) {
    if (!(id in hex.ships)) throw new RangeError(`Hit allocation for unknown ship: ${id}`);
  }
  const survivors = {};
  const gone = { ...hex.gone };
  const destroyed = [];
  const escaped = {};
  for (const id of ids) {
    const allocation = hitAllocations[id] ?? {};
    const owed = Math.min(damage[id].effective, hitCapacity(afterFiring[id]));
    const assigned = Object.values(allocation).reduce((sum, h) => sum + h, 0);
    if (assigned !== owed) {
      throw new RangeError(`${id} takes ${owed} hits but ${assigned} were assigned`);
    }
    const ship = applyHits(afterFiring[id], allocation);
    const owner = hex.ships[id].owner;
    if (isDestroyed(ship)) {
      destroyed.push(id);
      gone[id] = { owner, how: 'destroyed' };
      continue;
    }
    // D-024: only Beam fire counts; with none on it the ship escapes. D-026: Missile hits don't stop it.
    const beams = shots.filter((s) => s.to === id && s.weapon === 'beam');
    if (orders[id].tactic === 'retreat' && beams.every((s) => s.result === 'escapes')) {
      escaped[id] = ship;
      gone[id] = { owner, how: 'escaped' };
      continue;
    }
    survivors[id] = ship;
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
