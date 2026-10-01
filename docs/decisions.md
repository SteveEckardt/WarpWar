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
- **Status:** RESOLVED
- **Where:** §7.2.2 EXAMPLE; §7.1.2; §5.1 SCREENS
- **Text:** "A ship of technological level 0 has Screens powered at 4. … The Screen absorbs 4 of the 7 hits." /
  "BEFORE: W4: Level 0, PD=7, B=3, S=3, T=1, M= 6, SR=1" / §7.1.2: "Beams and Screens cannot be powered past
  their capacity, even if extra power is available." / §5.1: "The number of Build Points spent on a Screen is
  the maximum strength at which that Screen may be powered during combat."
- **Question:** The example powers Screens at 4 on a ship built with S=3. Which is in error: the Screen power
  (4), the record (S=3), or the 7-hits/3-effective arithmetic? Should a test be written from this example at all?
- **Ruling (2026-09-30):** The example is in error. Screens may never be powered above built S. Tests use the
  7-hit, Screen 4, 3-effective arithmetic on a ship built with S of at least 4, not on W4's printed record.

### D-002 — "turns 912" in the tech-level schedule
- **Status:** RESOLVED
- **Where:** §5.2
- **Text:** "those built during turns 912 are Level 2"
- **Question:** Confirm the intended range. (Pattern of neighbouring ranges "1-4", "5-8", "13-16" suggests a
  lost hyphen, but the printed text is "912".)
- **Ruling (2026-09-29):** Turns 9-12. The printed "912" is a lost hyphen.

### D-003 — Garbled numerals ("I", "l") in examples
- **Status:** RESOLVED
- **Where:** §5.1 S55 example; §5.2 tech example; §7.2.1 missile example; §7.2.2 W4 beam example
- **Text:** "with PD = I to power the tube" (record shows `PD=1`) / "It adds its tech level of I to the Screen
  power of 3" / "yields a +l difference" / "Reading the ATTACK (l, -2) row"
- **Question:** Confirm each is the digit 1 (and that "(l, -2)" is the CRT row "-1, -2"), so that tests may
  use those values.
- **Ruling (2026-09-29):** Every garbled "I" and "l" is the digit 1. "(l, -2)" is CRT row -1, -2.

### D-004 — S35 order uses "PD=4" instead of "D=4"
- **Status:** RESOLVED
- **Where:** §7.2.2 second-round example
- **Text:** "S35 (Level 1): DODGE PD=4, B=0, S=0, T=2." — every other order writes the Drive allocation as
  "D=" (e.g., "W4 (Level 0): ATTACK D=2, B=3, S=1,T=0"), and S35's record is "PD=6".
- **Question:** Is "PD=4" a Drive allocation of 4 (as the -2 drive difference in the same example implies),
  or something else?
- **Ruling (2026-09-30):** "PD=4" in the S35 order is a Drive allocation of 4.

### D-005 — Missile order names the firing ship as its target
- **Status:** RESOLVED
- **Where:** §7.1.3
- **Text:** "S25 (Level 0) DODGE: D=4, B=0, S=0, T=1. / M at S25: D=3." — S25 is the firing ship; the prose
  says "the MISSILE attacked W3."
- **Question:** Should the missile line read "M at W3: D=3"? Confirm the target before using this example
  as a test.
- **Ruling (2026-09-30):** The missile's target is W3.

### D-006 — Warplines "treated as space hexes" vs. warpline movement
- **Status:** RESOLVED
- **Where:** §6.1 rule 3; §6.2; §6.2.1; §2 SPACE HEX
- **Text:** "Warplines between stars are treated as space hexes for movement purposes." / "It costs a Warpship
  one movement point to … Move the full distance along a warpline, from the star hex at one end to the star
  hex at the other end" / "W8 treated hex 1818 like any other space hex, even though a warpline passes
  through 1818."
- **Question:** How do rule 3 and §6.2 fit together? Precisely when is a warpline hex an ordinary space hex,
  and when is a warpline traversed for 1 MP?
- **Ruling (2026-09-30):** Warpline travel starts only at an endpoint star and costs 1 MP to reach the other
  endpoint. For any other movement, hexes a warpline crosses are ordinary space hexes.

