# Roadmap

Current phase: 6a

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
7. UI
8. Fan Extended rules as optional modules