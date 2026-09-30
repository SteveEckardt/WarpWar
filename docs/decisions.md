# Rules Decisions Log

Ambiguities, gaps, and contradictions found in the Classic rules (`docs/rules/classic.md`, from
`docs/source/warpwar-rules-v3.5.pdf` pp. 5–13).

- Every entry starts as **OPEN**. No entry proposes a ruling. The project owner resolves each one.
- When resolved, change the status to **RESOLVED**, add a `Ruling:` line with the date, and leave the
  original question in place.
- Engine code that depends on an OPEN entry must not be written until it is resolved.

Entry format: ID, title, status, where it appears, the rule text as quoted, and the open question.

---

## A. Contradictions and text errors

### D-001 — W4 Screens powered above built capacity
- **Status:** OPEN
- **Where:** §7.2.2 EXAMPLE; §7.1.2; §5.1 SCREENS
- **Text:** "A ship of technological level 0 has Screens powered at 4. … The Screen absorbs 4 of the 7 hits." /
  "BEFORE: W4: Level 0, PD=7, B=3, S=3, T=1, M= 6, SR=1" / §7.1.2: "Beams and Screens cannot be powered past
  their capacity, even if extra power is available." / §5.1: "The number of Build Points spent on a Screen is
  the maximum strength at which that Screen may be powered during combat."
- **Question:** The example powers Screens at 4 on a ship built with S=3. Which is in error: the Screen power
  (4), the record (S=3), or the 7-hits/3-effective arithmetic? Should a test be written from this example at all?

### D-002 — "turns 912" in the tech-level schedule
- **Status:** OPEN
- **Where:** §5.2
- **Text:** "those built during turns 912 are Level 2"
- **Question:** Confirm the intended range. (Pattern of neighbouring ranges "1-4", "5-8", "13-16" suggests a
  lost hyphen, but the printed text is "912".)

### D-003 — Garbled numerals ("I", "l") in examples
- **Status:** OPEN
- **Where:** §5.1 S55 example; §5.2 tech example; §7.2.1 missile example; §7.2.2 W4 beam example
- **Text:** "with PD = I to power the tube" (record shows `PD=1`) / "It adds its tech level of I to the Screen
  power of 3" / "yields a +l difference" / "Reading the ATTACK (l, -2) row"
- **Question:** Confirm each is the digit 1 (and that "(l, -2)" is the CRT row "-1, -2"), so that tests may
  use those values.

### D-004 — S35 order uses "PD=4" instead of "D=4"
- **Status:** OPEN
- **Where:** §7.2.2 second-round example
- **Text:** "S35 (Level 1): DODGE PD=4, B=0, S=0, T=2." — every other order writes the Drive allocation as
  "D=" (e.g., "W4 (Level 0): ATTACK D=2, B=3, S=1,T=0"), and S35's record is "PD=6".
- **Question:** Is "PD=4" a Drive allocation of 4 (as the -2 drive difference in the same example implies),
  or something else?

### D-005 — Missile order names the firing ship as its target
- **Status:** OPEN
- **Where:** §7.1.3
- **Text:** "S25 (Level 0) DODGE: D=4, B=0, S=0, T=1. / M at S25: D=3." — S25 is the firing ship; the prose
  says "the MISSILE attacked W3."
- **Question:** Should the missile line read "M at W3: D=3"? Confirm the target before using this example
  as a test.

### D-006 — Warplines "treated as space hexes" vs. warpline movement
- **Status:** OPEN
- **Where:** §6.1 rule 3; §6.2; §6.2.1; §2 SPACE HEX
- **Text:** "Warplines between stars are treated as space hexes for movement purposes." / "It costs a Warpship
  one movement point to … Move the full distance along a warpline, from the star hex at one end to the star
  hex at the other end" / "W8 treated hex 1818 like any other space hex, even though a warpline passes
  through 1818."
- **Question:** How do rule 3 and §6.2 fit together? Precisely when is a warpline hex an ordinary space hex,
  and when is a warpline traversed for 1 MP?

## B. Turns, scenarios, and victory

### D-007 — What "turn" means for counting
- **Status:** OPEN
- **Where:** §3 event 6; §4.3; §5.1 examples; §5.2
- **Text:** "A game-turn consists of a player-turn by each player." / "The passage of one turn should be
  recorded if you are playing the Advanced Scenario, since technological levels depend on how many turns have
  passed." / "Players get 20 Build Points at the start of the first turn and 10 new Build Points at the start
  of every turn thereafter." / "W2 is built during turn 3"
- **Question:** For tech levels and Build Point income, is a "turn" a game-turn or a player-turn? Do both
  players share the same turn number?

