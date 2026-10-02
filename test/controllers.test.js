import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, applyAction } from '../src/engine/game.js';
import { actingSide, viewFor } from '../src/engine/view.js';
import { createController, createLocalController, CONTROLLER_KINDS } from '../src/play/controllers.js';
import { createGameLoop } from '../src/play/loop.js';
import { actor, needsHandoff } from '../src/ui/view.js';
import { renderMap, shipsAt } from '../src/ui/hexmap.js';
import { renderHexPanel } from '../src/ui/panel.js';
import { EMPTY_DESIGN, renderBuilder, renderBuildCheck } from '../src/ui/builder.js';
import { renderMovement, planInfo } from '../src/ui/movement.js';
import { renderRearrange } from '../src/ui/rearrange.js';
import {
  renderChoose, blankOrders, renderOrders, renderOrderCheck, renderEcm, renderEcmCheck, renderHits, renderHitCheck,
  placementShips, placementTargets, renderPlacement,
} from '../src/ui/combat.js';

// Phase 9a: player controllers. The game loop asks the acting side's controller for an action, handing it
// viewFor(state, side), never the state (D-039). Hot-seat is two local controllers and plays as before.
const mapData = JSON.parse(readFileSync(new URL('../data/maps/classic-original.json', import.meta.url), 'utf8'));
const jump = (to) => ({ type: 'jump', to });
const move = (q, r) => ({ type: 'move', to: { q, r } });

function play(state, ...actions) {
  for (const action of actions) {
    const r = applyAction(state, action);
    assert.equal(r.ok, true, `${action.type} by ${action.player} rejected: ${r.code}: ${r.message}`);
    state = r.state;
  }
  return state;
}

const SETUP = [{ type: 'setFirstPlayer', player: 'ann' }, { type: 'chooseSide', player: 'bob', side: 'B' }];
const sidesChosen = () => play(createGame({ map: mapData, scenario: 'learning', players: ['ann', 'bob'] }), ...SETUP);

// The scripted Learning game from test/ui-combat.test.js: ann's W1 waits at Uruk, bob's W1 stops on it.
const TO_COMBAT = [
  { type: 'build', player: 'ann', ships: [{ id: 'A-W1', design: { WG: true, PD: 12, B: 12, S: 11 }, at: 'ur' }] },
  { type: 'move', player: 'ann', ship: 'A-W1', path: [jump('isin'), jump('uruk')] },
  { type: 'endMovement', player: 'ann' },
  { type: 'endTurn', player: 'ann' },
  {
    type: 'build', player: 'bob', ships: [
      { id: 'B-W1', design: { WG: true, PD: 10, B: 10, S: 5 }, at: 'nippur' },
      { id: 'B-W2', design: { WG: true, PD: 3, B: 2 }, at: 'nippur' },
    ],
  },
  { type: 'move', player: 'bob', ship: 'B-W1', path: [jump('umma'), jump('girsu'), move(1, 0), move(0, 0), move(-1, 0), move(-2, 0)] },
  { type: 'endMovement', player: 'bob' },
  { type: 'chooseCombat', player: 'bob', star: 'uruk' },
];
const ORDERS = {
  bob: { type: 'orders', player: 'bob', orders: { 'B-W1': { tactic: 'attack', D: 0, B: 10, S: 0, T: 0, beamTarget: 'A-W1' } } },
  ann: { type: 'orders', player: 'ann', orders: { 'A-W1': { tactic: 'attack', D: 0, B: 10, S: 2, T: 0, beamTarget: 'B-W1' } } },
};
// Round 1: B-W1 takes 12 hits, A-W1 10.
const HITS = [
  { type: 'allocateHits', player: 'bob', allocations: { 'B-W1': { PD: 4, B: 3, S: 5 } } },
  { type: 'allocateHits', player: 'ann', allocations: { 'A-W1': { S: 9, PD: 1 } } },
];
// bob's W1 retreats at Drive 10 and escapes; he places it.
const ESCAPE = [
  { type: 'orders', player: 'bob', orders: { 'B-W1': { tactic: 'retreat', D: 10, B: 0, S: 0, T: 0 } } },
  { type: 'orders', player: 'ann', orders: { 'A-W1': { tactic: 'attack', D: 0, B: 1, S: 0, T: 0, beamTarget: 'B-W1' } } },
  { type: 'placeRetreats', player: 'bob', destinations: { 'B-W1': { q: -1, r: 0 } } },
];

