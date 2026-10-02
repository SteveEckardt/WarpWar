// The page's client for remote play (Phase 9c-2): a WebSocket to the server's /play (tools/play-server.js), where
// the game is held. To the page it is the player at this screen, like a local controller: `request` is the
// decision waiting ({ view, side, player, rejection }) and submit(action) answers it. `view` is the game as this
// player sees it (D-039) and `log` the public log, both as the server last sent them. onUpdate(fn) is called
// whenever any of that changes, or the connection does.
//
// Reconnecting (Phase 9c-3): joining gives the seat a token. If the connection drops, the client opens a new one
// and rejoins with it, trying again after each of retryMs; the server sends what was missed. `connected` is
// false meanwhile. It gives up (`closed`) when the tries run out or the game is gone; and does not try when its
// seat was taken back in another window (`replaced`), or when close() was called. rejoin(code, token) takes a
// seat back on a fresh client, after the page is reloaded. `presence` says which players are connected.

// The server's address, from the page's: the same host, /play.
export const playUrl = (location) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/play`;

// Tries to reconnect, the wait before each in milliseconds.
export const RETRY_MS = [500, 1000, 2000, 4000, 8000, 15000];
// The server's close code for a seat taken back on another connection (tools/play-server.js).
const REPLACED = 4001;

class PlayError extends Error {
  constructor({ code, message }) {
    super(message);
    this.code = code;
  }
}

// Resolves with a client once connected; rejects if the connection cannot be made.
export function connectPlay(url, { WebSocketImpl = globalThis.WebSocket, retryMs = RETRY_MS } = {}) {
  let ws = null;
  let call = null; // { expect, resolve, reject }: the create, info, join or rejoin waiting for its answer
  let answer = null; // { id, resolve }: the submitted action waiting for its outcome
  let leaving = false;
  const listeners = [];
  const updated = () => listeners.forEach((fn) => fn());

  const client = {
    kind: 'local',
    view: null,
    request: null,
    log: [],
    player: null,
    code: null,
    token: null,
    settings: null,
    presence: {},
    connected: false,
    closed: false,
    replaced: false,
    // The WebSocket in use (for diagnostics and tests).
    get socket() {
      return ws;
    },
    onUpdate(fn) {
      listeners.push(fn);
    },
    close() {
      leaving = true;
      ws.close();
    },
    create(settings) {
      return ask({ type: 'create', ...settings }, 'created').then((m) => m.code);
    },
    info(code) {
      return ask({ type: 'info', code }, 'info');
    },
    join(code, player) {
      return ask({ type: 'join', code, player }, 'joined').then((m) => m.settings);
    },
    rejoin(code, token) {
      return ask({ type: 'rejoin', code, token }, 'joined').then((m) => m.settings);
    },
    // Answers the waiting decision. Resolves with its outcome: { ok } or { ok: false, code, message }.
    submit(action) {
      const asked = client.request;
      if (!asked) return Promise.resolve({ ok: false, code: 'NOT_ASKED', message: 'No decision is waiting for this player' });
      client.request = null;
      ws.send(JSON.stringify({ type: 'action', id: asked.id, action }));
      return new Promise((resolve) => {
        answer = { id: asked.id, resolve };
      });
    },
  };

  function ask(message, expect) {
    return new Promise((resolve, reject) => {
      call = { expect, resolve, reject, code: message.code };
      ws.send(JSON.stringify(message));
    });
  }

  const handlers = {
    joined(m, asked) {
      Object.assign(client, { player: m.player, token: m.token, settings: m.settings, presence: { ...m.connected } });
      client.code = String(asked?.code ?? client.code).toUpperCase();
      // What was missed follows: the whole log, the latest view, the decision waiting.
      client.log = [];
      client.request = null;
    },
    view(m) {
      client.view = m.view;
    },
    decide(m) {
      client.request = { id: m.id, view: m.view, side: m.side, player: m.player, rejection: m.rejection };
    },
    log(m) {
      client.log = [...client.log, ...m.entries];
    },
    presence(m) {
      client.presence = { ...client.presence, [m.player]: m.connected };
    },
    outcome(m) {
      if (answer?.id !== m.id) return;
      const { ok, code, message } = m;
      answer.resolve(ok ? { ok } : { ok, code, message });
      answer = null;
    },
    error(m) {
      if (call) {
        call.reject(new PlayError(m));
        call = null;
      } else if (answer) {
        answer.resolve({ ok: false, code: m.code, message: m.message });
        answer = null;
      } else {
        client.error = { code: m.code, message: m.message };
      }
    },
  };

  const giveUp = () => {
    client.closed = true;
    client.connected = false;
    updated();
  };

  // A new connection after a drop, rejoining the seat; the next try if it fails.
  function reconnect(attempt) {
    if (attempt >= retryMs.length) return giveUp();
    setTimeout(() => {
      open().then(
        () => client.rejoin(client.code, client.token).then(() => updated(), (e) => {
          // The game or the seat is gone: no point trying again.
          if (e.code === 'NO_GAME' || e.code === 'BAD_TOKEN') {
            leaving = true;
            ws.close();
            giveUp();
          }
        }),
        () => reconnect(attempt + 1),
      );
    }, retryMs[attempt]);
    return null;
  }

  // Opens a WebSocket and wires it in. Resolves once open.
  function open() {
    return new Promise((resolve, reject) => {
      const socket = new WebSocketImpl(url);
      let opened = false;
      socket.addEventListener('open', () => {
        opened = true;
        ws = socket;
        client.connected = true;
        resolve(client);
      });
      socket.addEventListener('error', () => {
        if (!opened) reject(new Error(`Could not reach the server at ${url}`));
      });
      socket.addEventListener('close', (e) => {
        if (!opened || socket !== ws) return;
        client.connected = false;
        call?.reject(new PlayError({ code: 'CLOSED', message: 'The connection to the server closed' }));
        call = null;
        answer?.resolve({ ok: false, code: 'DISCONNECTED', message: 'The connection to the server dropped' });
        answer = null;
        if (e.code === REPLACED) client.replaced = true;
        const over = client.view?.step === 'over';
        if (leaving || client.replaced || !client.token || over) {
          giveUp();
          return;
        }
        updated();
        reconnect(0);
      });
      socket.addEventListener('message', (e) => {
        if (socket !== ws) return;
        let m;
        try {
          m = JSON.parse(e.data);
        } catch {
          return;
        }
        const waiting = call && m.type === call.expect ? call : null;
        if (waiting) call = null;
        handlers[m.type]?.(m, waiting);
        waiting?.resolve(m);
        updated();
      });
    });
  }

  return open();
}
