// Renders a map file (the Phase 5a format) as an SVG: hex grid, stars, warplines.
// Usage: node tools/render-map.js [map.json] [out.svg]
// Defaults: data/maps/classic-original.json -> docs/maps/classic-original.svg
// No dependencies. Reads the JSON itself; it does not import from src/.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = path.resolve(process.argv[2] ?? path.join(root, 'data/maps/classic-original.json'));
const output = path.resolve(process.argv[3] ?? path.join(root, 'docs/maps/classic-original.svg'));

const SIZE = 30; // hex centre to corner, in SVG units
const SQRT3 = Math.sqrt(3);
const MARGIN = 2; // empty hexes drawn around the outermost star

// Owner colours; anything else (neutral) is gold.
const COLORS = { A: '#2b6cb0', B: '#c53030' };
const NEUTRAL = '#b7791f';

// Pointy-top hexes, axial (q, r): the same layout the map doc's sketch uses (x = q + r/2, y = r).
const centre = ({ q, r }) => ({ x: SIZE * SQRT3 * (q + r / 2), y: SIZE * 1.5 * r });

const hexPoints = (c) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(c.x + SIZE * Math.cos(a)).toFixed(1)},${(c.y + SIZE * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const map = JSON.parse(readFileSync(input, 'utf8'));
if (!Array.isArray(map.stars) || map.stars.length === 0) {
  throw new Error(`${input}: a map needs a list of stars`);
}
const byId = Object.fromEntries(map.stars.map((s) => [s.id, s]));
for (const [a, b] of map.warplines ?? []) {
  if (!byId[a] || !byId[b]) throw new Error(`${input}: warpline ${a} - ${b} names an unknown star`);
}

// The hexes to draw: every hex whose centre lies in the stars' bounding box plus MARGIN hexes all round.
const centres = map.stars.map(centre);
const pad = SIZE * SQRT3 * MARGIN;
const minX = Math.min(...centres.map((c) => c.x)) - pad;
const maxX = Math.max(...centres.map((c) => c.x)) + pad;
const minY = Math.min(...centres.map((c) => c.y)) - SIZE * 1.5 * MARGIN;
const maxY = Math.max(...centres.map((c) => c.y)) + SIZE * 1.5 * MARGIN;

const rs = map.stars.map((s) => s.r);
const qs = map.stars.map((s) => s.q);
const hexes = [];
for (let r = Math.min(...rs) - MARGIN - 1; r <= Math.max(...rs) + MARGIN + 1; r++) {
  for (let q = Math.min(...qs) - 2 * MARGIN - Math.ceil(Math.abs(r) / 2) - 8; q <= Math.max(...qs) + 2 * MARGIN + Math.ceil(Math.abs(r) / 2) + 8; q++) {
    const c = centre({ q, r });
    if (c.x >= minX && c.x <= maxX && c.y >= minY && c.y <= maxY) hexes.push(c);
  }
}

const legendH = 70;
const width = Math.ceil(maxX - minX + 2 * SIZE);
const height = Math.ceil(maxY - minY + 2 * SIZE + legendH);
const ox = SIZE - minX;
const oy = SIZE - minY;
const at = (c) => ({ x: c.x + ox, y: c.y + oy });

const out = [];
out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif">`);
out.push(`<title>${esc(path.basename(input))}</title>`);
out.push(`<rect width="${width}" height="${height}" fill="#0f172a"/>`);

out.push(`<g fill="#162238" stroke="#2a3a57" stroke-width="1">`);
for (const c of hexes) out.push(`<polygon points="${hexPoints(at(c))}"/>`);
out.push(`</g>`);

out.push(`<g stroke="#e2e8f0" stroke-width="2" stroke-linecap="round" opacity="0.85">`);
for (const [a, b] of map.warplines ?? []) {
  const p = at(centre(byId[a]));
  const q = at(centre(byId[b]));
  out.push(`<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}"><title>${esc(byId[a].name)} - ${esc(byId[b].name)}</title></line>`);
}
out.push(`</g>`);

for (const s of map.stars) {
  const p = at(centre(s));
  const base = s.baseOwner != null;
  const color = COLORS[s.baseOwner] ?? (base ? '#718096' : NEUTRAL);
  const radius = base ? 15 : 11;
  out.push(`<g><title>${esc(s.name)} (${s.q}, ${s.r})${base ? ` base of ${esc(s.baseOwner)}` : ''}</title>`);
  if (base) out.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${radius + 5}" fill="none" stroke="${color}" stroke-width="2"/>`);
  out.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${radius}" fill="${color}" stroke="#f8fafc" stroke-width="2"/>`);
  out.push(`<text x="${p.x.toFixed(1)}" y="${(p.y - radius - (base ? 11 : 7)).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="${base ? 700 : 500}" fill="#f8fafc" stroke="#0f172a" stroke-width="3" paint-order="stroke">${esc(s.name)}</text>`);
  out.push(`<text x="${p.x.toFixed(1)}" y="${(p.y + radius + 14).toFixed(1)}" text-anchor="middle" font-size="9" fill="#94a3b8">${s.q},${s.r}</text>`);
  out.push(`</g>`);
}

const ly = height - legendH + 28;
const legend = [
  [COLORS.A, 'Base star, player A', 15],
  [COLORS.B, 'Base star, player B', 15],
  [NEUTRAL, 'Neutral star', 11],
];
let lx = SIZE + 10;
for (const [color, label, radius] of legend) {
  out.push(`<circle cx="${lx}" cy="${ly}" r="${Math.min(radius, 12)}" fill="${color}" stroke="#f8fafc" stroke-width="2"/>`);
  out.push(`<text x="${lx + 20}" y="${ly + 5}" font-size="13" fill="#e2e8f0">${label}</text>`);
  lx += 200;
}
out.push(`<line x1="${lx}" y1="${ly}" x2="${lx + 36}" y2="${ly}" stroke="#e2e8f0" stroke-width="2" stroke-linecap="round"/>`);
out.push(`<text x="${lx + 46}" y="${ly + 5}" font-size="13" fill="#e2e8f0">Warpline (1 MP, any length)</text>`);
out.push(`<text x="${SIZE + 10}" y="${ly + 28}" font-size="11" fill="#94a3b8">Hexes are axial (q, r), shown under each star. Generated by tools/render-map.js from ${esc(path.basename(input))}.</text>`);

out.push(`</svg>`);
writeFileSync(output, out.join('\n') + '\n');
console.log(`${path.relative(root, input)} -> ${path.relative(root, output)} (${map.stars.length} stars, ${(map.warplines ?? []).length} warplines, ${hexes.length} hexes)`);
