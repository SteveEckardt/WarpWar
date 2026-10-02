# Roadmap

Current phase: 8c

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
8d+. One slice per further module the owner picks, in the order chosen