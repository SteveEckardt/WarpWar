// The page's client for remote play (Phase 9c-2): a WebSocket to the server's /play (tools/play-server.js), where
// the game is held. To the page it is the player at this screen, like a local controller: `request` is the
// decision waiting ({ view, side, player, rejection }) and submit(action) answers it. `view` is the game as this
// player sees it (D-039) and `log` the public log, both as the server last sent them. onUpdate(fn) is called
// whenever any of that changes, or the connection closes.

// The server's address, from the page's: the same host, /play.
export const playUrl = (location) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/play`;

class PlayError extends Error {
  constructor({ code, message }) {
    super(message);
    this.code = code;
  }
}

// Resolves with a client once connected; rejects if the connection cannot be made.
export function connectPlay(url, { WebSocketImpl = globalThis.WebSocket } = {}) {
  const ws = new WebSocketImpl(url);
  let call = null; // { expect, resolve, reject }: the create, info or join waiting for its answer
  let answer = null; // { id, resolve }: the submitted action waiting for its outcome
  const listeners = [];
  const updated = () => listeners.forEach((fn) => fn());

  const client = {
    kind: 'local',
    view: null,
    request: null,
    log: [],
    player: null,
    code: null,
    settings: null,
    closed: false,
    onUpdate(fn) {
      listeners.push(fn);
    },
    close() {
      ws.close();
    },
    create(settings) {
      return ask({ type: 'create', ...settings }, 'created').then((m) => m.code);
    },
    info(code) {
      return ask({ type: 'info', code }, 'info');
    },
    join(code, player) {
      return ask({ type: 'join', code, player }, 'joined').then((m) => {
        client.player = m.player;
        client.code = String(code).toUpperCase();
        client.settings = m.settings;
        return m.settings;
      });
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
      call = { expect, resolve, reject };
      ws.send(JSON.stringify(message));
    });
  }

  const handlers = {
    view(m) {
      client.view = m.view;
    },
    decide(m) {
      client.request = { id: m.id, view: m.view, side: m.side, player: m.player, rejection: m.rejection };
    },
    log(m) {
      client.log = [...client.log, ...m.entries];
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

  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(client));
    ws.addEventListener('error', () => reject(new Error(`Could not reach the server at ${url}`)));
    ws.addEventListener('close', () => {
      client.closed = true;
      call?.reject(new PlayError({ code: 'CLOSED', message: 'The connection to the server closed' }));
      call = null;
      updated();
    });
    ws.addEventListener('message', (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (call && m.type === call.expect) {
        call.resolve(m);
        call = null;
      }
      handlers[m.type]?.(m);
      updated();
    });
  });
}
