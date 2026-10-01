// Damage resolution: hit damage, Screen absorption, applying hits to a ship record.
// Rules: docs/rules/classic.md §5.2, §7.2.1, §7.2.2. Rulings: docs/decisions.md.
// Carried Systemships are not modelled yet (D-021); damage to them waits for the phase that builds carrying.

import { ATTRIBUTES } from './ships.js';

export const MISSILE_BASE_HITS = 2;
export const MISSILES_PER_HIT = 3;

function assertCount(v, label, min = 0) {
  if (!Number.isInteger(v) || v < min) {
    throw new RangeError(`${label} must be an integer of at least ${min}: ${v}`);
  }
}

// Hits one weapon inflicts for a CRT cell (§5.2, §7.2.1).
// weapon: { type: 'beam', power } or { type: 'missile' }; level is the firing ship's tech level.
// Beam: power + level + bonus. Missile: 2 + level + bonus. A miss does 0.
// Only hit and miss cells are accepted; "escapes" is D-025 (OPEN).
export function hitDamage(weapon, level, cell) {
  assertCount(level, 'Tech level');
  if (cell?.result === 'escapes') {
    throw new RangeError('An escapes result has no damage ruling (D-025)');
  }
  if (cell?.result !== 'hit' && cell?.result !== 'miss') {
    throw new RangeError(`Unknown CRT result: ${cell?.result}`);
  }
  let base;
  if (weapon?.type === 'beam') {
    assertCount(weapon.power, 'Beam power', 1); // D-030
    base = weapon.power;
  } else if (weapon?.type === 'missile') {
    base = MISSILE_BASE_HITS;
  } else {
    throw new RangeError(`Unknown weapon: ${weapon?.type}`);
  }
  if (cell.result === 'miss') return 0;
  assertCount(cell.bonus, 'CRT bonus');
  return base + level + cell.bonus;
}

// Hits a powered Screen absorbs: power plus tech level; an unpowered Screen adds nothing (§5.2, §7.2.2).
export function screenAbsorption(screenPower, level) {
  assertCount(screenPower, 'Screen power');
  assertCount(level, 'Tech level');
  return screenPower === 0 ? 0 : screenPower + level;
}

// A round's damage to one target: all weapons' hits are summed, then the Screen
// subtracts once from the total (§7.2.2). hits is a list of per-weapon hit counts.
export function roundDamage(hits, screenPower, level) {
  hits.forEach((h) => assertCount(h, 'Hits'));
  const total = hits.reduce((sum, h) => sum + h, 0);
  const absorbed = Math.min(total, screenAbsorption(screenPower, level));
  return { total, absorbed, effective: total - absorbed };
}

export function isDestroyed(ship) {
  return ATTRIBUTES.every((attr) => ship[attr] === 0);
}

// Applies the owner's chosen allocation of effective hits, { PD, B, S, T, M, SR }: hits per attribute.
// Each hit removes one point, except Missiles: a hit removes 3, or all of 1-2 left (§7.2.2).
// The Warp Generator never takes damage. The ship's Missile stock must already exclude
// Missiles fired this round (D-029). Does not check the allocation against the round's
// effective hits; the caller does. Returns a new ship record.
export function applyHits(ship, allocation) {
  const next = { ...ship, built: { ...ship.built } };
  for (const [attr, hits] of Object.entries(allocation)) {
    if (!ATTRIBUTES.includes(attr)) {
      throw new RangeError(`Cannot assign hits to: ${attr}`);
    }
    assertCount(hits, `Hits on ${attr}`);
    const capacity = attr === 'M' ? Math.ceil(ship.M / MISSILES_PER_HIT) : ship[attr];
    if (hits > capacity) {
      throw new RangeError(`${hits} hits on ${attr} exceeds what it can take (${capacity})`);
    }
    next[attr] = attr === 'M' ? Math.max(0, ship.M - hits * MISSILES_PER_HIT) : ship[attr] - hits;
  }
  return next;
}
