@'
# WarpWar Engine

Digital implementation of WarpWar. Classic 1977 rules first. UI later.

## Source of truth
- docs/rules/classic.md is the spec. If code and spec disagree, the spec wins.
- docs/decisions.md logs rule ambiguities. Never invent a ruling. Stop and ask.

## Stack
- Vanilla JavaScript, ES modules, Node 20+
- Tests: node:test via `npm test`
- No dependencies without asking

## Architecture
- src/engine/ is pure logic. No DOM, no I/O.
- State is plain data. Functions take state, return new state.
- src/ui/ comes later and only calls the engine.

## Workflow
- Work only on the current phase in docs/roadmap.md
- Write tests from rulebook examples before implementing
- Run `npm test` before reporting done
- Never run git commit. Leave changes uncommitted for review.
- Do only what the prompt asks. If more work seems useful, propose it and stop.
'@ | Set-Content CLAUDE.md