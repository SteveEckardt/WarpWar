# WarpWar

A digital implementation of **WarpWar**, the 1977 tactical spaceship design and combat game by Howard Thompson, originally published by Metagaming as MicroGame 4.

Players design their own warships from a budget of Build Points, move them across a hex map of stars and warplines, and fight diceless battles decided by secret, simultaneous orders. Combat is a guessing game: outthink your opponent's drive setting and tactic, or take the hit.

<!-- Screenshot: save as docs/screenshot.png, then replace this line with ![WarpWar](docs/screenshot.png) -->

## Features

- **Complete Classic rules** in all three scenarios: Learning, Basic, and Advanced
- **Ship builder** with live Build Point costs and validation
- **Hidden information:** each player sees only their own ship records, with a handoff screen between turns in hot-seat play
- **Simultaneous secret combat orders**, resolved through the original Combat Results Table
- **Systemship carrying:** pickup and drop during movement, in combat, and after combat
- **Original playable map** with 18 stars, 22 warplines, and rotational symmetry for fairness
- **Optional fan rules modules:** Armor, Cannons and Shells, and Electronic Countermeasures
- **In progress:** a computer opponent and remote play over the network

## Quick start

Requires [Node.js](https://nodejs.org/) 20 or later. No other dependencies.

```bash
git clone https://github.com/SteveEckardt/WarpWar.git
cd WarpWar
npm start
```

Open http://127.0.0.1:8000 in your browser. Press Ctrl+C in the terminal to stop the server.

## Tests

```bash
npm test
```

Over 600 tests run on Node's built-in test runner. They cover every Combat Results Table cell, every rulebook worked example, and every recorded ruling.

## Architecture

The game engine is a pure state machine with no DOM, no I/O, and no randomness.

- **`applyAction(state, action)`** returns a new state or a rejection with a reason. Every player decision is an action, so the engine never chooses for a player.
- **`viewFor(state, side)`** returns the state with everything that side may not see removed. The UI renders only views, so hidden information cannot leak through a forgotten screen.
- **Player controllers** connect a side to a source of actions: a local human, a computer player, or a remote player. The engine doesn't know or care which.

```
src/engine/   Rules: ships, combat, damage, map, movement, carrying, turn sequence
src/play/     Player controllers and the game loop
src/ui/       Browser interface: vanilla HTML, CSS, and ES modules, no build step
tools/        Local server and map renderer
data/maps/    Map data in axial hex coordinates
docs/         Rules spec, decisions log, roadmap
test/         Test suite
```

## How it was built

This project was built in phases with [Claude Code](https://www.anthropic.com/claude-code), as a study in managing a large AI-assisted codebase.

1. **The rulebook became a spec.** The rules were summarized in `docs/rules/`, and every ambiguity, gap, or contradiction was logged before any code was written.
2. **Every ruling is recorded.** `docs/decisions.md` holds 40 rulings, each citing the rule it interprets. No engine code depends on an unresolved question.
3. **Tests come from the rulebook.** The rulebook's own worked examples are the test fixtures. Expected values are typed from the rules, never imported from the code under test.
4. **One phase at a time.** Each phase was planned, built in isolation, reviewed, and merged. `docs/roadmap.md` tracks the sequence.
5. **Refactors are proven safe** by running the unchanged test suite against the changed code.

## Roadmap

See [docs/roadmap.md](docs/roadmap.md). Next up:

- Computer opponent, with a self-play harness for balance testing
- Remote play over WebSockets with an authoritative server

## License

The code in this repository is released under the [MIT License](LICENSE.md).

The license covers this project's code only. The WarpWar game design, rules, and name belong to their original creators.

## Credits

WarpWar was designed by Howard Thompson and published by Metagaming in 1977. The 35th Anniversary fan edition was revised by James Horton with editing by Evan Corcoran.

This is an unofficial fan implementation, not affiliated with or endorsed by the original designer or publisher.
