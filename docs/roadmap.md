# Roadmap

Current phase: 9b-2

0. Rules extraction: PDF to docs/rules/classic.md, ambiguities logged
1. Ship building: attributes, BP costs, validation
2. Combat Results Table lookup
3. Damage resolution: screens, tech level, missile hits
   - Deferred (D-021): occupied Systemship Racks cannot take hits, and the owner may assign hits to a carried
     Systemship's attributes. Not built here; left for the phase that builds carrying.
4. Combat rounds: orders, PD limits, end conditions
   - Deferred: Systemship pickup and drop (§7.3, D-027, D-028). Needs the carrying model.
   - Deferred: retreat and forced-withdrawal destination hexes (D-022, D-023). Needs the map.
5a. Map and movement: hexes, warplines, MP costs (map is input data; test map only)
5b. Systemship carrying: §7.3 pickup and drop, D-017, D-020, D-021, D-027, D-028
6a. Playable map design: an original map (D-019), proposed in docs/maps/classic-original.md; no code
6b. Turn sequence and Learning scenario (uses the map from 6a, saved to data/maps/ once approved)
6c. Basic and Advanced scenarios: BP income, repair, resupply, tech advancement
7. UI: vanilla HTML, CSS and ES modules in src/ui/, no build step; game state changes only through applyAction
7a. UI foundation: static server (npm start), SVG hex map, ships by side, star panel with ship records,
    a hard-coded sample Learning game; read-only
7b. Setup and ship builder; D-039 handoff screen; a bare End turn button stands in for movement until 7c
7c. Movement
7d. Combat with hidden-order handoff
7e. Game log and victory screen
7f. UI for Basic and Advanced: scenario choice; builder with Systemships, racks, repair, resupply and saved BP;
    a Build event every Advanced turn; victory point totals (D-041) in the status line, log and end screen
7g. UI for carrying Systemships: pickup and drop in movement (§6.2), in combat (§7.3) and after combat (§8),
    pickups on forced withdrawal, hits on carried Systemships (D-021)
8. Fan Extended rules as optional modules
8a. Fan rules extraction: PDF pp. 14-29 to docs/rules/fan-extended.md; candidate modules compared with the classic
    rules in docs/rules/fan-modules.md; no code. Open questions are logged per module when the owner picks it
8b. Armor (fan §10.2.2, §7.5): the first module; sets how modules are switched on for a game
8c. Cannons and Shells (fan §10.2.3, §10.2.4, §5.3.1, §7.5)
8d. ECM (fan §7.1.1, §7.2, §5.6): a new step in the combat round to spread ECM over incoming Missiles
8e+. One slice per further module the owner picks, in the order chosen
9. Opponents beyond the shared screen: each side has a controller (local, computer or remote) that is handed
   viewFor(state, side), never the state, and answers with actions; the game loop passes them to applyAction
9a. Player controllers: refactor only. Hot-seat is two local controllers and plays as before; the handoff screen
    only comes between two local controllers; computer and remote are stubs
9b. Computer opponent: a "computer" controller, handed only viewFor(state, side); it tries candidate actions with
    applyAction on a copy of its view and keeps no rules of its own; seeded, so a seed always plays the same game
9b-1. Random legal player, Learning only: the second player's choice of side moves into the loop as an action, so
    controllers belong to players; Human or Computer for each player on the setup screen, with a short delay
    before each computer action; computer vs computer plays to a win or draw on at least 50 seeds
9b-2. Random legal player for Basic and Advanced: Systemships, racks and carrying (§6.2, §7.3, §8), saved BP,
    repair and resupply, then the fan modules (Armor, Cannons, ECM)
9b-3. A computer that plays to win: builds, moves toward enemy bases, picks fights and combat orders by simple
    rules of thumb, still only from its view; measured against the random player over many seeds
9b-4. Difficulty levels and polish: a choice of computer strength on the setup screen, a seed shown for replays,
    pacing controls for watching computer vs computer
9c. Remote play over WebSockets