### D-008 — "First turn" movement restriction
- **Status:** OPEN
- **Where:** §6.1 rule 6
- **Text:** "Ships may NOT move onto an enemy base star hex during the first turn."
- **Question:** Does this cover the first game-turn (both players' first player-turns) or only the first
  player-turn of the game?

### D-009 — "Effective ships" in the draw condition
- **Status:** OPEN
- **Where:** §3 event 1; §4.1; §4.2
- **Text:** "In the Learning and Basic scenarios, it is possible for a game to end in a draw. This occurs when
  neither player has any effective ships left." / "if neither player has effective ships remaining at some
  point in play"
- **Question:** What makes a ship "effective"? (For example, a ship with PD=0; a Systemship with no Warpship
  able to carry it; a ship that can move but has no weapons.) When is the draw checked?

### D-010 — What counts as occupying a base star for victory points
- **Status:** OPEN
- **Where:** §3 event 1; §4.1
- **Text:** "Count one victory point for each enemy base star hex your ship(s) occupy NOW, at the BEGINNING of
  your turn."
- **Question:** Does any ship count, including a Systemship or a ship with only some attributes left? Does a
  Systemship carried aboard a Warpship in the hex add anything?

### D-011 — Tech level when Technology rules are not used
- **Status:** OPEN
- **Where:** §4.1; §4.2; §5.2
- **Text:** "Repair, Resupply, Technology, and Systemship rules are NOT used." (Learning) / "Repair, Resupply,
  and Technology rules are not used." (Basic) / "In the Advanced Scenario, the technological level for newly
  built ships increases…"
- **Question:** In the Learning and Basic scenarios, are all ships treated as Level 0? Or is tech level
  absent from combat math altogether (for example, no screen bonus, even of zero)?

### D-012 — Systemship Racks in the Learning scenario
- **Status:** OPEN
- **Where:** §4.1; §5.1
- **Text:** "40 Build Points for building Warpships (only)" / "Systemship rules are NOT used."
- **Question:** May Warpships spend BP on Systemship Racks in the Learning scenario (the racks would do
  nothing but could absorb hits), or are SRs forbidden?

## C. Building, repair, and resupply

### D-013 — "Base star hexes that you control"
- **Status:** OPEN
- **Where:** §3 event 2; §5.3
- **Text:** "Newly built ships are placed on any of YOUR base star hexes that you control at that time." / "A
  ship must have started the turn on one of the player's base star hexes in order to be eligible for repair or
  resupply."
- **Question:** What does "control" mean? Is a friendly base with enemy ships on it (e.g., left there after
  the enemy's turn) still controlled? Does the repair rule also need "control"? May captured enemy bases
  ever be used?

### D-014 — Minimum legal ship
- **Status:** OPEN
- **Where:** §5.1; §7 step 3
- **Text:** "It is NOT necessary for a ship to have all these attributes." / "A ship with only a warp
  generator left can't control it and the generator explodes."
- **Question:** May a player build a Warpship with only a Warp Generator (5 BP) or a Systemship with every
  attribute 0? Is there any minimum?

### D-015 — Buying Missiles at build time
- **Status:** OPEN
- **Where:** §5.1 MISSILES; §5.3
- **Text:** "One Build Point will build three Missiles." / (resupply) "One BP replaces up to 3 Missiles. …
  Fractions of Build Points left over after Missile resupply are not saved. However, one BP CAN be used to
  resupply (for instance) 3 ships with one Missile each."
- **Question:** When building (not resupplying), may a ship be built with a Missile count that isn't a
  multiple of 3, and does that cost a whole BP? May one BP's three Missiles be split across several newly
  built ships, as resupply allows? What is the "original" Missile stock limit for resupply in those cases?

## D. Movement and the map

### D-016 — Ending movement in a space hex with enemy ships
- **Status:** OPEN
- **Where:** §6.1 rule 2; §3 event 4; §7
- **Text:** "Warpships may freely move through space hexes occupied by enemy ships." / "Combat MUST occur
  whenever enemy ships occupy the same star hex…"
- **Question:** May a Warpship end its movement in a space hex that holds enemy ships? If so, confirm that no
  combat happens there.

### D-017 — Spending remaining MP after a forced stop
- **Status:** OPEN
- **Where:** §6.1 rule 1; §6.2 items 3–4; §3 event 3
- **Text:** "Warpships must stop their movement on any STAR HEX occupied by an enemy ship." / "It costs a
  Warpship one movement point to … Drop off one Systemship … Pick up one Systemship during the movement event."
- **Question:** After being forced to stop, may the Warpship still spend remaining MP to drop or pick up
  Systemships in that hex before combat?

### D-018 — Stacking limits
- **Status:** OPEN
- **Where:** §2; §6 (no stacking rule appears)
- **Text:** — (the rules are silent)
- **Question:** Is there any limit on the number of ships (own or mixed) in one hex?

### D-019 — Map data not present in the text
- **Status:** OPEN
- **Where:** §2 Illustration 1; §6.2.1
- **Text:** "Illustration 1: Classic WarpWar Map Layout" (image only) / "W6 starts its movement on space hex
  1720. It moves onto Umma …, moves along the warpline to Girsu …, moves 3 hexes to Kish" / "W8 starts on hex
  1919 and moves two hexes to 1717 … a warpline passes through 1818."
- **Question:** Where will the map come from (hex grid size and numbering, star names and positions, which
  stars are base stars, warpline endpoints)? The text doesn't contain it, and the movement examples can't be
  tested without it.

## E. Combat

### D-020 — Carried Systemships during combat
- **Status:** OPEN
- **Where:** §5.1 SYSTEMSHIPS; §7 step 1; §7.3
- **Text:** "When a Systemship is being carried by a Warpship, its number is noted on the Warpship's record
  sheet, and the Systemship's counter does NOT appear on the map." / "Each player writes an 'order' for each of
  his ships at that star hex" / "Systemships dropped during a combat round may NOT fire weapons (or be fired
  on) that combat round."
- **Question:** Does a Systemship carried aboard a Warpship in a contested hex get orders, fire, or get
  targeted? Or does it take no part until dropped?

### D-021 — Systemship Rack damage while carrying
- **Status:** OPEN
- **Where:** §5.1 SYSTEMSHIP RACKS; §7.2.2
- **Text:** "may carry one Systemship for each SR it has" / effective hits are subtracted "directly from
  Power/Drives, Beams, Screens, Tubes, Missiles, and Systemship Racks."
- **Question:** If hits drop a Warpship's SR below the number of Systemships it carries, what happens to the
  excess Systemships (destroyed, dropped in the hex, still carried)? May the owner choose to take such hits?

### D-022 — Retreat or forced withdrawal into a hex with enemy ships
- **Status:** OPEN
- **Where:** §7 step 4; §7 step 6(c)
- **Text:** "Ships that successfully retreated are moved to any hex adjacent to the star hex." / "the player
  whose turn it is must withdraw all his ships from that star hex to any hex(es) adjacent to that star hex."
- **Question:** Who chooses the hex? May it be a star hex that holds enemy ships, and if so, is there a new
  combat this turn? Are any adjacent hexes forbidden (for example, an enemy base star on the first turn per
  §6.1 rule 6)?

### D-023 — Forced withdrawal with Systemships that can't be carried
- **Status:** OPEN
- **Where:** §7 step 6(c)
- **Text:** "(Systemships are assumed picked up by any Warpship you wish.)"
- **Question:** What happens to the phasing player's Systemships in the hex if there is too little free SR
  capacity, or no Warpship there?

### D-024 — ESCAPE when no enemy ship fired on the retreating ship
- **Status:** OPEN
- **Where:** §7.2.1 ESCAPES
- **Text:** "In order to ESCAPE, a retreating ship must simultaneously obtain the ESCAPE result against EACH
  enemy ship (not missile) that fired on it."
- **Question:** If no enemy ship fired a Beam at the retreating ship, does it escape automatically, or can it
  not escape? If an enemy ship fired only Missiles at it, does that ship count as having "fired on it", and
  against what CRT cell?

### D-025 — "Escapes" result from a Missile
- **Status:** OPEN
- **Where:** §7.2 CRT (Attacking row, Retreating column); §7.2.1
- **Text:** CRT Attacking row gives "Escapes" at "-3 or less" and "-1, -2" against a Retreating target;
  "Missile Fire: … read at … the firing ship's ATTACK row." / "EACH enemy ship (not missile)"
- **Question:** When a Missile's lookup lands on "Escapes", what is the result for that Missile (a miss?), and
  does it have any effect on whether the target escapes?

### D-026 — Hit and escape in the same round
- **Status:** OPEN
- **Where:** §7 steps 3–4; §7.2.1
- **Text:** Step 3 "Players apply the results of weapon hits to the ships." then step 4 "Ships that
  successfully retreated are moved to any hex adjacent to the star hex."
- **Question:** A retreating ship gets ESCAPES from every enemy ship's Beam but is hit by a Missile. Does it
  take the damage and still escape (if it survives)? Does a Missile hit affect the escape?

### D-027 — Scope of "one Systemship per combat round"
- **Status:** OPEN
- **Where:** §7.3
- **Text:** "Only one Systemship may be picked up or dropped per combat round."
- **Question:** Is the limit one per Warpship per round, or one per player per round?

### D-028 — Pickup on the round the Warpship escapes
- **Status:** OPEN
- **Where:** §7.3
- **Text:** "If the Warpship successfully retreats on the round it drops a Systemship, the Systemship stays in
  the star hex." (No corresponding statement for pickup.)
- **Question:** If a Warpship picks up a Systemship and successfully retreats in the same round, does the
  Systemship leave with it?

### D-029 — Missiles fired this round used to absorb this round's hits
- **Status:** OPEN
- **Where:** §5.1 MISSILES; §7.2.2
- **Text:** "As they are fired, they must be subtracted from the ship's Missile stock" / "If a ship has only
  1 or 2 Missiles left, it can use them to take a hit. However, if a ship has 3 or more Missiles, a hit in
  Missiles must take out 3."
- **Question:** When a ship takes hits in the same round it fires Missiles, are the fired Missiles already
  gone from the stock that can absorb hits?

### D-030 — Beam with zero power allocated
- **Status:** OPEN
- **Where:** §7 step 1(b); §7.2.1 HIT; §5.2
- **Text:** "A Beam which hits does damage equivalent to the power of the beam, plus tech level."
- **Question:** May a ship name a Beam target with B=0 allocated (or with no Beam built) and, on a hit, deal
  tech-level (and CRT bonus) damage? Or must a Beam be powered at 1 or more to fire?
