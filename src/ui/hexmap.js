// The hex map of a game state as an SVG string: grid, warplines, stars and ship markers.
// Same drawing approach as tools/render-map.js: pointy-top axial hexes, the same sizes and owner colours.
// Pure: no DOM. The page puts the string into the document.

export const SIZE = 30; // hex centre to corner, in SVG units
const SQRT3 = Math.sqrt(3);
const MARGIN = 2; // empty hexes drawn around the outermost star

// Side colours; a star with no base owner is gold.
export const COLORS = { A: '#2b6cb0', B: '#c53030' };
const NEUTRAL = '#b7791f';

export const centre = ({ q, r }) => ({ x: SIZE * SQRT3 * (q + r / 2), y: SIZE * 1.5 * r });

const hexPoints = (c) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(c.x + SIZE * Math.cos(a)).toFixed(1)},${(c.y + SIZE * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const f = (n) => n.toFixed(1);

// The ships on the map in one hex, as [id, record] pairs: side A first, then by id.
export function shipsAt(state, hex) {
  return Object.entries(state.ships)
    .filter(([, sh]) => sh.q === hex.q && sh.r === hex.r)
    .sort(([a, x], [b, y]) => x.owner.localeCompare(y.owner) || a.localeCompare(b, undefined, { numeric: true }));
}

// The hexes to draw, D-040: the map's own bounds (column x = q + r/2, row r). A map without bounds is drawn to the same rule the
// original map's bounds were set by: the stars plus MARGIN hexes all round.
function frame(map) {
  const { stars } = map;
  const xs = stars.map((s) => s.q + s.r / 2);
  const rs = stars.map((s) => s.r);
  const bounds = map.bounds ?? {
    x: [Math.min(...xs) - MARGIN, Math.max(...xs) + MARGIN],
    r: [Math.min(...rs) - MARGIN, Math.max(...rs) + MARGIN],
  };
  const hexes = [];
  for (let r = bounds.r[0]; r <= bounds.r[1]; r++) {
    for (let q = Math.ceil(bounds.x[0] - r / 2); q <= Math.floor(bounds.x[1] - r / 2); q++) hexes.push({ q, r });
  }
  return {
    hexes,
    minX: SIZE * SQRT3 * bounds.x[0],
    maxX: SIZE * SQRT3 * bounds.x[1],
    minY: SIZE * 1.5 * bounds.r[0],
    maxY: SIZE * 1.5 * bounds.r[1],
  };
}

// While planning a move: the path so far as a line, and each legal next step as a clickable target.
// plan: { path: [hex], targets: [{ step, to }] } as from planInfo in movement.js.
function planOverlay(plan, at, map) {
  const out = [];
  const points = plan.path.map((h) => at(centre(h))).map((p) => `${f(p.x)},${f(p.y)}`).join(' ');
  out.push(`<polyline class="plan-path" points="${points}" fill="none" stroke="#facc15" stroke-width="3" stroke-dasharray="6 4" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>`);
  const start = at(centre(plan.path[0]));
  out.push(`<circle cx="${f(start.x)}" cy="${f(start.y)}" r="5" fill="#facc15" pointer-events="none"/>`);
  for (const [i, t] of plan.targets.entries()) {
    const label = t.step.type === 'jump' ? `Jump to ${map.stars.find((s) => s.id === t.step.to)?.name ?? t.step.to}` : `Move to ${t.to.q}, ${t.to.r}`;
    out.push(`<polygon class="target ${t.step.type}" data-target="${i}" points="${hexPoints(at(centre(t.to)))}" tabindex="0" role="button" aria-label="${esc(label)}"><title>${esc(label)} (1 MP)</title></polygon>`);
  }
  return out;
}

// One counter per side in a hex, right of the hex centre: A above, B below. Shows the number of ships
// on the map there; carried Systemships ride inside their carrier's counter.
function markers(state, at) {
  const groups = new Map();
  for (const sh of Object.values(state.ships)) {
    const key = `${sh.q},${sh.r}|${sh.owner}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const out = [];
  for (const [key, n] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const [hex, side] = key.split('|');
    const [q, r] = hex.split(',').map(Number);
    const p = at(centre({ q, r }));
    const x = p.x + 14;
    const y = side === 'A' ? p.y - 17 : p.y + 3;
    out.push(`<g class="ships" data-side="${esc(side)}" data-hex="${hex}">`);
    out.push(`<title>${n} ship${n === 1 ? '' : 's'} of side ${esc(side)}</title>`);
    out.push(`<rect x="${f(x)}" y="${f(y)}" width="18" height="14" rx="3" fill="${COLORS[side] ?? '#718096'}" stroke="#f8fafc" stroke-width="1.5"/>`);
    out.push(`<text x="${f(x + 9)}" y="${f(y + 11)}" text-anchor="middle" font-size="11" font-weight="700" fill="#f8fafc">${n}</text>`);
    out.push(`</g>`);
  }
  return out;
}

// options.selected: the id of a star to highlight. selectedHex: a space hex { q, r } to highlight.
// plan: a move being planned (see planOverlay).
export function renderMap(state, { selected = null, selectedHex = null, plan = null } = {}) {
  const { stars, warplines } = state.map;
  const byId = Object.fromEntries(stars.map((s) => [s.id, s]));
  const { hexes, minX, maxX, minY, maxY } = frame(state.map);
  const width = Math.ceil(maxX - minX + 2 * SIZE);
  const height = Math.ceil(maxY - minY + 2 * SIZE);
  const at = (c) => ({ x: c.x + SIZE - minX, y: c.y + SIZE - minY });

  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif" role="img" aria-label="Star map">`);
  out.push(`<rect width="${width}" height="${height}" fill="#0f172a"/>`);

  out.push(`<g fill="#162238" stroke="#2a3a57" stroke-width="1">`);
  for (const h of hexes) out.push(`<polygon class="hex" data-hex="${h.q},${h.r}" points="${hexPoints(at(centre(h)))}"/>`);
  out.push(`</g>`);
  if (selectedHex) out.push(`<polygon points="${hexPoints(at(centre(selectedHex)))}" fill="none" stroke="#facc15" stroke-width="3" pointer-events="none"/>`);

  out.push(`<g stroke="#e2e8f0" stroke-width="2" stroke-linecap="round" opacity="0.85">`);
  for (const [a, b] of warplines) {
    const p = at(centre(byId[a]));
    const q = at(centre(byId[b]));
    out.push(`<line x1="${f(p.x)}" y1="${f(p.y)}" x2="${f(q.x)}" y2="${f(q.y)}"><title>${esc(byId[a].name)} - ${esc(byId[b].name)}</title></line>`);
  }
  out.push(`</g>`);

  for (const s of stars) {
    const p = at(centre(s));
    const base = s.baseOwner != null;
    const color = COLORS[s.baseOwner] ?? (base ? '#718096' : NEUTRAL);
    const radius = base ? 15 : 11;
    const cls = s.id === selected ? 'star selected' : 'star';
    out.push(`<g class="${cls}" data-star="${esc(s.id)}" tabindex="0" role="button" aria-label="${esc(s.name)}">`);
    out.push(`<title>${esc(s.name)} (${s.q}, ${s.r})${base ? ` base of ${esc(s.baseOwner)}` : ''}</title>`);
    out.push(`<circle class="hit" cx="${f(p.x)}" cy="${f(p.y)}" r="${SIZE * 0.85}" fill="transparent"/>`);
    if (s.id === selected) out.push(`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${radius + 10}" fill="none" stroke="#facc15" stroke-width="3"/>`);
    if (base) out.push(`<circle class="base-ring" cx="${f(p.x)}" cy="${f(p.y)}" r="${radius + 5}" fill="none" stroke="${color}" stroke-width="2"/>`);
    out.push(`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${radius}" fill="${color}" stroke="#f8fafc" stroke-width="2"/>`);
    out.push(`<text x="${f(p.x)}" y="${f(p.y - radius - (base ? 11 : 7))}" text-anchor="middle" font-size="13" font-weight="${base ? 700 : 500}" fill="#f8fafc" stroke="#0f172a" stroke-width="3" paint-order="stroke">${esc(s.name)}</text>`);
    out.push(`<text x="${f(p.x)}" y="${f(p.y + radius + 14)}" text-anchor="middle" font-size="9" fill="#94a3b8">${s.q},${s.r}</text>`);
    out.push(`</g>`);
  }

  out.push(...markers(state, at));
  if (plan) out.push(...planOverlay(plan, at, state.map));
  out.push(`</svg>`);
  return out.join('\n');
}
