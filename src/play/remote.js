// The remote controller (Phase 9c): a player whose browser is elsewhere. The game loop asks it like any other
// controller; it turns that into messages. No I/O: attach(send) gives it the way to its player's connection,
// and the connection's messages come back through receive(message).
//
// Messages to the player:
//   { type: 'decide', id, view, side, player, rejection }  a decision is wanted; answer with an action, same id
//   { type: 'outcome', id, ok, code?, message? }           what became of that action
//   { type: 'view', view }                                 the game as the player sees it now (D-039)
//   { type: 'error', code, message }                       a message that could not be taken
// From the player:
//   { type: 'action', id, action }

export function createRemoteController() {
  let send = null;
  let lastView = null;
  let asked = null; // { message, resolve }: the decision waiting for an answer
  let answered = null; // id of the action the loop is applying
  let nextId = 1;
  const post = (message) => send?.(message);
  return {
    kind: 'remote',
    get connected() {
      return send != null;
    },
    // A connection for the player. Sends what they missed: the latest view, and the decision waiting, if any.
    attach(to) {
      send = to;
      if (lastView) post({ type: 'view', view: lastView });
      if (asked) post(asked.message);
    },
    detach() {
      send = null;
    },
    nextAction(view, { side, player, rejection = null }) {
      return new Promise((resolve) => {
        const message = { type: 'decide', id: nextId, view, side, player, rejection };
        nextId += 1;
        asked = { message, resolve };
        post(message);
      });
    },
    outcome(result) {
      post({ type: 'outcome', id: answered, ...result });
    },
    // A problem the player should know of, outside any decision.
    error(code, message) {
      post({ type: 'error', code, message });
    },
    // Any other message for the player (the room's log entries).
    tell(message) {
      post(message);
    },
    // The game as the player sees it, after each accepted action.
    show(view) {
      lastView = view;
      post({ type: 'view', view });
    },
    receive(message) {
      if (message?.type !== 'action') {
        post({ type: 'error', code: 'BAD_MESSAGE', message: `Unknown message: ${message?.type}` });
        return;
      }
      if (!asked || message.id !== asked.message.id) {
        post({ type: 'error', code: 'NOT_ASKED', message: 'No decision with that id is waiting' });
        return;
      }
      const { resolve } = asked;
      answered = asked.message.id;
      asked = null;
      resolve(message.action);
    },
  };
}
