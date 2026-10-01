// A hard-coded sample game for Phase 7a, so the map has something to show. The state is built by replaying
// fixed actions through the engine, so it is always a state the rules allow.
// Game-turn 1 of a Learning game: ann (A) and bob (B) build and move; bob's B1 stops on A1 at Uruk, and the
// game waits at the combat step for bob to pick the contested star.

import { createGame, applyAction } from '../engine/game.js';

const jump = (to) => ({ type: 'jump', to });
const move = (q, r) => ({ type: 'move', to: { q, r } });

const ACTIONS = [
  { type: 'setFirstPlayer', player: 'ann' },
  { type: 'chooseSide', player: 'bob', side: 'B' },
  // 23 + 17 = 40 BP. A2: 5 + 6 + 3 + 1 + ceil(6 / 3) = 17.
  {
    type: 'build', player: 'ann', ships: [
      { id: 'A1', design: { WG: true, PD: 8, B: 6, S: 4 }, at: 'ur' },
      { id: 'A2', design: { WG: true, PD: 6, B: 3, T: 1, M: 6 }, at: 'ur' },
    ],
  },
  { type: 'move', player: 'ann', ship: 'A1', path: [jump('isin'), jump('uruk')] },
  { type: 'move', player: 'ann', ship: 'A2', path: [jump('isin')] },
  { type: 'endMovement', player: 'ann' },
  { type: 'endTurn', player: 'ann' },
  // 30 + 10 = 40 BP.
  {
    type: 'build', player: 'bob', ships: [
      { id: 'B1', design: { WG: true, PD: 10, B: 10, S: 5 }, at: 'nippur' },
      { id: 'B2', design: { WG: true, PD: 3, B: 2 }, at: 'nippur' },
    ],
  },
  { type: 'move', player: 'bob', ship: 'B1', path: [jump('umma'), jump('girsu'), move(1, 0), move(0, 0), move(-1, 0), move(-2, 0)] },
  { type: 'move', player: 'bob', ship: 'B2', path: [jump('umma')] },
  { type: 'endMovement', player: 'bob' },
];

// mapData: the parsed data/maps/classic-original.json.
export function sampleGame(mapData) {
  let state = createGame({ map: mapData, scenario: 'learning', players: ['ann', 'bob'] });
  for (const action of ACTIONS) {
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`Sample game: ${action.type} by ${action.player} rejected: ${r.code}: ${r.message}`);
    state = r.state;
  }
  return state;
}
