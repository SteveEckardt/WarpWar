// Ship building: attributes, Build Point costs, tech level, validation.
// Rules: docs/rules/classic.md §4.1-4.3, §5.1, §5.2. Rulings: docs/decisions.md.
// Optional modules (fan rules, Phase 8): `modules` lists those a game was created with. With 'armor', ships may
// carry Armor, A (fan §10.2.2, D-042 to D-047). A record has A only if it was built with Armor.

export const SCENARIOS = ['learning', 'basic', 'advanced'];

// Numeric attributes, in ship-record order (§5.1).
export const ATTRIBUTES = ['PD', 'B', 'S', 'T', 'M', 'SR'];

// Armor (fan §10.2.2): 1 BP builds (2 + tech level) points.
export const ARMOR = 'A';
const ARMOR_PER_BP_BASE = 2;

export const WARP_GENERATOR_COST = 5;

function assertScenario(scenario) {
  if (!SCENARIOS.includes(scenario)) {
    throw new RangeError(`Unknown scenario: ${scenario}`);
  }
}

function value(design, attr) {
  return design[attr] ?? 0;
}

// The attributes a game allows: the classic six, and Armor with the armor module.
export const attributesFor = (modules = []) => (modules.includes('armor') ? [...ATTRIBUTES, ARMOR] : ATTRIBUTES);

// BP cost of a design (§5.1). Missiles cost ceil(M / 3) per ship (D-015). Armor costs ceil(A / (2 + level))
// per ship (fan §10.2.2, D-043); level is the tech level the ship is built at.
export function shipCost(design, level = 0) {
  const missiles = Math.ceil(value(design, 'M') / 3);
  const armor = Math.ceil(value(design, ARMOR) / (ARMOR_PER_BP_BASE + level));
  const units = ['PD', 'B', 'S', 'T', 'SR'].reduce((sum, attr) => sum + value(design, attr), 0);
  return units + missiles + armor + (design.WG ? WARP_GENERATOR_COST : 0);
}

// Tech level of a ship built on the given game-turn (§5.2, D-002, D-007).
// Learning and Basic do not use Technology rules: all ships are Level 0 (D-011).
export function techLevel(scenario, turn) {
  assertScenario(scenario);
  if (!Number.isInteger(turn) || turn < 1) {
    throw new RangeError(`Turn must be a positive integer: ${turn}`);
  }
  return scenario === 'advanced' ? Math.floor((turn - 1) / 4) : 0;
}

// Returns a list of { code, message }; empty when the design is legal.
export function validateShip(design, scenario, modules = []) {
  assertScenario(scenario);
  const errors = [];
  const error = (code, message) => errors.push({ code, message });
  const attributes = attributesFor(modules);

  for (const key of Object.keys(design)) {
    if (key !== 'WG' && !attributes.includes(key)) {
      error('UNKNOWN_ATTRIBUTE', `Unknown attribute: ${key}`);
    }
  }
  if (design.WG !== undefined && typeof design.WG !== 'boolean') {
    error('BAD_VALUE', 'WG must be true or false');
  }
  for (const attr of attributes) {
    const v = value(design, attr);
    if (!Number.isInteger(v) || v < 0) {
      error('BAD_VALUE', `${attr} must be a non-negative integer`);
    }
  }
  if (errors.length > 0) return errors;

  const warpship = design.WG === true;
  if (!warpship && value(design, 'SR') > 0) {
    error('SR_ON_SYSTEMSHIP', 'Systemships may not have Systemship Racks');
  }
  // D-014; D-047: Armor counts.
  if (attributes.every((attr) => value(design, attr) === 0)) {
    error('EMPTY_SHIP', 'A ship needs at least one attribute above zero besides the Warp Generator');
  }
  if (scenario === 'learning') {
    if (!warpship) {
      error('WARPSHIPS_ONLY', 'Only Warpships may be built in the Learning scenario');
    } else if (value(design, 'SR') > 0) {
      error('NO_SR_IN_LEARNING', 'Systemship Racks may not be built in the Learning scenario');
    }
  }
  return errors;
}

// A new ship record. `built` keeps the original strengths, which cap repair and
// Missile resupply (§5.3, D-015). Throws if the design is illegal.
export function createShip(design, scenario, turn, modules = []) {
  const errors = validateShip(design, scenario, modules);
  if (errors.length > 0) {
    throw new Error(errors.map((e) => `${e.code}: ${e.message}`).join('; '));
  }
  const stats = Object.fromEntries(ATTRIBUTES.map((attr) => [attr, value(design, attr)]));
  if (value(design, ARMOR) > 0) stats[ARMOR] = value(design, ARMOR);
  return {
    WG: design.WG === true,
    level: techLevel(scenario, turn),
    ...stats,
    built: { ...stats },
  };
}
