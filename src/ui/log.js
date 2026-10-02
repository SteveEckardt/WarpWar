// The game log: what happened, in words both players may read. Pure: no DOM.
// D-039: only what the counters show (who built which counters where, where each counter moved) and each combat
// round's public result (§7 step 2). Never designs, Build Points, orders still secret, or where hits were taken.
// Each entry is worked out from the state before an action, the action, and the state after it.

import { SCENARIOS } from '../engine/game.js';
import { starAt, starById } from '../engine/map.js';
import { esc } from './hexmap.js';
import { displayId, playerOf } from './view.js';

const other = (side) => (side === 'A' ? 'B' : 'A');

const place = (state, hex) => {
  const star = starAt(state.map, hex);
  return star ? star.name : `space ${hex.q}, ${hex.r}`;
};
const starName = (state, id) => starById(state.map, id)?.name ?? id;
const ship = (state, side, id) => `${playerOf(state, side)}'s ${displayId(id)}`;
const list = (items) => items.join(', ');

// The owner of a ship in the last round: it fought, or it was carried by a ship that did (D-020).
function ownerIn(before, last, id) {
  if (last.ships[id]) return last.ships[id].owner;
  return Object.values(before.combat?.hex.ships ?? {}).find((sh) => id in (sh.carrying ?? {}))?.owner;
}

// One round's public result: effective hits on each ship, then losses and escapes.
function roundText(before, after) {
  const last = after.lastRound;
  const parts = [];
  const hits = Object.keys(last.ships)
    .sort((a, b) => last.ships[a].owner.localeCompare(last.ships[b].owner) || a.localeCompare(b))
    .filter((id) => last.damage[id]?.effective > 0)
    .map((id, i) => `${ship(after, last.ships[id].owner, id)} took ${last.damage[id].effective}${i === 0 ? ' effective hits' : ''}`);
  parts.push(`Round ${last.round} at ${starName(after, last.star)}: ${hits.length > 0 ? list(hits) : 'no effective hits'}.`);
  if (last.destroyed.length > 0) parts.push(`Destroyed: ${list(last.destroyed.map((id) => ship(after, ownerIn(before, last, id), id)))}.`);
  if (last.escaped.length > 0) parts.push(`Escaped: ${list(last.escaped.map((id) => ship(after, ownerIn(before, last, id), id)))}.`);
  return parts.join(' ');
}

// Which of the loser's bases the winner's ships stand on (D-010).
function occupied(state, winner) {
  return state.bases[other(winner)].filter((id) => {
    const star = starById(state.map, id);
    return Object.values(state.ships).some((sh) => sh.owner === winner && sh.q === star.q && sh.r === star.r);
  });
}

// "Nippur, a base of bob" / "Nippur, Adab, bases of bob": the enemy bases the side's ships stand on.
function holding(state, side) {
  const bases = occupied(state, side).map((id) => starName(state, id));
  return `${list(bases)}, ${bases.length === 1 ? 'a base' : 'bases'} of ${playerOf(state, other(side))}`;
}
const points = (n) => `${n} victory point${n === 1 ? '' : 's'}`;

export function resultText(state) {
  const r = state.result;
  if (r.draw) return 'The game is a draw: neither player has an effective ship.';
  if (SCENARIOS[state.scenario].victoryPoints === 1) return `${r.player} wins: ${r.player} occupies ${holding(state, r.winner)} (${points(r.victoryPoints)}).`;
  return `${r.player} wins with ${points(r.victoryPoints)}, scored over the turns (D-041): ${r.player} occupies ${holding(state, r.winner)}.`;
}

// The entries for one accepted action: [{ turn, text }].
export function logEntries(before, action, after) {
  const texts = [];
  const side = after.sides?.[action.player];
  switch (action.type) {
    case 'setFirstPlayer':
      texts.push(`${action.player} moves first.`);
      break;
    case 'chooseSide': {
      const bases = (sd) => list(after.bases[sd].map((id) => starName(after, id)));
      const first = playerOf(after, other(action.side));
      texts.push(`${action.player}, moving second, chooses side ${action.side} (base ${bases(action.side)}). ${first} has side ${other(action.side)} (base ${bases(other(action.side))}).`);
      break;
    }
    case 'build': {
      const at = {};
      for (const s of action.ships) (at[s.at] ??= []).push(displayId(s.id));
      for (const [star, ids] of Object.entries(at)) texts.push(`${action.player} built ${list(ids)} at ${starName(after, star)}.`);
      break;
    }
    case 'move': {
      const from = before.ships[action.ship];
      const to = after.ships[action.ship];
      texts.push(`${ship(after, side, action.ship)} moved from ${place(before, from)} to ${place(after, to)}.`);
      break;
    }
    case 'endMovement':
      if (after.contested.length > 0) texts.push(`Combat follows at ${list(after.contested.map((id) => starName(after, id)))}.`);
      break;
    case 'chooseCombat':
      texts.push(`Combat at ${starName(after, action.star)} begins.`);
      break;
    case 'orders':
    case 'allocateHits':
      // Secret until the round resolves; then its public result.
      if (after.lastRound && after.lastRound !== before.lastRound && JSON.stringify(after.lastRound) !== JSON.stringify(before.lastRound)) {
        texts.push(roundText(before, after));
      }
      break;
    case 'placeRetreats':
      for (const [id, to] of Object.entries(action.destinations ?? {})) texts.push(`${ship(after, side, id)} retreated to ${place(after, to)}.`);
      break;
    case 'withdraw': {
      for (const [id, to] of Object.entries(action.destinations ?? {})) texts.push(`${ship(after, side, id)} withdrew to ${place(after, to)}.`);
      const lost = after.lastRound?.withdrawalLosses ?? [];
      if (lost.length > 0) texts.push(`Left behind and destroyed: ${list(lost.map((id) => ship(after, side, id)))}.`);
      break;
    }
    case 'rearrange':
      texts.push(`${action.player} rearranged Systemships at ${starName(after, action.star)}.`);
      break;
    case 'endTurn':
      texts.push(`${action.player} ends the turn.`);
      if (after.turn > before.turn) texts.push(`Game-turn ${after.turn} begins.`);
      break;
    default:
      break;
  }
  // A combat that finished with this action.
  if (before.combat && (!after.combat || after.combat.star !== before.combat.star)) {
    const end = `Combat at ${starName(after, before.combat.star)} is over.`;
    if (texts.length > 0) texts[texts.length - 1] += ` ${end}`;
    else texts.push(end);
  }
  // D-041: points scored at the start of the turn that just began (the result says so if they win).
  const now = after.active;
  if (now && after.vp && after.step !== 'over' && after.vp[now] > (before.vp?.[now] ?? 0)) {
    const gain = after.vp[now] - (before.vp?.[now] ?? 0);
    const goal = SCENARIOS[after.scenario].victoryPoints;
    texts.push(`${playerOf(after, now)} occupies ${holding(after, now)}: ${points(gain)}, ${after.vp[now]} of ${goal} so far.`);
  }
  if (after.step === 'over' && before.step !== 'over') texts.push(resultText(after));
  return texts.map((text) => ({ turn: after.turn, text }));
}

export function renderLog(log) {
  if (log.length === 0) return `<p class="hint">Nothing has happened yet.</p>`;
  const out = [`<ol class="log">`];
  let turn = null;
  for (const e of log) {
    const mark = e.turn !== turn ? ` data-turn="${e.turn}"` : '';
    turn = e.turn;
    out.push(`<li${mark}>${esc(e.text)}</li>`);
  }
  out.push(`</ol>`);
  return out.join('\n');
}
