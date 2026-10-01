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

// The hexes to draw: every hex whose centre lies in the stars' bounding box plus MARGIN hexes all round.
function frame(stars) {
  const centres = stars.map(centre);
  const minX = Math.min(...centres.map((c) => c.x)) - SIZE * SQRT3 * MARGIN;
  const maxX = Math.max(...centres.map((c) => c.x)) + SIZE * SQRT3 * MARGIN;
  const minY = Math.min(...centres.map((c) => c.y)) - SIZE * 1.5 * MARGIN;
  const maxY = Math.max(...centres.map((c) => c.y)) + SIZE * 1.5 * MARGIN;
  const rs = stars.map((s) => s.r);
  const qs = stars.map((s) => s.q);
  const hexes = [];
  for (let r = Math.min(...rs) - MARGIN - 1; r <= Math.max(...rs) + MARGIN + 1; r++) {
    const spread = 2 * MARGIN + Math.ceil(Math.abs(r) / 2) + 8;
    for (let q = Math.min(...qs) - spread; q <= Math.max(...qs) + spread; q++) {
      const c = centre({ q, r });
      if (c.x >= minX && c.x <= maxX && c.y >= minY && c.y <= maxY) hexes.push(c);
    }
  }
  return { hexes, minX, maxX, minY, maxY };
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

// options.selected: the id of a star to highlight.
export function renderMap(state, { selected = null } = {}) {
  const { stars, warplines } = state.map;
  const byId = Object.fromEntries(stars.map((s) => [s.id, s]));
  const { hexes, minX, maxX, minY, maxY } = frame(stars);
  const width = Math.ceil(maxX - minX + 2 * SIZE);
  const height = Math.ceil(maxY - minY + 2 * SIZE);
  const at = (c) => ({ x: c.x + SIZE - minX, y: c.y + SIZE - minY });

  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif" role="img" aria-label="Star map">`);
  out.push(`<rect width="${width}" height="${height}" fill="#0f172a"/>`);

  out.push(`<g fill="#162238" stroke="#2a3a57" stroke-width="1">`);
  for (const c of hexes) out.push(`<polygon points="${hexPoints(at(c))}"/>`);
  out.push(`</g>`);

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
  out.push(`</svg>`);
  return out.join('\n');
}
