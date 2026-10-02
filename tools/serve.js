// A minimal static file server for the UI. Node built-ins only.
// Usage: npm start (or node tools/serve.js [port] [--lan]). Serves the repository root on http://127.0.0.1:8000/,
// and remote play at ws://…/play (play-server.js, Phase 9c). --lan listens on the local network too: anyone on it
// can reach the server, so it is off unless asked for.
// GET and HEAD only; nothing outside the root, and no dotfiles or dot-directories.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { attachPlay } from './play-server.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

function send(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

// The file a URL path names under root, or null if it is outside root or names a dotfile.
function resolvePath(root, urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(urlPath, 'http://localhost').pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;
  const file = path.resolve(root, '.' + path.posix.normalize('/' + pathname));
  const rel = path.relative(root, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (rel.split(path.sep).some((part) => part.startsWith('.'))) return null;
  return file;
}

export function createStaticServer(root) {
  root = path.resolve(root);
  return createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }
    let file = resolvePath(root, req.url);
    if (!file) return send(res, 404, 'Not found');
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      send(res, 404, 'Not found');
    }
  });
}

// Command-line arguments: a port (else PORT, else 8000) and --lan.
export function parseArgs(args, env = {}) {
  const lan = args.includes('--lan');
  const rest = args.filter((a) => a !== '--lan');
  const port = Number(rest[0] ?? env.PORT ?? 8000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError(`Not a port: ${rest[0] ?? env.PORT}`);
  return { port, host: lan ? '0.0.0.0' : '127.0.0.1', lan };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { port, host, lan } = parseArgs(process.argv.slice(2), process.env);
  const server = createStaticServer(root);
  attachPlay(server, { map: JSON.parse(readFileSync(path.join(root, 'data/maps/classic-original.json'), 'utf8')) });
  server.listen(port, host, () => {
    console.log(`WarpWar UI: http://127.0.0.1:${port}/`);
    if (!lan) return;
    const addresses = Object.values(networkInterfaces()).flat().filter((a) => a.family === 'IPv4' && !a.internal);
    for (const a of addresses) console.log(`On the local network: http://${a.address}:${port}/`);
  });
}
