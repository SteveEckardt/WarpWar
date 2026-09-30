// Combat Results Table lookup.
// Rules: docs/rules/classic.md §7.2 (Table 1). Returns the raw cell only; what
// "escapes" means for a Missile is D-025 (OPEN) and is not interpreted here.

export const TACTICS = ['attack', 'dodge', 'retreat'];

const MISS = { result: 'miss', bonus: 0 };
const HIT = { result: 'hit', bonus: 0 };
const HIT_1 = { result: 'hit', bonus: 1 };
const HIT_2 = { result: 'hit', bonus: 2 };
const ESCAPES = { result: 'escapes', bonus: 0 };

// Per firing tactic: row bands in order, each { min, max, cells }, where cells
// are [target attack, target dodge, target retreat]. Open ends use ±Infinity.
const TABLE = {
  attack: [
    { min: -Infinity, max: -3, cells: [MISS, MISS, ESCAPES] },
    { min: -2, max: -1, cells: [HIT, MISS, ESCAPES] },
    { min: 0, max: 1, cells: [HIT_2, MISS, MISS] },
    { min: 2, max: 2, cells: [HIT_1, HIT_1, MISS] },
    { min: 3, max: 4, cells: [MISS, HIT, HIT] },
    { min: 5, max: Infinity, cells: [MISS, MISS, MISS] },
  ],
  dodge: [
    { min: -Infinity, max: -4, cells: [MISS, MISS, ESCAPES] },
    { min: -3, max: -2, cells: [MISS, HIT, ESCAPES] },
    { min: -1, max: 0, cells: [HIT, HIT, ESCAPES] },
    { min: 1, max: 2, cells: [HIT, MISS, ESCAPES] },
    { min: 3, max: Infinity, cells: [MISS, MISS, ESCAPES] },
  ],
  retreat: [
    { min: -Infinity, max: -2, cells: [MISS, MISS, ESCAPES] },
    { min: -1, max: 0, cells: [HIT, MISS, ESCAPES] },
    { min: 1, max: Infinity, cells: [MISS, MISS, ESCAPES] },
  ],
};

function assertTactic(tactic, label) {
  if (!TACTICS.includes(tactic)) {
    throw new RangeError(`Unknown ${label} tactic: ${tactic}`);
  }
}

// driveDifference = firing Drive - target Drive (§7.2).
// Returns { result: 'miss' | 'hit' | 'escapes', bonus: 0 | 1 | 2 }.
export function lookupCRT(firingTactic, targetTactic, driveDifference) {
  assertTactic(firingTactic, 'firing');
  assertTactic(targetTactic, 'target');
  if (!Number.isInteger(driveDifference)) {
    throw new RangeError(`Drive difference must be an integer: ${driveDifference}`);
  }
  const row = TABLE[firingTactic].find((r) => driveDifference >= r.min && driveDifference <= r.max);
  return { ...row.cells[TACTICS.indexOf(targetTactic)] };
}