// Advanced with ECM, from test/ui-ecm.test.js: ann's A-W1 (E 2) and bob's B-W1 (a Missile) at Isin.
function ecmOrders() {
  let s = play(
    createGame({ map: mapData, scenario: 'advanced', players: ['ann', 'bob'], modules: ['ecm'] }),
    ...SETUP,
    { type: 'build', player: 'ann', ships: [{ id: 'A-W1', design: { WG: true, PD: 6, E: 2 }, at: 'ur' }] },
    { type: 'endMovement', player: 'ann' }, { type: 'endTurn', player: 'ann' },
    { type: 'build', player: 'bob', ships: [{ id: 'B-W1', design: { WG: true, PD: 3, T: 1, M: 3 }, at: 'nippur' }] },
  );
  s = structuredClone(s);
  Object.assign(s.ships['A-W1'], { q: -7, r: 0 });
  Object.assign(s.ships['B-W1'], { q: -7, r: 0 });
  return play(s, { type: 'endMovement', player: 'bob' }, { type: 'chooseCombat', player: 'bob', star: 'isin' });
}
const ECM = [
  { type: 'orders', player: 'bob', orders: { 'B-W1': { tactic: 'attack', D: 0, B: 0, S: 0, T: 1, missiles: [{ target: 'A-W1', drive: 3 }] } } },
  { type: 'orders', player: 'ann', orders: { 'A-W1': { tactic: 'attack', D: 3, B: 0, S: 0, T: 0, E: 2 } } },
  { type: 'allocateEcm', player: 'ann', ecm: { 'A-W1': { 'B-W1:0': { points: 2, shift: -1 } } } },
];

const local = () => ({ A: createLocalController(), B: createLocalController() });

// Plays actions through the loop as the players at the screen would: each by whichever local controller is
// asked. check(state, request) runs at each request, before the action is submitted.
async function drive(loop, controllers, actions, check = () => {}) {
  for (const action of actions) {
    const asked = Object.values(controllers).filter((c) => c.request);
    assert.equal(asked.length, 1, 'one controller is asked at a time');
    const [c] = asked;
    assert.equal(c.request.side, actingSide(loop.state));
    check(loop.state, c.request);
    const r = await c.submit(action);
    assert.deepEqual(r, { ok: true }, `${action.type} by ${action.player}: ${r.message}`);
  }
}

describe('viewFor: what one side sees (D-039)', () => {
  const s = play(sidesChosen(), ...TO_COMBAT, ORDERS.bob);

  test('its own ship records in full; of enemy ships only the counters', () => {
    const v = viewFor(s, 'A');
    assert.deepEqual(v.ships['A-W1'], s.ships['A-W1']);
    assert.deepEqual(v.ships['B-W2'], { owner: 'B', WG: true, q: s.ships['B-W2'].q, r: s.ships['B-W2'].r });
    assert.deepEqual(Object.keys(v.ships).sort(), Object.keys(s.ships).sort(), 'every counter is on the map');
  });

  test('in combat, enemy ships show their tech level too (D-055); no records', () => {
    const v = viewFor(s, 'A');
    assert.deepEqual(v.combat.hex.ships['B-W1'], { owner: 'B', WG: true, level: s.combat.hex.ships['B-W1'].level });
    assert.deepEqual(v.combat.hex.ships['A-W1'], s.combat.hex.ships['A-W1']);
  });

  test('enemy orders written in secret are known to be in, not what they say', () => {
    assert.deepEqual(viewFor(s, 'A').combat.orders, { A: null, B: {} });
    assert.deepEqual(viewFor(s, 'B').combat.orders, s.combat.orders, 'bob sees his own');
    assert.equal(actingSide(viewFor(s, 'A')), 'A', 'whose turn it is reads the same from the view');
  });

  test('once both are in, the orders are shown (§7 step 2); where hits are taken is not', () => {
    const h = play(s, ORDERS.ann, HITS[0]);
    assert.equal(h.combat.stage, 'hits');
    assert.deepEqual(viewFor(h, 'A').combat.orders, h.combat.orders);
    assert.deepEqual(viewFor(h, 'A').combat.allocations, { A: null, B: {} });
  });

  test('enemy Build Points are hidden', () => {
    assert.deepEqual(viewFor(s, 'A').bp, { A: s.bp.A, B: null });
  });

  test('the Systemships an enemy Warpship carries are hidden', () => {
    const c = structuredClone(s);
    c.ships['B-W2'].carrying = { 'B-S01': { WG: false, PD: 2, B: 1 } };
    assert.equal('carrying' in viewFor(c, 'A').ships['B-W2'], false);
    assert.deepEqual(viewFor(c, 'B').ships['B-W2'].carrying, c.ships['B-W2'].carrying);
  });

  test('the public view (no side) shows both sides as counters', () => {
    const v = viewFor(s, null);
    assert.deepEqual(v.ships['A-W1'], { owner: 'A', WG: true, q: s.ships['A-W1'].q, r: s.ships['A-W1'].r });
    assert.deepEqual(v.bp, { A: null, B: null });
    assert.deepEqual(v.combat.orders, { A: null, B: {} });
  });

  test('everything once the game is over', () => {
    const over = { ...structuredClone(s), step: 'over', result: { draw: true } };
    assert.deepEqual(viewFor(over, 'A'), over);
  });

  test('a copy: the state is not changed', () => {
    const before = structuredClone(s);
    viewFor(s, 'A').ships['A-W1'].PD = 0;
    assert.deepEqual(s, before);
  });
});

