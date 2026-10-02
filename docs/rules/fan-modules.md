# Fan Extended Rules: Candidate Modules (proposal)

**Status:** PROPOSAL (2026-10-01). Phase 8a. Nothing here is built. The project owner chooses which modules to
build, in what order; each becomes its own slice (8b onward) and gets its open questions logged in
`docs/decisions.md` before any code.

Source: `docs/rules/fan-extended.md` (the PDF's pages 14–29). The spec stays `docs/rules/classic.md`: a module
is an option a game is created with, and a game with no modules plays exactly as now.

## How the fan rules relate to the classic rules

The fan section is not a list of add-ons. It restates the whole game with changes, so every difference had to be
found by comparing it with `classic.md`. Three kinds of difference turned up:

1. **New things** (attributes, economy, colonies, victory conditions): candidates for modules.
2. **Changed core rules** (turn structure, tech schedule, movement): would replace classic rules, so they too can
   only be options, never defaults.
3. **Restated rules that already match** the classic rules or this project's rulings: nothing to build.

### Already matching (nothing to build)

| Fan rule | Matches |
|---|---|
| Combat Results Table (§5.3, Table 2) | `classic.md` §7.2 Table 1, every cell |
| Damage to a rack holding a Systemship: take it on the Systemship; "SR cannot be destroyed till the Systemship is destroyed or dropped" (§5.5) | D-021, D-034 |
| Forced withdrawal: Systemships with no Warpship to carry them are destroyed (§5.1 step 6) | D-023 |
| Repair and resupply up to built strength, 1 BP per point, 3 Missiles per BP across ships (§7.5) | `classic.md` §5.3 (already built, Phase 6c) |
| Tech level adds to Beam, Missile and Screen (§7.2, §7.2.1 example) | `classic.md` §5.2 |
| No ship onto an enemy base star on the first turn (§4) | D-008 |

## Candidate modules

Sizes are rough: **S** about one slice, **M** one or two, **L** several. "Blocked" means the PDF gives the needed
data only as images (as with the classic map, D-019), so the owner must supply or approve the data first.

### Group 1: new ship attributes (self-contained; fit the current engine)

| Module | What it adds (fan §) | Size | Depends on |
|---|---|---|---|
| **Armor** (built, Phase 8b; D-042 to D-047) | Attribute A: 1 BP builds (2 + TL) points; each point absorbs one point of damage; repaired at 1 BP per 2 points (§10.2.2, §7.5) | S | none |
| **Cannons and Shells** | Attributes C and SH: 1 PD powers a Cannon for 1 to 3 Shells; read on the CRT like a Beam (ship's own Drive); 1 hit per Shell, Hit bonus and TL added per burst; not with Beams or Screens, allowed with Missiles; 6 Shells per BP, resupplied likewise (§10.2.3, §10.2.4, §5.3.1, §7.5) | M | none |
| **ECM** | Attribute E: powered from PD; after orders are revealed the defender spreads ECM points over incoming Missiles, each point changing that Missile's Drive setting, adjusted by the tech-level difference (§7.1.1, §7.2) | M | a new step in the combat round |
| **Advanced Warp Generators** | Small (3 BP, ships up to 9 BP, no racks, 1 PD per MP), Medium (5 BP, up to 45 BP, 2 PD per MP), Large (15 BP, 45+ BP, 3 PD per MP) (§10.2.1) | S | none |

Open questions found so far:

- **Armor.** *Resolved as D-042 to D-047.* Is Armor taken where the owner chooses, like any attribute (§5.5.1 lists it with the others), or
  must it absorb damage first? Does a ship with only Armor left survive? A hit on another attribute removes one
  BP's worth; a hit on Armor removes one point, which at TL 0 is half a BP's worth: confirm that is intended.
- **Cannons.** Does each Cannon pick its own target, or one Cannon target per ship (§5.1 says "a target enemy
  ship for Cannon fire")? Is a "burst" the Shells from one Cannon? Does Cannon fire count like a Beam for a
  retreating ship's Escape (D-024 counts only Beams)? The §5.5.1 order format lists Cannons among attributes
  that take hits: confirm.
- **ECM.** May ECM move a Missile's Drive up as well as down (raising it past +4 makes it miss)? Is the
  allocation chosen with sight of the Missiles' orders only, or of the whole revealed order set? What tech level
  does a Missile have (its firing ship's)? §7.1.1 says the defender "adds or subtracts the difference"; the
  example subtracts the Missile's TL from the ship's: confirm the sign.
- **Advanced Warp Generators.** With the module on, does every Warpship use the Medium ratio (2 PD per MP), as
  "MWG (standard)" suggests? How is an odd PD rounded (the §3.2.1 W2 example has PD 7 and a movement allowance of
  4, which fits 2 PD per MP rounded up, but §4 says PD 7 gives 7 MP)? Is a ship of exactly 45 BP Medium or
  Large? Is "size" the BP cost before the generator, and is it rechecked after damage or repair?

### Group 2: economy and territory (large; change what a game is about)

| Module | What it adds (fan §) | Size | Depends on |
|---|---|---|---|
| **Economics** | BP produced at stars by star value (S#/C#/B#) instead of fixed income; BP stockpiled per base and colony; collection by a base, colony or ship (§7.3, §7.3.1, §7.3.2) | L | star values (Blocked) |
| **Holds** | Attribute H: 1 BP per 10 BP capacity; carry BP between stars; damage destroys a hold and 10 BP; load and unload rules (§7.1.2) | M | Economics |
| **Repair Bays** | Attribute R (5 BP): repair and resupply away from bases from hold or star BP; never damaged (§7.1.3, §7.5) | S | Holds |
| **Scrapping** | Scrap a ship at a base for half its current value (§7.3.3) | S | Economics |
| **Colonies and new Bases** | Colony Pods (15 BP, carried in a rack), colonies (collect, repair, store 40 BP, build a base), bases built over turns for 25 BP; colonies and bases destroyed by unopposed enemy ships, half their BP salvageable (§3.4, §7.1.4) | L | Economics, Holds |
| **Star hazards** | "D+#" damage to ships that stay at a star, once per combat event (§7.3.1) | S | star counters (Blocked) |

Open questions found so far: star values are printed on star counters and the fan maps, both images only, so
neither our map nor the rules give them (§7.3.1, §9.1). §9.2 gives a random method (2d6 ÷ 3) but the game is
dice-less and the engine never chooses. Holds: "loaded or unloaded during the Build event only" (§7.1.2) and
"transferred … only in the BP transaction event" (§7.1.2, §2.1) disagree. A base whose construction is
interrupted: are BP already spent on it lost only when an enemy is "present unopposed at the end of the enemy's
turn" (§3.4)? How Economics replaces the Advanced scenario's 10 BP income.

### Group 3: winning (medium; depends on Group 2 for most conditions)

| Module | What it adds (fan §) | Size | Depends on |
|---|---|---|---|
| **Victory conditions** | A ranked set of conditions a scenario picks from: Total Destruction, Emperor, Production Destruction, Star cluster, Create First #, Star Total, VP Total, Ending Turn, Ending Time; a VP formula (40 per Emperor captured, 10 per base, 5 per colony, star values) (§6.1) | M–L | Colonies and Bases for most conditions |
| **The Emperor** | A counter that lives in a base, colony or Warpship (1 SR and 1 empty Hold to carry), must end movement at a star, may never retreat; its loss loses the game (§6.1) | M | Holds, Victory conditions |

Open questions found so far: victory is checked at the end of the turn (§2.5), not at the start (classic §3
event 1, D-037); "control" of a star is not defined; "Ending Time" needs a clock outside the game state.

### Group 4: turn structure, movement and hidden information (large; changes the core)

| Module | What it adds (fan §) | Size | Depends on |
|---|---|---|---|
| **Simultaneous events** | Every player does each event in turn before the next starts: BP transactions, Building, Movement, Combat, End turn processes (§2); movement order by number of ships to move, with "pinning" (§4) | L | rewrites the turn sequence |
| **End movement at a star** | "Warpships must end the movement event at a star" (§4) | S | none |
| **Fan tech schedule** | Tech level up one every five turns, not four (§3.1, §7.2) | S | none |
| **Multiple pickups per round** | A Warpship may pick up or drop as many Systemships in a combat round as it has undamaged racks (§5.6), against D-027 (one) | S | none |
| **Semi-hidden movement** | Counters face down, inspected only when an enemy Warpship enters the star, in the combat event; up to 7 dummy counters (§7.4) | M–L | UI handoff (D-039) |
| **Star exploration** | Star values unknown until a ship first visits; drawn blind (§10.3) | M | star counters (Blocked), draws need a ruling (dice-less engine) |

Open questions found so far: simultaneous events and D-007 (a game-turn is two player-turns) cannot both hold;
whose turn it is for forced withdrawal (§5.1 step 6) and for choosing the combat order ("the player whose star it
is", §5) needs redefining; "Some hexes require two or more MP" (§4) needs per-hex costs the map data lacks.

### Group 5: more players and other ways to play (out of reach for now)

| Module | What it adds (fan §) | Size | Depends on |
|---|---|---|---|
| **3 or more players** | Cornered (4 players) and Unexplored (2+) scenarios, alliances in combat (§2.4, §6.5, §6.6) | L | Simultaneous events, a multi-player UI |
| **Diplomacy** | Four relation levels, one step per turn (§10.1) | M | 3 or more players |
| **Fan scenarios** | Basic Learning (40 BP + 8 a turn, destroy the base), Classic Advanced (fan version), Emperor, Cornered, Unexplored (§6.2 to §6.6) | L | the fan maps 1–9 (Blocked), most modules above |
| **PBEM / refereed blind play** | (§8) | — | networking: outside this project's scope |

## Recommended order

1. **Group 1** first: Armor, then Cannons and Shells, then ECM, then Advanced Warp Generators. Each is a game
   option that adds an attribute or a combat step, fits the current engine and UI, and needs no new map data.
   Armor is the smallest and would set the pattern for how modules are switched on (`createGame({ …, modules })`,
   the builder offering only the attributes a game's modules allow, the panel and records showing them).
2. Then the small rule swaps from Group 4: fan tech schedule, end movement at a star, multiple pickups per round.
3. Group 2 and 3 only after the owner supplies star values (or rules how they are set), since Economics,
   Colonies and Victory conditions all rest on them.
4. Group 4's simultaneous events and Group 5 are a different game structure; worth deciding whether they belong
   in this project at all.
