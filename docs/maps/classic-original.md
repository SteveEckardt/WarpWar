# Classic WarpWar: Original Map (proposal)

**Status:** APPROVED (2026-09-30). Phase 6a (see `docs/roadmap.md`). The JSON below is saved as
`data/maps/classic-original.json`; Phase 6b uses it.

This is an original design (D-019). Nothing here is read from the rulebook's Illustration 1. It uses the map
format from Phase 5a (`src/engine/map.js`): axial `{ q, r }` positions, `baseOwner` of `"A"`, `"B"` or `null`,
warplines as pairs of star ids.

## Summary

| | |
|---|---|
| Stars | 18: 6 base stars (3 per player), 12 neutral |
| Warplines | 22 |
| Players | A on the west edge, B on the east edge |
| Symmetry | 180° rotation about hex (0, 0): `(q, r) -> (-q, -r)` swaps A and B (a "pinwheel") |
| Learning scenario | Ur (A) and Nippur (B), the middle base of each side |
| Advanced scenario | all three bases of each side |

## Requirements check

| Requirement | Result |
|---|---|
| 3 base stars per player, opposite ends | A: Ur, Eridu, Larsa at x = -11. B: Nippur, Adab, Akkad at x = +11. |
| 10 to 14 neutral stars | 12 |
| Stars never adjacent | Closest pair is 3 hexes apart (checked over all pairs). |
| No star with more than 4 warplines | Maximum is 4 (Uruk and Girsu). Distribution below. |
| Real route choices | Five different 8 MP routes from Ur to Nippur, using different neutral stars. See [Routes](#routes). |
| Fair | Rotational symmetry: every star, warpline and distance for A has an exact twin for B. See [Fairness](#fairness). |
| Format | Loads with `loadMap` unchanged (18 stars, 22 warplines). |

How the checks were made: a throwaway script (not part of the project, nothing to commit) read the JSON and
checked star adjacency, warpline degree, the symmetry, and shortest MP between stars (a hex step costs 1 MP, a
warpline costs 1 MP whatever its length, §6.2, D-006). `loadMap` then accepted the file as written.

## Coordinates

Axial `(q, r)`. For the sketch, a star is drawn at column `x = q + r/2` and row `r`. The stars span x = -11 to
+11 and r = -6 to +6. Base stars are 22 hexes apart end to end.

The map edge (D-040) is 2 hexes beyond the outermost stars: x = -13 to +13 and r = -8 to +8, edges included. It
is stored as `bounds` in the JSON. No ship may move, retreat or withdraw off the map.

## ASCII sketch

`[XX]` is a base star (capitals), `(xx)` is a neutral star, dots are warplines. A is on the left, B on the
right. The sketch is approximate: a dotted line is a straight line between two stars, and the hexes it crosses
are ordinary space hexes (D-006). Warplines do not cross each other anywhere on this map.

```
                           (nu)
                         ...
                      ....
     [ER]..........(ku)            (ma)..........[AK]
       .             ..           ....             .
       .              .        .... .              .
       .              ..     ...   ..              .
       .               ..  (lg)   ..               .
       .                .     ..  .                .
       .                ..     ....                .
     [UR]....(is)......(uk)    (gi)......(um)....[NI]
       .                ....     ..                .
       .                .  ..     .                .
       .               ..  (sp)   ..               .
       .              ..   ...     ..              .
       .              . ....        .              .
       .             ....           ..             .
     [LA]..........(bo)            (sh)..........[AD]
                                 ....
                               ...
                           (di).
```

If the dots are hard to read, use the warpline table below; it is the authority.

## Stars

| Tag | Id | Name | q | r | Owner | Warplines |
|---|---|---|---|---|---|---|
| UR | ur | Ur | -11 | 0 | A (middle base) | 3 |
| ER | eridu | Eridu | -9 | -4 | A (north base) | 2 |
| LA | larsa | Larsa | -13 | 4 | A (south base) | 2 |
| NI | nippur | Nippur | 11 | 0 | B (middle base) | 3 |
| AD | adab | Adab | 9 | 4 | B (south base) | 2 |
| AK | akkad | Akkad | 13 | -4 | B (north base) | 2 |
| is | isin | Isin | -7 | 0 | neutral | 2 |
| um | umma | Umma | 7 | 0 | neutral | 2 |
| uk | uruk | Uruk | -2 | 0 | neutral | 4 |
| gi | girsu | Girsu | 2 | 0 | neutral | 4 |
| lg | lagash | Lagash | 1 | -2 | neutral | 2 |
| sp | sippar | Sippar | -1 | 2 | neutral | 2 |
| ku | kutha | Kutha | -2 | -4 | neutral | 3 |
| bo | borsippa | Borsippa | -6 | 4 | neutral | 3 |
| sh | shuruppak | Shuruppak | 2 | 4 | neutral | 3 |
| ma | mari | Mari | 6 | -4 | neutral | 3 |
| nu | nuzi | Nuzi | 3 | -6 | neutral | 1 |
| di | dilmun | Dilmun | -3 | 6 | neutral | 1 |

Warpline count by star: four lines: 2 stars; three lines: 6; two lines: 8; one line: 2. No star has none.

## Warplines

Length is the number of hexes between the two stars (what walking would cost). A warpline always costs 1 MP.
The right-hand column is the same line seen from B's side (its 180° twin).

| A-side line | Length | B-side twin |
|---|---|---|
| Ur - Isin | 4 | Nippur - Umma |
| Ur - Eridu | 4 | Nippur - Akkad |
| Ur - Larsa | 4 | Nippur - Adab |
| Isin - Uruk | 5 | Umma - Girsu |
| Eridu - Kutha | 7 | Akkad - Mari |
| Larsa - Borsippa | 7 | Adab - Shuruppak |
| Kutha - Nuzi | 5 | Shuruppak - Dilmun |
| Borsippa - Sippar | 5 | Mari - Lagash |
| Uruk - Kutha | 4 | Girsu - Shuruppak |
| Uruk - Borsippa | 4 | Girsu - Mari |
| Uruk - Sippar | 3 | Girsu - Lagash |

The layout is a pinwheel, not a mirror: Nuzi is a spur off A's Kutha, and its twin Dilmun is a spur off B's
Shuruppak. That is deliberate. A north-south mirror would also have made the two rim stars link up into a fast
rim highway between the flank bases (Eridu to Akkad in 4 MP).

## Routes

Fewest MP between two stars: walking costs 1 per hex, any warpline costs 1.

| From \ To | Nippur | Adab | Akkad |
|---|---|---|---|
| Ur | 8 | 8 | 7 |
| Eridu | 8 | 8 | 7 |
| Larsa | 7 | 7 | 7 |

Walking Ur to Nippur straight is 22 MP. The best warpline route is 8 MP.

Five different Ur to Nippur routes at 8 MP (a gap in the chain is a walk, in hexes):

1. Ur - Isin - Uruk, walk 4 to Girsu, Girsu - Umma - Nippur: the direct centre.
2. Ur - Isin - Uruk, walk 3 to Lagash, Lagash - Girsu, Girsu - Umma - Nippur: centre, via the north hub.
3. Ur - Isin - Uruk - Sippar, walk 3 to Girsu, Girsu - Umma - Nippur: centre, via the south hub.
4. Ur - Larsa - Borsippa - Sippar, walk 3 to Girsu, Girsu - Umma - Nippur: south side.
5. Ur - Isin - Uruk, walk 3 to Lagash, Lagash - Mari - Akkad - Nippur: north side, entering by a flank base.

Eighteen more routes cost 9 (counted as star-to-star paths, where a walk between two stars is one leg). All 23
routes at 8 or 9 MP pass Uruk or Girsu (the two stars with four lines), so those two are the contested ground. Which route is best depends on where the enemy ships are, because a forced stop
at a star with an enemy ship ends the move (§6.1 rule 1).

Distances from A's bases to the neutral stars (B's are the same by symmetry):

| From \ To | Isin | Uruk | Kutha | Borsippa | Sippar | Nuzi | Lagash | Girsu | Mari | Umma | Shuruppak | Dilmun |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ur | 1 | 2 | 2 | 2 | 3 | 3 | 5 | 6 | 6 | 7 | 7 | 7 |
| Eridu | 2 | 2 | 1 | 3 | 3 | 2 | 5 | 6 | 6 | 7 | 7 | 7 |
| Larsa | 2 | 2 | 3 | 1 | 2 | 4 | 5 | 5 | 6 | 6 | 6 | 6 |

## Fairness

- The map maps onto itself under `(q, r) -> (-q, -r)` with A and B swapped. Every star has a twin of the
  opposite side (Isin/Umma, Uruk/Girsu, Lagash/Sippar, Kutha/Shuruppak, Borsippa/Mari, Nuzi/Dilmun, and the six
  bases), and every warpline has a twin.
- So a distance from an A base to any star equals the distance from the twin B base to the twin star. For example
  Ur to Adab is 8 and Eridu to Nippur is 8; Ur to Akkad is 7 and Larsa to Nippur is 7.
- A's closer neutral stars are Isin, Uruk, Kutha, Borsippa; B's are the twins Umma, Girsu, Shuruppak, Mari. The
  only difference between sides is which flank each side's spur sits on (Nuzi north for A, Dilmun south for B).

## What this map does not decide

- It does not set starting positions for ships (Phase 6b, Learning scenario setup).
- Whether the speed is right is a judgement call. A ship with PD 6 needs two turns to reach the enemy middle
  base; a ship with PD 8 or more can in one, but not on game-turn 1 (D-008). If you want slower or faster, the
  lever is the number of warplines on the centre lane (Isin - Uruk, and the Uruk and Girsu hub lines).

## JSON (Phase 5a format, with D-040 bounds)

```json
{
  "stars": [
    { "id": "ur", "name": "Ur", "q": -11, "r": 0, "baseOwner": "A" },
    { "id": "eridu", "name": "Eridu", "q": -9, "r": -4, "baseOwner": "A" },
    { "id": "larsa", "name": "Larsa", "q": -13, "r": 4, "baseOwner": "A" },
    { "id": "nippur", "name": "Nippur", "q": 11, "r": 0, "baseOwner": "B" },
    { "id": "adab", "name": "Adab", "q": 9, "r": 4, "baseOwner": "B" },
    { "id": "akkad", "name": "Akkad", "q": 13, "r": -4, "baseOwner": "B" },
    { "id": "isin", "name": "Isin", "q": -7, "r": 0, "baseOwner": null },
    { "id": "umma", "name": "Umma", "q": 7, "r": 0, "baseOwner": null },
    { "id": "uruk", "name": "Uruk", "q": -2, "r": 0, "baseOwner": null },
    { "id": "girsu", "name": "Girsu", "q": 2, "r": 0, "baseOwner": null },
    { "id": "lagash", "name": "Lagash", "q": 1, "r": -2, "baseOwner": null },
    { "id": "sippar", "name": "Sippar", "q": -1, "r": 2, "baseOwner": null },
    { "id": "kutha", "name": "Kutha", "q": -2, "r": -4, "baseOwner": null },
    { "id": "borsippa", "name": "Borsippa", "q": -6, "r": 4, "baseOwner": null },
    { "id": "shuruppak", "name": "Shuruppak", "q": 2, "r": 4, "baseOwner": null },
    { "id": "mari", "name": "Mari", "q": 6, "r": -4, "baseOwner": null },
    { "id": "nuzi", "name": "Nuzi", "q": 3, "r": -6, "baseOwner": null },
    { "id": "dilmun", "name": "Dilmun", "q": -3, "r": 6, "baseOwner": null }
  ],
  "warplines": [
    ["ur", "isin"], ["nippur", "umma"],
    ["ur", "eridu"], ["nippur", "akkad"],
    ["ur", "larsa"], ["nippur", "adab"],
    ["isin", "uruk"], ["umma", "girsu"],
    ["eridu", "kutha"], ["akkad", "mari"],
    ["larsa", "borsippa"], ["adab", "shuruppak"],
    ["kutha", "nuzi"], ["shuruppak", "dilmun"],
    ["borsippa", "sippar"], ["mari", "lagash"],
    ["uruk", "kutha"], ["girsu", "shuruppak"],
    ["uruk", "borsippa"], ["girsu", "mari"],
    ["uruk", "sippar"], ["girsu", "lagash"]
  ],
  "bounds": { "x": [-13, 13], "r": [-8, 8] }
}
```