describe('actingSide: whose decision the loop waits for', () => {
  test('agrees with the UI on every step of a game', () => {
    let s = sidesChosen();
    for (const action of [...TO_COMBAT, ORDERS.bob, ORDERS.ann, ...HITS]) {
      assert.equal(actor(s), s.players.find((p) => s.sides[p] === actingSide(s)));
      s = play(s, action);
    }
  });

  test('nobody during setup or once the game is over', () => {
    assert.equal(actingSide(createGame({ map: mapData, scenario: 'learning', players: ['ann', 'bob'] })), null);
    assert.equal(actingSide({ ...sidesChosen(), step: 'over' }), null);
  });
});

describe('controllers', () => {
  test('local, computer or remote', () => {
    assert.deepEqual(CONTROLLER_KINDS, ['local', 'computer', 'remote']);
    for (const kind of CONTROLLER_KINDS) assert.equal(createController(kind).kind, kind);
    assert.throws(() => createController('robot'), RangeError);
  });

  test('computer and remote are not implemented yet', () => {
    assert.throws(() => createController('computer').nextAction(viewFor(sidesChosen(), 'A'), { side: 'A' }), /not implemented/);
    assert.throws(() => createController('remote').nextAction(viewFor(sidesChosen(), 'A'), { side: 'A' }), /not implemented/);
  });

  test('a loop that asks a computer side stops with that error', async () => {
    const loop = createGameLoop({ state: sidesChosen(), controllers: { A: createController('computer'), B: createLocalController() } });
    await assert.rejects(loop.run(), /not implemented/);
  });

  test('a local controller with nothing asked of it refuses to submit', async () => {
    const r = await createLocalController().submit({ type: 'endTurn', player: 'ann' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'NOT_ASKED');
  });
});

describe('the game loop', () => {
  test("asks the acting side's controller, with that side's view, and applies its action", async () => {
    const controllers = local();
    const loop = createGameLoop({ state: sidesChosen(), controllers });
    loop.run();
    assert.equal(controllers.B.request, null);
    const { view, side, rejection } = controllers.A.request;
    assert.equal(side, 'A');
    assert.equal(rejection, null);
    assert.deepEqual(view, viewFor(loop.state, 'A'));
    await drive(loop, controllers, TO_COMBAT.slice(0, 4));
    assert.equal(loop.state.active, 'B');
    assert.equal(controllers.A.request, null);
    assert.equal(controllers.B.request.side, 'B');
  });

  test('a controller never sees the state: enemy records and secret orders are not in its view', async () => {
    const controllers = local();
    const loop = createGameLoop({ state: play(sidesChosen(), ...TO_COMBAT), controllers });
    loop.run();
    await drive(loop, controllers, [ORDERS.bob]);
    const { view } = controllers.A.request;
    assert.notDeepEqual(view, loop.state);
    assert.deepEqual(view.combat.orders.B, {});
    assert.equal(view.ships['B-W1'].PD, undefined);
  });

  test('a refused action: the same controller is asked again, told why; the state is unchanged', async () => {
    const controllers = local();
    const start = sidesChosen();
    const loop = createGameLoop({ state: start, controllers });
    loop.run();
    const r = await controllers.A.submit({ type: 'build', player: 'ann', ships: [{ id: 'A-W1', design: { WG: true, PD: 99 }, at: 'ur' }] });
    assert.equal(r.ok, false);
    assert.equal(typeof r.message, 'string');
    assert.equal('state' in r, false, 'the outcome carries no state');
    assert.equal(loop.state, start);
    assert.deepEqual(controllers.A.request.rejection, { code: r.code, message: r.message });
    await drive(loop, controllers, TO_COMBAT.slice(0, 1));
    assert.equal(controllers.A.request.rejection, null, 'cleared once an action is accepted');
  });

  test('a side may act only for its own player', async () => {
    const controllers = local();
    const loop = createGameLoop({ state: sidesChosen(), controllers });
    loop.run();
    const r = await controllers.A.submit({ type: 'endMovement', player: 'bob' });
    assert.equal(r.code, 'NOT_YOUR_SIDE');
    assert.equal(controllers.A.request.side, 'A');
  });

  test('reports each accepted action to the shared screen, with the states before and after', async () => {
    const seen = [];
    const controllers = local();
    const start = sidesChosen();
    const loop = createGameLoop({ state: start, controllers, onAction: (before, action, after) => seen.push({ before, action, after }) });
    loop.run();
    await drive(loop, controllers, TO_COMBAT.slice(0, 2));
    assert.deepEqual(seen.map((e) => e.action), TO_COMBAT.slice(0, 2));
    assert.equal(seen[0].before, start);
    assert.equal(seen[1].before, seen[0].after);
    assert.equal(seen[1].after, loop.state);
  });

  test('runs until the game is over, then resolves with the final state', async () => {
    // ann's W1 sits on bob's base Nippur when her turn begins: 1 victory point wins the Learning game.
    const s = structuredClone(play(sidesChosen(), ...TO_COMBAT.slice(0, 5)));
    const nippur = s.map.stars.find((st) => st.id === 'nippur');
    Object.assign(s.ships['A-W1'], { q: nippur.q, r: nippur.r });
    for (const id of ['B-W1', 'B-W2']) Object.assign(s.ships[id], { q: 1, r: 0 });
    const controllers = local();
    const loop = createGameLoop({ state: s, controllers });
    const done = loop.run();
    await drive(loop, controllers, [{ type: 'endMovement', player: 'bob' }, { type: 'endTurn', player: 'bob' }]);
    const final = await done;
    assert.equal(final.step, 'over');
    assert.equal(final.result.player, 'ann');
    assert.equal(controllers.A.request, null);
    assert.equal(controllers.B.request, null);
  });

  test('stop: the waiting action is not applied', async () => {
    const controllers = local();
    const start = sidesChosen();
    const loop = createGameLoop({ state: start, controllers });
    const done = loop.run();
    loop.stop();
    controllers.A.submit(TO_COMBAT[0]);
    assert.equal(await done, start);
  });
});

describe('hot-seat: two local controllers play as before', () => {
  // Every screen the waiting player sees, drawn from their view, is the screen drawn from the full state.
  function sameScreens(s, { view, side }) {
    const player = s.players.find((p) => s.sides[p] === side);
    const same = (render) => assert.equal(render(view), render(s));
    same((g) => renderMap(g));
    for (const [, sh] of Object.entries(s.ships)) same((g) => renderHexPanel(g, sh, { viewer: player }));
    const draft = { design: { ...EMPTY_DESIGN }, drafts: [], error: null, repairs: {}, resupply: {}, plan: null };
    if (s.step === 'build') {
      same((g) => renderBuilder(g, player, draft));
      same((g) => renderBuildCheck(g, player, draft));
    }
    if (s.step === 'movement') {
      same((g) => renderMovement(g, player, draft));
      for (const [id, sh] of Object.entries(s.ships)) {
        if (sh.owner === side) assert.deepEqual(planInfo(view, id, []), planInfo(s, id, []));
      }
    }
    if (s.step === 'rearrange') same((g) => renderRearrange(g, player, {}, null));
    const c = s.combat;
    if (s.step === 'combat' && !c) same(renderChoose);
    if (c?.stage === 'orders') {
      assert.deepEqual(blankOrders(view, side), blankOrders(s, side));
      same((g) => renderOrders(g, player, blankOrders(s, side)));
      same((g) => renderOrderCheck(g, side, blankOrders(s, side)));
    }
    if (c?.stage === 'ecm') {
      same((g) => renderEcm(g, player, {}));
      same((g) => renderEcmCheck(g, side, {}));
    }
    if (c?.stage === 'hits') {
      same((g) => renderHits(g, player, {}));
      same((g) => renderHitCheck(g, side, {}));
    }
    if (c?.stage === 'retreats' || c?.stage === 'withdraw') {
      assert.deepEqual(placementShips(view, side), placementShips(s, side));
      assert.deepEqual(placementTargets(view, side), placementTargets(s, side));
      same((g) => renderPlacement(g, player, {}, placementShips(s, side)[0] ?? null, {}));
    }
  }

  test('a Learning game: build, move, combat, hits', async () => {
    const controllers = local();
    const loop = createGameLoop({ state: sidesChosen(), controllers });
    loop.run();
    await drive(loop, controllers, [...TO_COMBAT, ORDERS.bob, ORDERS.ann, ...HITS], sameScreens);
    assert.equal(loop.state.combat.round, 2);
    sameScreens(loop.state, Object.values(controllers).find((c) => c.request).request);
  });

  test('an escape and its placement', async () => {
    const controllers = local();
    const loop = createGameLoop({ state: play(sidesChosen(), ...TO_COMBAT), controllers });
    loop.run();
    await drive(loop, controllers, ESCAPE, sameScreens);
  });

  test('the ECM step (fan §7.1.1)', async () => {
    const controllers = local();
    const loop = createGameLoop({ state: ecmOrders(), controllers });
    loop.run();
    await drive(loop, controllers, ECM.slice(0, 2), sameScreens);
    assert.equal(loop.state.combat.stage, 'ecm');
    sameScreens(loop.state, controllers.A.request);
    await drive(loop, controllers, ECM.slice(2), sameScreens);
  });

  test('the game the loop plays is the game applyAction plays', async () => {
    const actions = [...TO_COMBAT, ORDERS.bob, ORDERS.ann, ...HITS];
    const controllers = local();
    const loop = createGameLoop({ state: sidesChosen(), controllers });
    loop.run();
    await drive(loop, controllers, actions);
    assert.deepEqual(loop.state, play(sidesChosen(), ...actions));
  });
});

describe('the handoff screen (D-039)', () => {
  const HOT_SEAT = { A: 'local', B: 'local' };

  test('between two local players: whenever the player who must act is not the one at the screen', () => {
    const s = play(sidesChosen(), ...TO_COMBAT);
    assert.equal(needsHandoff(s, HOT_SEAT, null), true);
    assert.equal(needsHandoff(s, HOT_SEAT, 'ann'), true);
    assert.equal(needsHandoff(s, HOT_SEAT, 'bob'), false);
    const secret = play(s, ORDERS.bob);
    assert.equal(needsHandoff(secret, HOT_SEAT, 'bob'), true, 'bob passes the screen once his orders are in');
    assert.equal(needsHandoff(secret, HOT_SEAT, 'ann'), false);
  });

  test('not during setup, which both players see, nor once the game is over', () => {
    assert.equal(needsHandoff(createGame({ map: mapData, scenario: 'learning', players: ['ann', 'bob'] }), null, null), false);
    assert.equal(needsHandoff({ ...sidesChosen(), step: 'over' }, HOT_SEAT, null), false);
  });

  test('never when the other side is not a local player', () => {
    const s = play(sidesChosen(), ...TO_COMBAT, ORDERS.bob);
    for (const other of ['computer', 'remote']) {
      assert.equal(needsHandoff(s, { A: 'local', B: other }, 'bob'), false);
      assert.equal(needsHandoff(s, { A: other, B: 'local' }, null), false);
    }
  });
});
