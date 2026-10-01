// Map: axial hex geometry and the star/warpline map format.
// Rules: docs/rules/classic.md §2, §6. Rulings: D-006, D-019 in docs/decisions.md.
//
// The engine takes the map as data: { stars: [{ id, name, q, r, baseOwner }], warplines: [[idA, idB]] }.
// Positions are axial { q, r }. Display IDs like "1720" are for humans and never reach the engine.
// A warpline is a pair of star ids; the hexes it crosses are ordinary space hexes (D-006).

// The six neighbours of a hex, as axial offsets.
export const DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const isHex = (h) => h != null && Number.isInteger(h.q) && Number.isInteger(h.r);

export const sameHex = (a, b) => a.q === b.q && a.r === b.r;

export const neighbors = (h) => DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));

// Number of single-hex moves between two hexes.
export function distance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export const isAdjacent = (a, b) => distance(a, b) === 1;

const MAP_KEYS = ['stars', 'warplines'];
const STAR_KEYS = ['id', 'name', 'q', 'r', 'baseOwner'];
const nonEmpty = (v) => typeof v === 'string' && v.length > 0;

// Returns a list of { code, message }; empty when the map data is legal.
export function validateMap(data) {
  const errors = [];
  const error = (code, message) => errors.push({ code, message });

  if (data == null || typeof data !== 'object' || !Array.isArray(data.stars)) {
    return [{ code: 'BAD_MAP', message: 'A map needs a list of stars' }];
  }
  for (const key of Object.keys(data)) {
    if (!MAP_KEYS.includes(key)) error('UNKNOWN_FIELD', `Unknown map field: ${key}`);
  }
  const warplines = data.warplines ?? [];
  if (!Array.isArray(warplines)) error('BAD_MAP', 'warplines must be a list');

  const ids = new Set();
  const hexes = new Set();
  for (const star of data.stars) {
    const label = star?.id ?? '(no id)';
    for (const key of Object.keys(star ?? {})) {
      if (!STAR_KEYS.includes(key)) error('UNKNOWN_FIELD', `Star ${label}: unknown field ${key}`);
    }
    if (!nonEmpty(star?.id)) error('BAD_STAR', 'A star needs an id');
    if (!nonEmpty(star?.name)) error('BAD_STAR', `Star ${label}: needs a name`);
    if (!isHex(star)) error('BAD_STAR', `Star ${label}: q and r must be integers`);
    if (star?.baseOwner != null && !nonEmpty(star.baseOwner)) {
      error('BAD_STAR', `Star ${label}: baseOwner must be a player name or null`);
    }
    if (nonEmpty(star?.id)) {
      if (ids.has(star.id)) error('DUPLICATE_STAR', `Duplicate star id: ${star.id}`);
      ids.add(star.id);
    }
    if (isHex(star)) {
      const key = `${star.q},${star.r}`;
      if (hexes.has(key)) error('STAR_HEX_TAKEN', `Two stars on hex ${key}`);
      hexes.add(key);
    }
  }

  if (Array.isArray(warplines)) {
    const pairs = new Set();
    for (const line of warplines) {
      const [a, b] = Array.isArray(line) && line.length === 2 ? line : [];
      if (!ids.has(a) || !ids.has(b) || a === b) {
        error('BAD_WARPLINE', `A warpline joins two different known stars: ${JSON.stringify(line)}`);
        continue;
      }
      const key = [a, b].sort().join('|');
      if (pairs.has(key)) error('DUPLICATE_WARPLINE', `Duplicate warpline: ${a} - ${b}`);
      pairs.add(key);
    }
  }
  return errors;
}

// A normalised copy of valid map data. Throws if the map is illegal; does not touch the input.
export function loadMap(data) {
  const errors = validateMap(data);
  if (errors.length > 0) {
    throw new Error(errors.map((e) => `${e.code}: ${e.message}`).join('; '));
  }
  return {
    stars: data.stars.map((s) => ({ id: s.id, name: s.name, q: s.q, r: s.r, baseOwner: s.baseOwner ?? null })),
    warplines: (data.warplines ?? []).map(([a, b]) => [a, b]),
  };
}

export const starAt = (map, hex) => map.stars.find((s) => sameHex(s, hex)) ?? null;

export const starById = (map, id) => map.stars.find((s) => s.id === id) ?? null;

// Warplines are two-way: true if a line joins the stars in either order.
export const hasWarpline = (map, idA, idB) =>
  map.warplines.some(([a, b]) => (a === idA && b === idB) || (a === idB && b === idA));