## B. Turns, scenarios, and victory

### D-007 — What "turn" means for counting
- **Status:** RESOLVED
- **Where:** §3 event 6; §4.3; §5.1 examples; §5.2
- **Text:** "A game-turn consists of a player-turn by each player." / "The passage of one turn should be
  recorded if you are playing the Advanced Scenario, since technological levels depend on how many turns have
  passed." / "Players get 20 Build Points at the start of the first turn and 10 new Build Points at the start
  of every turn thereafter." / "W2 is built during turn 3"
- **Question:** For tech levels and Build Point income, is a "turn" a game-turn or a player-turn? Do both
  players share the same turn number?
- **Ruling (2026-09-29):** "Turn" means game-turn, shared by both players. Each player receives Build Point income
  during their own Build event.

### D-008 — "First turn" movement restriction
- **Status:** RESOLVED
- **Where:** §6.1 rule 6
- **Text:** "Ships may NOT move onto an enemy base star hex during the first turn."
- **Question:** Does this cover the first game-turn (both players' first player-turns) or only the first
  player-turn of the game?
- **Ruling (2026-09-30):** "First turn" means game-turn 1, for both players.

### D-009 — "Effective ships" in the draw condition
- **Status:** RESOLVED
- **Where:** §3 event 1; §4.1; §4.2
- **Text:** "In the Learning and Basic scenarios, it is possible for a game to end in a draw. This occurs when
  neither player has any effective ships left." / "if neither player has effective ships remaining at some
  point in play"
- **Question:** What makes a ship "effective"? (For example, a ship with PD=0; a Systemship with no Warpship
  able to carry it; a ship that can move but has no weapons.) When is the draw checked?
- **Ruling (2026-09-30):** A ship is "effective" if it can fire a weapon or move. A draw occurs when neither
  player has an effective ship, checked at the start of each player-turn.

### D-010 — What counts as occupying a base star for victory points
- **Status:** RESOLVED
- **Where:** §3 event 1; §4.1
- **Text:** "Count one victory point for each enemy base star hex your ship(s) occupy NOW, at the BEGINNING of
  your turn."
- **Question:** Does any ship count, including a Systemship or a ship with only some attributes left? Does a
  Systemship carried aboard a Warpship in the hex add anything?
- **Ruling (2026-09-30):** Any surviving ship on an enemy base star occupies it, including a Systemship or a
  damaged ship. Carried Systemships add nothing. Victory points count per hex, not per ship.

### D-011 — Tech level when Technology rules are not used
- **Status:** RESOLVED
- **Where:** §4.1; §4.2; §5.2
- **Text:** "Repair, Resupply, Technology, and Systemship rules are NOT used." (Learning) / "Repair, Resupply,
  and Technology rules are not used." (Basic) / "In the Advanced Scenario, the technological level for newly
  built ships increases…"
- **Question:** In the Learning and Basic scenarios, are all ships treated as Level 0? Or is tech level
  absent from combat math altogether (for example, no screen bonus, even of zero)?
- **Ruling (2026-09-29):** In Learning and Basic scenarios, all ships are Level 0.

### D-012 — Systemship Racks in the Learning scenario
- **Status:** RESOLVED
- **Where:** §4.1; §5.1
- **Text:** "40 Build Points for building Warpships (only)" / "Systemship rules are NOT used."
- **Question:** May Warpships spend BP on Systemship Racks in the Learning scenario (the racks would do
  nothing but could absorb hits), or are SRs forbidden?
- **Ruling (2026-09-29):** Systemship Racks may not be built in the Learning scenario.

## C. Building, repair, and resupply

### D-013 — "Base star hexes that you control"
- **Status:** RESOLVED
- **Where:** §3 event 2; §5.3
- **Text:** "Newly built ships are placed on any of YOUR base star hexes that you control at that time." / "A
  ship must have started the turn on one of the player's base star hexes in order to be eligible for repair or
  resupply."
- **Question:** What does "control" mean? Is a friendly base with enemy ships on it (e.g., left there after
  the enemy's turn) still controlled? Does the repair rule also need "control"? May captured enemy bases
  ever be used?
- **Ruling (2026-09-30):** A base star is controlled if no enemy ships are on it. New ships may only be placed on
  controlled base stars. Captured enemy bases are never usable.

### D-014 — Minimum legal ship
- **Status:** RESOLVED
- **Where:** §5.1; §7 step 3
- **Text:** "It is NOT necessary for a ship to have all these attributes." / "A ship with only a warp
  generator left can't control it and the generator explodes."
- **Question:** May a player build a Warpship with only a Warp Generator (5 BP) or a Systemship with every
  attribute 0? Is there any minimum?
- **Ruling (2026-09-29):** A ship must have at least one attribute above zero, not counting the Warp Generator.

### D-015 — Buying Missiles at build time
- **Status:** RESOLVED
- **Where:** §5.1 MISSILES; §5.3
- **Text:** "One Build Point will build three Missiles." / (resupply) "One BP replaces up to 3 Missiles. …
  Fractions of Build Points left over after Missile resupply are not saved. However, one BP CAN be used to
  resupply (for instance) 3 ships with one Missile each."
- **Question:** When building (not resupplying), may a ship be built with a Missile count that isn't a
  multiple of 3, and does that cost a whole BP? May one BP's three Missiles be split across several newly
  built ships, as resupply allows? What is the "original" Missile stock limit for resupply in those cases?
- **Ruling (2026-09-29):** Missile cost at build is ceil(M / 3) BP per ship. One BP's Missiles may not be split
  across ships at build time. The built Missile count is the resupply cap.

## D. Movement and the map

### D-016 — Ending movement in a space hex with enemy ships
- **Status:** RESOLVED
- **Where:** §6.1 rule 2; §3 event 4; §7
- **Text:** "Warpships may freely move through space hexes occupied by enemy ships." / "Combat MUST occur
  whenever enemy ships occupy the same star hex…"
- **Question:** May a Warpship end its movement in a space hex that holds enemy ships? If so, confirm that no
  combat happens there.
- **Ruling (2026-09-30):** A Warpship may end movement in a space hex holding enemy ships. No combat occurs
  there. Combat only happens on star hexes.

### D-017 — Spending remaining MP after a forced stop
- **Status:** RESOLVED
- **Where:** §6.1 rule 1; §6.2 items 3–4; §3 event 3
- **Text:** "Warpships must stop their movement on any STAR HEX occupied by an enemy ship." / "It costs a
  Warpship one movement point to … Drop off one Systemship … Pick up one Systemship during the movement event."
- **Question:** After being forced to stop, may the Warpship still spend remaining MP to drop or pick up
  Systemships in that hex before combat?
- **Ruling (2026-09-30):** After a forced stop on a star hex with enemy ships, a Warpship may still spend
  remaining MP to drop or pick up Systemships in that hex.

### D-018 — Stacking limits
- **Status:** RESOLVED
- **Where:** §2; §6 (no stacking rule appears)
- **Text:** — (the rules are silent)
- **Question:** Is there any limit on the number of ships (own or mixed) in one hex?
- **Ruling (2026-09-30):** No stacking limits.

### D-019 — Map data not present in the text
- **Status:** RESOLVED
- **Where:** §2 Illustration 1; §6.2.1
- **Text:** "Illustration 1: Classic WarpWar Map Layout" (image only) / "W6 starts its movement on space hex
  1720. It moves onto Umma …, moves along the warpline to Girsu …, moves 3 hexes to Kish" / "W8 starts on hex
  1919 and moves two hexes to 1717 … a warpline passes through 1818."
- **Question:** Where will the map come from (hex grid size and numbering, star names and positions, which
  stars are base stars, warpline endpoints)? The text doesn't contain it, and the movement examples can't be
  tested without it.
- **Ruling (2026-09-30):** The engine takes the map as input. Map data uses axial coordinates. Display IDs like
  "1720" are strings for humans only. The §6.2.1 examples are recreated on a test map. A playable map comes in
  Phase 6.

## E. Combat

### D-020 — Carried Systemships during combat
- **Status:** RESOLVED
- **Where:** §5.1 SYSTEMSHIPS; §7 step 1; §7.3
- **Text:** "When a Systemship is being carried by a Warpship, its number is noted on the Warpship's record
  sheet, and the Systemship's counter does NOT appear on the map." / "Each player writes an 'order' for each of
  his ships at that star hex" / "Systemships dropped during a combat round may NOT fire weapons (or be fired
  on) that combat round."
- **Question:** Does a Systemship carried aboard a Warpship in a contested hex get orders, fire, or get
  targeted? Or does it take no part until dropped?
- **Ruling (2026-09-30):** Carried Systemships take no part in combat. They cannot fire or be targeted until
  dropped.

### D-021 — Systemship Rack damage while carrying
- **Status:** RESOLVED
- **Where:** §5.1 SYSTEMSHIP RACKS; §7.2.2
- **Text:** "may carry one Systemship for each SR it has" / effective hits are subtracted "directly from
  Power/Drives, Beams, Screens, Tubes, Missiles, and Systemship Racks."
- **Question:** If hits drop a Warpship's SR below the number of Systemships it carries, what happens to the
  excess Systemships (destroyed, dropped in the hex, still carried)? May the owner choose to take such hits?
- **Ruling (2026-09-30):** Occupied racks cannot take hits. The owner may assign hits to a carried Systemship's
  attributes instead. Phase 3 implements only what the current ship model supports; damage to carried
  Systemships is left for the phase that builds carrying.

### D-022 — Retreat or forced withdrawal into a hex with enemy ships
- **Status:** RESOLVED
- **Where:** §7 step 4; §7 step 6(c)
- **Text:** "Ships that successfully retreated are moved to any hex adjacent to the star hex." / "the player
  whose turn it is must withdraw all his ships from that star hex to any hex(es) adjacent to that star hex."
- **Question:** Who chooses the hex? May it be a star hex that holds enemy ships, and if so, is there a new
  combat this turn? Are any adjacent hexes forbidden (for example, an enemy base star on the first turn per
  §6.1 rule 6)?
- **Ruling (2026-09-30):** The retreating owner picks the destination hex. It may not be a star hex with enemy
  ships, or an enemy base star on the first turn.

### D-023 — Forced withdrawal with Systemships that can't be carried
- **Status:** RESOLVED
- **Where:** §7 step 6(c)
- **Text:** "(Systemships are assumed picked up by any Warpship you wish.)"
- **Question:** What happens to the phasing player's Systemships in the hex if there is too little free SR
  capacity, or no Warpship there?
- **Ruling (2026-09-30):** Systemships that cannot be carried on forced withdrawal are destroyed.

### D-024 — ESCAPE when no enemy ship fired on the retreating ship
- **Status:** RESOLVED
- **Where:** §7.2.1 ESCAPES
- **Text:** "In order to ESCAPE, a retreating ship must simultaneously obtain the ESCAPE result against EACH
  enemy ship (not missile) that fired on it."
- **Question:** If no enemy ship fired a Beam at the retreating ship, does it escape automatically, or can it
  not escape? If an enemy ship fired only Missiles at it, does that ship count as having "fired on it", and
  against what CRT cell?
- **Ruling (2026-09-30):** Only Beam fire counts toward escape. A ship with no enemy Beam fire on it escapes
  automatically.

### D-025 — "Escapes" result from a Missile
- **Status:** RESOLVED
- **Where:** §7.2 CRT (Attacking row, Retreating column); §7.2.1
- **Text:** CRT Attacking row gives "Escapes" at "-3 or less" and "-1, -2" against a Retreating target;
  "Missile Fire: … read at … the firing ship's ATTACK row." / "EACH enemy ship (not missile)"
- **Question:** When a Missile's lookup lands on "Escapes", what is the result for that Missile (a miss?), and
  does it have any effect on whether the target escapes?
- **Ruling (2026-09-30):** A Missile result of Escapes is a Miss. It does not affect escape.

### D-026 — Hit and escape in the same round
- **Status:** RESOLVED
- **Where:** §7 steps 3–4; §7.2.1
- **Text:** Step 3 "Players apply the results of weapon hits to the ships." then step 4 "Ships that
  successfully retreated are moved to any hex adjacent to the star hex."
- **Question:** A retreating ship gets ESCAPES from every enemy ship's Beam but is hit by a Missile. Does it
  take the damage and still escape (if it survives)? Does a Missile hit affect the escape?
- **Ruling (2026-09-30):** A retreating ship hit by Missiles takes the damage and still escapes if it survives.

### D-027 — Scope of "one Systemship per combat round"
- **Status:** RESOLVED
- **Where:** §7.3
- **Text:** "Only one Systemship may be picked up or dropped per combat round."
- **Question:** Is the limit one per Warpship per round, or one per player per round?
- **Ruling (2026-09-30):** One Systemship per Warpship per combat round.

### D-028 — Pickup on the round the Warpship escapes
- **Status:** RESOLVED
- **Where:** §7.3
- **Text:** "If the Warpship successfully retreats on the round it drops a Systemship, the Systemship stays in
  the star hex." (No corresponding statement for pickup.)
- **Question:** If a Warpship picks up a Systemship and successfully retreats in the same round, does the
  Systemship leave with it?
- **Ruling (2026-09-30):** A Systemship picked up on the round its Warpship escapes leaves with it.

### D-029 — Missiles fired this round used to absorb this round's hits
- **Status:** RESOLVED
- **Where:** §5.1 MISSILES; §7.2.2
- **Text:** "As they are fired, they must be subtracted from the ship's Missile stock" / "If a ship has only
  1 or 2 Missiles left, it can use them to take a hit. However, if a ship has 3 or more Missiles, a hit in
  Missiles must take out 3."
- **Question:** When a ship takes hits in the same round it fires Missiles, are the fired Missiles already
  gone from the stock that can absorb hits?
- **Ruling (2026-09-30):** Already gone. Missiles fired in a round leave the stock when fired and cannot absorb
  hits taken that round.

### D-030 — Beam with zero power allocated
- **Status:** RESOLVED
- **Where:** §7 step 1(b); §7.2.1 HIT; §5.2
- **Text:** "A Beam which hits does damage equivalent to the power of the beam, plus tech level."
- **Question:** May a ship name a Beam target with B=0 allocated (or with no Beam built) and, on a hit, deal
  tech-level (and CRT bonus) damage? Or must a Beam be powered at 1 or more to fire?
- **Ruling (2026-09-30):** A Beam must be powered at 1 or more to fire.

### D-031 — Drive of a Systemship being picked up
- **Status:** RESOLVED
- **Where:** §7.3
- **Text:** "Systemships picked up during a combat round may not fire any weapon during that round, but may power
  Screens. They may be fired upon by enemy ships."
- **Question:** The text bars weapons only. May a picked-up Systemship also allocate Drive that round?
- **Ruling (2026-09-30):** A Systemship picked up in a combat round may power only Screens. Its Drive is 0 that
  round.

### D-032 — Rack in use for a pickup
- **Status:** RESOLVED
- **Where:** §7.3; §5.1; D-021
- **Text:** "If a Systemship was to be picked up by a Warpship on a given round, but the Warpship is destroyed
  during that round, the Systemship is not automatically destroyed, but remains on the star hex."
- **Question:** Is the rack a Warpship is picking up into occupied for that round's hits? Can hits destroy it
  and so stop the pickup?
- **Ruling (2026-09-30):** A rack in use for a pickup counts as occupied for that round and cannot take hits. The
  pickup completes unless the Warpship is destroyed.

### D-033 — Rack freed by a drop
- **Status:** RESOLVED
- **Where:** §7.3; §5.1; D-021
- **Text:** "If the Warpship dropping a Systemship is destroyed on the round it drops the Systemship, the
  Systemship is NOT destroyed."
- **Question:** Is the rack a Systemship was just dropped from empty for that round's hits?
- **Ruling (2026-09-30):** A rack freed by a drop is empty that round and can take hits.

### D-034 — Warpship with only occupied racks left (amends D-021)
- **Status:** RESOLVED
- **Where:** §7 step 3; §7.2.2; D-021
- **Text:** "Any ship that has received enough hits to reduce all its attributes to zero, except for the warp
  generator, is destroyed."
- **Question:** If occupied racks cannot take hits (D-021), can a loaded Warpship ever be destroyed?
- **Ruling (2026-09-30):** Amends D-021. When a Warpship has no hittable attributes left except occupied racks,
  remaining hits must go to its carried Systemships. A destroyed carried Systemship frees its rack, which can
  then take hits.

### D-035 — Warpship with only the pickup rack left (amends D-032)
- **Status:** RESOLVED
- **Where:** §7.3; §7 step 3; D-032, D-034
- **Text:** "If a Systemship was to be picked up by a Warpship on a given round, but the Warpship is destroyed
  during that round, the Systemship is not automatically destroyed, but remains on the star hex."
- **Question:** D-032 makes the rack in use for a pickup unhittable. Can a Warpship then ever be destroyed on a
  pickup round, and what happens to the pickup when only that rack is left?
- **Ruling (2026-09-30):** Amends D-032. A rack in use for a pickup counts as occupied, except when it is the
  Warpship's last hittable attribute. Then the pickup fails, the rack can take hits, and if the Warpship is
  destroyed the Systemship remains on the hex (§7.3).

## F. Turn sequence

### D-036 — Draw check before any ships are built (clarifies D-009)
- **Status:** RESOLVED
- **Where:** §3 event 1; §4.1; D-009
- **Text:** "This occurs when neither player has any effective ships left." / D-009: "A draw occurs when neither
  player has an effective ship, checked at the start of each player-turn."
- **Question:** At the start of the first player-turn no ships exist yet, so D-009 read literally ends the game
  at once in a draw. When does the draw check begin?
- **Ruling (2026-09-30):** Clarifies D-009. The draw check applies only after both players have completed their
  first Build event.

### D-037 — Victory and draw at the same turn start
- **Status:** RESOLVED
- **Where:** §3 event 1; D-009; D-010
- **Text:** "If this brings your point total to the level necessary for the victory conditions … then you have
  won and the game is over. In the Learning and Basic scenarios, it is possible for a game to end in a draw."
- **Question:** If at the start of a player-turn that player has enough victory points and neither player has
  an effective ship (for example, an occupying ship with PD 0), is it a win or a draw?
- **Ruling (2026-09-30):** Victory is checked first and wins.

### D-038 — Which ships are effective (clarifies D-009)
- **Status:** RESOLVED
- **Where:** §3 event 1; §4.1; §7.1; D-009; D-020; D-030
- **Text:** D-009: "A ship is 'effective' if it can fire a weapon or move."
- **Question:** Firing needs power from PD, and carried Systemships cannot fire until dropped (D-020). Precisely
  which ships count, and do carried Systemships count?
- **Ruling (2026-09-30):** Clarifies D-009. A ship is effective if it has PD of 1 or more and is either a
  Warpship or carries a weapon it can power. This applies to carried Systemships too.

## G. Hidden information

### D-039 — Who may see ship records during play
- **Status:** RESOLVED
- **Where:** §5, §5.1 BUILD POINTS; §2 SCRATCH PAPER; §5.1 SYSTEMSHIPS
- **Text:** "A written record is kept by each player for every ship he builds. Players show these records to each
  other after (but not during) the game." / "IT IS NECESSARY to make a written record for each ship built, the
  damage it takes, and the repairs and resupply it receives." / "the Systemship's counter does NOT appear on the
  map."
- **Question:** On paper only counters are public. What may a player see of the opponent's ships during play in
  a shared-screen game: the records (attributes and damage), only the counters on the map (position, Warpship or
  Systemship, how many), or something in between? Are the BP an opponent spends at a Build event public? Are the
  Systemships an enemy Warpship carries visible?
- **Ruling (2026-10-01):** Counters only. A player sees their own ship records in full. Of enemy ships they see
  only what the counters show: position, Warpship or Systemship, and the counter number. They do not see enemy
  records, enemy Build Point spending, or the Systemships an enemy Warpship carries. All records are shown when
  the game is over. In a shared-screen game, private views sit behind a "pass to <player>" handoff screen.
