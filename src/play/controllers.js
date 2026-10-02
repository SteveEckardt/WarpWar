// Player controllers: who makes each side's decisions. The game loop (loop.js) asks the acting side's controller
// for its next action and hands it a view of the game, viewFor(state, side), never the state itself.
//
// A controller is { kind, nextAction(view, { side, rejection }) => action or Promise<action>, outcome?(result) }.
// rejection is null, or the engine's { code, message } for the controller's last action, which it is asked to
// replace. outcome is told { ok } or { ok: false, code, message } once each of its actions is applied or refused.
//
//   local: a player at this screen. The UI shows the waiting request's view and submits the player's action.
//   computer: the computer opponent (Phase 9b). Not implemented.
//   remote: a player over the network (Phase 9c). Not implemented.

export const CONTROLLER_KINDS = ['local', 'computer', 'remote'];

// A player at this screen. `request` is the decision waiting for them: { view, side, rejection }, or null.
// submit(action) answers it and resolves to the outcome once the loop has applied or refused the action.
export function createLocalController() {
  let waiting = null; // { view, side, rejection, resolve }
  let settle = null;
  return {
    kind: 'local',
    get request() {
      return waiting && { view: waiting.view, side: waiting.side, rejection: waiting.rejection };
    },
    nextAction(view, { side, rejection = null }) {
      return new Promise((resolve) => {
        waiting = { view, side, rejection, resolve };
      });
    },
    submit(action) {
      if (!waiting) return Promise.resolve({ ok: false, code: 'NOT_ASKED', message: 'No decision is waiting for this player' });
      const { resolve } = waiting;
      waiting = null;
      return new Promise((done) => {
        settle = done;
        resolve(action);
      });
    },
    outcome(result) {
      const done = settle;
      settle = null;
      done?.(result);
    },
  };
}

const notImplemented = (kind) => ({
  kind,
  nextAction() {
    throw new Error(`The ${kind} controller is not implemented`);
  },
});

export const createComputerController = () => notImplemented('computer');
export const createRemoteController = () => notImplemented('remote');

const FACTORIES = { local: createLocalController, computer: createComputerController, remote: createRemoteController };

export function createController(kind) {
  if (!CONTROLLER_KINDS.includes(kind)) throw new RangeError(`A controller is ${CONTROLLER_KINDS.join(', ')}, not: ${kind}`);
  return FACTORIES[kind]();
}
