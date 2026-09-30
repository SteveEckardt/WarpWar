# Classic WarpWar Rules

> **Source:** `docs/source/warpwar-rules-v3.5.pdf`, pages 5–13 ("Classic WarpWar Rules").
> "From the Microgame 4 booklet first edition printed in 1977."
>
> This file is the rules spec for the engine (see `CLAUDE.md`). Text is transcribed verbatim except for
> the mechanical fixes listed in [Transcription notes](#transcription-notes). Numbers are never altered;
> garbled numbers are kept as printed and marked **[sic]**. Ambiguities and contradictions are logged in
> `docs/decisions.md`, not resolved here.

---

## 1 INTRODUCTION

WarpWar is a two-player tactical game of space combat. Players build their own individualized ships, move them, and resolve combat without dice. The object of the game is to occupy your opponent's base star(s).

WarpWar simulates a hypothetical future where time for flights between stars is huge...but ends in brief but violent combat. Warpships can enter the stressed space channels ("warplines") between stars for nearly instantaneous travel. Nevertheless, wars among the stars last so long that huge advances are made in technology. Older ships are at a disadvantage against newer ones.

The destructive power of weapons technology has become so great that space combats have become tactical guessing games between ship commanders. A clear hit will wreck or cripple all but the most powerful ships. The goal, then, is to outguess the enemy - to use your own weapons in the optimum manner where his defences are weakest, while avoiding a killing counterblow.

WarpWar represents a campaign fought between two relatively close base star areas. The bases can build and supply a few ships, but have no other defences. The battle for a star is over when its sky is swept clean of ships; the planetary bases will be helpless. And, with one side's bases occupied, the war is over.

WarpWar is easy to learn, fast-playing, and challenging. The game consists of constructing Warpships and Systemships and maneuvering them to capture the enemy base(s). Novice gamers will find WarpWar, like Metagaming's other MicroGames, the ideal introduction to the popular hobby of science fiction and fantasy gaming. Experienced gamers will like the ease with which games are completed and the novelty of dice-less combat.

A word of advice for those who have never played simulation or miniature wargames. These games will be vastly different from the usual popular family games. Don't expect the rules to conform to familiar conventions. These games are more ambitious; they portray complex situations, and allow intricate, challenging situations to develop. The rules are generally longer and more complex, but this is necessary for games that are more fun than simplistic mass-market toys can ever be.

The important thing in learning is to PLAY. Skim the rules and concentrate on examples. Then try a few games, using the Sequence of Game Events as a guide. The first few games will be confusing; you may play wrong. Fine. All gamers goof new games. Just keep playing; you'll enjoy yourself, even as you're picking it up, and plain common sense will be all you'll need. Soon, you'll be playing rapidly and well...and a new hobby will be yours.

## 2 GAME COMPONENTS

The Classic WarpWar game components consisted of a rules booklet, the 8.5" by 14" hex-grid play map, and the sheet of heavy-stock play counters. Players can still play the classic game with the new counters and maps.

THE MAP is divided into hexagons ("hexes") which control movement. Some hexes contain stars, and some stars are connected by lines.

> *[Illustration 1: Classic WarpWar Map Layout — image only in the source PDF; not reproduced. See `docs/decisions.md` D-019.]*

STAR HEX is the term used for all map hexes containing a small or large star.

BASE STAR HEX is the term used for all map hexes containing a large star. There are six base star hexes - three at each end of the map.

WARPLINE is the term used for the lines connecting some stars.

SPACE HEX is the term used for any hex on the map that does not contain a star. If a hex has a warpline in it (but no star) it is just like any other space hex.

THE PLAY COUNTERS are the 0.45" x 0.45" heavy-stock printed squares you've cut apart. These represent your spaceships as you play. The counters are moved about on the hex grid and engage in combat. There are two colors of counters - one for each player.

> *[Illustration 2: Classic WarpWar Counters — image only in the source PDF; not reproduced.]*

WARPSHIPS are the ships that can travel between star hexes. A Warpship is identified by the letter "W" and one number. Each player has 9 Warpship counters.

SYSTEMSHIPS are the ships that cannot travel between star hexes unless carried by a Warpship. A Systemship is identified by the letter "S" and a two-digit number. Each player has 19 Systemship counters.

The silhouettes on the counters have no special significance, except to help players further distinguish their ships and to add to the "feel" of the game. The number of counters supplied should be more than sufficient it is unlikely that a player will have more than 9 Warpships or 19 Systemships at any one time but, if necessary, it is perfectly legal to make extra counters to build more ships.

SCRATCH PAPER AND PENCILS are not provided, but will be needed for play. You will need to keep a record of each ship built, its characteristics (or "attributes"), and the combat damage it takes. You will also need to write combat orders for ships. Gamers accustomed to conventional play counters with combat and movement factors will notice that these counters do NOT carry these factors. Each ship built may have different combat and movement capabilities the decisions are up to you.

## 3 SEQUENCE OF GAME EVENTS

Play alternates between the two players in turns. A game-turn consists of a player-turn by each player. A player-turn consists of a player going through each of the events described below. When one player has completed his sequence of events, it is the other player's turn.

The sequence of game events is:

1. **Count Victory Points.** Count one victory point for each enemy base star hex your ship(s) occupy NOW, at the BEGINNING of your turn. If this brings your point total to the level necessary for the victory conditions in the scenario you are playing, then you have won and the game is over. In the Learning and Basic scenarios, it is possible for a game to end in a draw. This occurs when neither player has any effective ships left.
2. **Build Ships.** Receive new Build Points (if you are using the Advanced Scenario. Build new ships, repair damage to old ships, and resupply Missiles to old ships. Newly built ships are placed on any of YOUR base star hexes that you control at that time. (See 5. SHIP BUILDING for more details.)
3. **Movement.** You may move some, none, or all of your Warpships up to the maximum movement (in hexes) of which they are capable. At this time, Warpships may also pick up and/or drop off Systemships, if the Warpships have enough movement. (See 6. MOVEMENT.)
4. **Resolve Combat.** Combat MUST occur whenever enemy ships occupy the same star hex at the end of a player's "movement" event. Combat occurs in each star hex occupied by opposing ships. Combat in each star hex is separate, and ends when only one player's ship(s) occupy that star hex. Counters representing destroyed ships are removed from play, and those ships' records are discarded. (See 7. COMBAT.)
5. **Systemship Pickup and Drop.** After all combats on all star hexes are resolved, the player whose turn it is can have any Warpship drop off any Systemship(s) it carries at the star it occupies, have any Systemships at a star hex picked up by a Warpship there, or transfer Systemships from one Warpship to another at the same star hex. This event is essentially a free shuffling around of Systemships in a star hex, and costs no movement.
6. **End of Turn.** It is now the other player's turn. The passage of one turn should be recorded if you are playing the Advanced Scenario, since technological levels depend on how many turns have passed.

## 4 SETUP FOR PLAY

In order to set up WarpWar for play, each player must select one color of ship counters. Players then decide who will move first; the player moving second chooses which end of the map will be his/hers to defend. The three base stars at a player's end of the map are his/hers, as defined in each scenario. The three scenarios below are different versions of WarpWar; each is progressively more complex. When you are familiar with the game, the Advanced Scenario is recommended as being most challenging and interesting.

### 4.1 LEARNING SCENARIO

Each player starts the game with 40 Build Points for building Warpships (only). No new Build Points are received thereafter. Each player must use all 40 Build Points to build Warpships at the beginning of his first turn. Each player uses only the base star hex in the middle of his end of the map. The other base star hexes are treated as ordinary star hexes. The first player to get ONE victory point (i.e., occupy the enemy base star at the beginning of his own turn) wins. Repair, Resupply, Technology, and Systemship rules are NOT used. This scenario may end in a draw if neither player has effective ships remaining at some point in play.

### 4.2 BASIC SCENARIO

Each player starts the game with 50 Build Points, and receives no Build Points thereafter. Repair, Resupply, and Technology rules are not used. Each player must use all 50 Build Points to build Warpships and/or Systemships at the start of his first turn. Each player uses only the single base star hex in the middle of his end of the map. The first player to accumulate two victory points wins. This scenario may also end in a draw, as above.

### 4.3 ADVANCED SCENARIO

All rules are used. Each player uses all three of his/her base star hexes. Players get 20 Build Points at the start of the first turn and 10 new Build Points at the start of every turn thereafter. Build Points MAY be saved from turn to turn for later use. The first player to accumulate three victory points is the winner.

Players who wish to develop more complicated rules to enhance their enjoyment of WarpWar are encouraged to experiment. WarpWar's modular design is easily expandable. Comments and rules additions are invited, and may find their way into print in our publication, The Space Gamer.

## 5 SHIP BUILDING

During the Ship Building event, a player may (a) build new ships, (b) repair old ships, or (c) resupply Missiles to old ships. A player builds ships by expending Build Points from his stock. The Build Points are spent as explained below. IT IS NECESSARY to make a written record for each ship built, the damage it takes, and the repairs and resupply it receives. A record of Build Points received and expended will also be necessary.

### 5.1 SHIP ATTRIBUTES

Warpships and Systemships may be built with the following attributes. It is NOT necessary for a ship to have all these attributes. If you don't want a ship to have (for instance) missiles, you just don't build any.

POWER/DRIVE (PD) represents the total effective strength of a ship's engines. During movement, the PD of a Warpship gives its movement allowance in hexes. During combat, the PD strength of a ship is allotted to its drive and weapons so that those may operate. During combat, a ship may NEVER allocate power from PD in excess of the available PD strength. Each unit of PD strength costs one BP to build.

WARP GENERATOR (WG) is the unit that allows a ship to move from star to star through space and to jump along Warplines. A ship with a warp generator is a Warpship. Ships without warp generators are Systemships. A warp generator costs 5 BP to build.

BEAMS (B) represent the ability of a ship to project a beam of destructive energy at a target. Each ship may have only one Beam projector. The strength of the projector will vary according to the number of Build Points spent on it. The number of BP spent on the beam is the maximum strength at which that ship's beam may be powered during combat.

SCREENS (S) represent the ability of a ship to surround itself with a protective energy screen. Screens reduce the number of "hits" damage the ship must take when it is struck by an enemy weapon. Beams and Screens are manifestations of the same energy projection generator. Beam and Screen may be used simultaneously, but NEITHER may be used on the same round, that a Missile(s) is fired. The number of Build Points spent on a Screen is the maximum strength at which that Screen may be powered during combat.

TUBES (T) are used by a ship to launch Missiles. Each Tube may launch one Missile per combat round. It requires a PD allocation of 1 to power a Tube for firing. Each Tube costs 1 BP to build.

MISSILES (M) may be fired through a ship's Tubes at an enemy ship. Each missile does a basic damage of 2 hits if it strikes. The number of hits damage a missile does may be modified by other factors - see 7. COMBAT.

One Build Point will build three Missiles. A ship may carry any number of Missiles. As they are fired, they must be subtracted from the ship's Missile stock on that ship's record. Missiles may not be transferred between ships.

SYSTEMSHIP RACKS (SR) let a Warpship carry Systemships. Systemships may not have SRs and may not carry other Systemships. A Warpship may have any number of SRs and may carry one Systemship for each SR it has. Each Systemship Rack costs one BP to build. (A Warpship may NOT be carried in a Systemship Rack.)

BUILD POINTS (BP) are received by a player according to the scenario being played. These BP are spent to build Warpships and Systemships, repair ships, and resupply ships with Missiles. A written record is kept by each player for every ship he builds. Players show these records to each other after (but not during) the game. In the Advanced Scenario, it will also be necessary to keep a record of Build Points received and expended.

Build Points build ship attributes according to this schedule:

- 1BP builds one unit of Power/Drive strength (PD), or
- one unit of Beam strength (B), or
- one unit of Screen strength (S), or
- one Tube (T) for firing Missiles, or
- three Missiles (M), or
- one Systemship Rack (SR).
- 5 BP are needed to build a Warp Generator.

| Attribute | Cost |
|---|---|
| Power/Drive (PD), per unit | 1 BP |
| Beam (B), per unit of strength | 1 BP |
| Screen (S), per unit of strength | 1 BP |
| Tube (T), each | 1 BP |
| Missiles (M) | 1 BP per three Missiles |
| Systemship Rack (SR), each | 1 BP |
| Warp Generator (WG) | 5 BP |

*(Table is a restatement of the schedule above for reference; the schedule is authoritative.)*

Warpships are ships with warp generators. They move from hex to hex on the star map and may move along the warplines. Warpships may also engage in combat and may carry Systemships. A Warpship may select any combat tactic (see 7 COMBAT). Systemships carried by a Warpship are noted by their numbers on that Warpship's record. If a Warpship is destroyed, all Systemships it was carrying when destroyed are also destroyed.

EXAMPLES:

W2 is built during turn 3, which means its technological level (see below) is 0. 17 BP are used to construct it. W2 cannot carry any Systemships (SR = 0), but does have beams of 3, screens of 2, one Tube and 3 Missiles to fire. W2 also has a Power/Drive strength of 5 to use for movement and to allocate to weapons and drive during combat. W2's ship record would look like this:

```
W2: Level 0, PD=5, B=3, S=2, T=1, M=3, SR=0.
```

(This totals 12 BP. Adding the cost of the warp generator, to make it a Warpship, brings the cost to 17 BP.)

W7 is built during turn 6, which means its technological level is 1. 12 BP are used to construct it. It is built to carry two Systemships; it can't fight, since it has no beams, screens, or missiles' It is just a freighter. W7's record would look like this:

```
W7: Level 1, PD=5, B=0, S=0, T=0, M=0, SR=2.
```

(The numbers of the Systemships carried by W7 would also appear here.)

SYSTEMSHIPS do not have warp generators. They may exist only on star hexes unless carried by Warpships. When a Systemship is being carried by a Warpship, its number is noted on the Warpship's record sheet, and the Systemship's counter does NOT appear on the map. Systemships may NEVER move from one hex to another under their own power. They must always be carried by a Warpship, and may only be dropped off at a star hex.

In combat, a Systemship may not select the RETREAT option; it can escape from combat only if carried by a Warpship.

EXAMPLES:

S20 is built during turn 2 (tech level 0). It cost 20 BP. It can have no warp generator or systemship racks. Its record would be:

```
S20: Level 0, PD=7, B=8, S=5, T=0, M=0.
```

S55 is built during turn 9 (tech level 2). It costs 4 BP; it is a fighter-type missile launching ship, with PD = I **[sic]** to power the tube. Its record would be:

```
S55: Level 2, PD=1, B=0, S=0, T=1, M=6.
```

### 5.2 TECHNOLOGICAL LEVELS

In the Advanced Scenario, the technological level for newly built ships increases one level every four turns. Ships always retain their original technological level. Ships built on turns 1-4 are Level 0, those built during turns 5-8 are Level 1, those built during turns 912 **[sic]** are Level 2, those built on turns 13-16 are Level 3, and so on:

In combat, ships add their technological level to the number of hits their Beam and Missiles do when they hit a target. For example, a tech level 3 ship would add 3 hits to its Beam damage, and 3 hits to each Missile damage, when the beam and/or missile actually hit. Ships also add their technological level to the number of hits their Screen can absorb.

TECHNOLOGY IN COMBAT EXAMPLE: A tech level 2 ship fires with a Beam strength of 4 and hits a tech level 1 ship. The firing ship adds 2 to its beam strength of 4, for a total of 6 hits. The target ship had Screens powered at 3. It adds its tech level of I **[sic]** to the Screen power of 3, for a total of 4 hits absorbed by the Screen. Subtracting 4 hits absorbed from 6 inflicted leaves 2 hits the target ship will have to take somewhere in its attributes and mark off of its ship record before the next combat round.

### 5.3 REPAIR AND RESUPPLY

REPAIR AND RESUPPLY occurs during the Ship Building event of a player's turn. A ship must have started the turn on one of the player's base star hexes in order to be eligible for repair or resupply. A Systemship may be repaired, or resupplied with missiles, even when it is loaded on a Warpship. Build Points are spent for repair and resupply in the same way they are spent when a ship is built. One BP builds just as much for repair as for original building. A ship can be repaired PARTIALLY or WHOLLY up to its original strength in each attribute, BUT NO MORE. For example, a ship originally built at PD=7, and damaged so that its new PD is 2, may be repaired all the way up to 7 (costing 5 BP) or repaired to some PD lower than 7. It can never be repaired to over 7. Its technological level remains what it originally was.

Resupply of Missiles allows a player to replace a ship's original stock of Missiles after some have been fired or destroyed in combat. One BP replaces up to 3 Missiles. A ship may not be resupplied with more Missiles than it originally carried. Fractions of Build Points left over after Missile resupply are not saved. However, one BP CAN be used to resupply (for instance) 3 ships with one Missile each.

## 6 MOVEMENT

During the movement event of a player's turn, he may move some, none, or all of his Warpships up to their maximum Power/Drive strength (taking any damage into account). Warpships may pick up or drop Systemships during movement. Ship counters are placed face-up on the map, with lettering visible. Systemships are not placed on the map while being carried by Warpships, but ARE placed on the appropriate star hex when not on a Warpship.

### 6.1 SPECIFIC MOVEMENT RULES

1. Warpships must stop their movement on any STAR HEX occupied by an enemy ship. This applies to Warpships moving either normally or by warplines.
2. Warpships may freely move through space hexes occupied by enemy ships.
3. Warplines between stars are treated as space hexes for movement purposes.
4. A Warpship whose PD is reduced to zero may not move.
5. PD strength used for movement during the movement event is not considered "lost" or expended during the following combat event. When combat commences, a ship may allocate all its present PD strength - that is, its original PD less any damage it has taken.
6. Ships may NOT move onto an enemy base star hex during the first turn.

### 6.2 WARPSHIP MOVEMENT

Warpship movement is governed by the Power/Drive unit. A Warpship uses its PD during movement as if it were a store of movement "points." A Warpship with an undamaged PD=7 would have 7 points for movement. It costs a Warpship one movement point to do any of the following:

1. Move from one hex on the map to an adjacent hex, or
2. Move the full distance along a warpline, from the star hex at one end to the star hex at the other end, or
3. Drop off one Systemship during the movement event, or
4. Pick up one Systemship during the movement event.

Warpline movement is accomplished by having the Warpship move onto the star hex at one end of a warpline (costing one movement point), and moving to the next star hex on that warpline (also costing one movement point). A Warpship may NOT stop at any intermediate hex on the warpline when using warpline movement. Warpships may only enter a warpline for warpline movement at one end of the warpline, NOT in the middle.

#### 6.2.1 WARPSHIP MOVEMENT EXAMPLE

W6 starts its movement on space hex 1720. It moves onto Umma (1 movement point), moves along the warpline to Girsu (1 movement point), moves 3 hexes to Kish (3 movement points), and stops. It expended 5 movement points. Had it dropped a Systemship on any one of those three stars, it would have expended one additional movement point, for a total of 6 used in that move.

Another example: W8 starts on hex 1919 and moves two hexes to 1717 at a cost of 2 movement points. W8 treated hex 1818 like any other space hex, even though a warpline passes through 1818.

## 7 COMBAT

Combat MUST occur when ships of both players occupy the same star hex at the end of a player's movement. Each contested star hex is treated as a separate combat and is resolved separately. The player whose turn it is decides in which order he will resolve combats on contested star hexes. The combat on one star hex is resolved before combat on the next star hex is begun. The combat event of a player's turn is over when combat on all contested star hexes has been resolved.

Combat is resolved as follows:

1. Each player writes an "order" for each of his ships at that star hex, keeping it concealed from his opponent. It should include:
   - (a) A combat tactic from the Combat Results Table (Attack, Dodge, or Retreat).
   - (b) A target enemy ship for Beam fire, if any.
   - (c) A target enemy ship for each Missile fired (if any) and each Missile's drive setting.
   - (d) A power allocation from PD to Beams, Screens, ship Drive, and Tubes (if Missiles are fired). This may NOT exceed the ship's total current PD.
   - (e) Which Systemships, if any, the ship (if a Warpship) is to pick up or drop.
2. When both players have finished writing their orders, they show them to each other. Reading the Combat Results Table, in conjunction with the ship orders, the players determine the result for each weapon fired.
3. Players apply the results of weapon hits to the ships. Any damage a ship receives is immediately marked off its ship record. Any ship that has received enough hits to reduce all its attributes to zero, except for the warp generator, is destroyed. Counters representing destroyed ships are removed. (Warp generators are in the center of ships and never take hits. A ship with only a warp generator left can't control it and the generator explodes.)
4. Ships that successfully retreated are moved to any hex adjacent to the star hex.
5. If both players still have ships on that star hex, a new round of combat is begun on that hex. Writing, revealing, and applying one set of orders constitutes one combat round.
6. Combat ends in a star hex when:
   - (a) All of one player's ships there have been destroyed, or
   - (b) All of one player's ships there have successfully retreated off that hex, or
   - (c) Three consecutive combat rounds occur in which no ships take any damage not absorbed by Screens. In that case, the player whose turn it is must withdraw all his ships from that star hex to any hex(es) adjacent to that star hex. (Systemships are assumed picked up by any Warpship you wish.)

   This rule forces a player who initiates combat to aggressively press the attack.

### 7.1 POWER ALLOCATION AND SHIP ORDERS

Each ship order describes a ship's actions during one combat round. Much of the order will detail how much power is allocated from PD to the other ship attributes. The power allocated from PD is necessary for those other attributes to operate. No more power may be allocated to attributes than is undamaged and available in the PD unit. Drives, Beams, Screens, and Tubes are the attributes that need powering. The warp generator, Missiles, and Systemship Racks do not need power.

#### 7.1.1 POWER ALLOCATION EXAMPLE

A ship was built with an original PD of 9. in previous combat 3 hits have been taken on that PD, reducing it to 6. From that PD = 6, the ship allocates 1 to Drive (for maneuver during combat), 2 to Beams, 2 to Screens, and 0 to Tubes. This totals 5, so 1 is unallocated. (The ship could not power its Tubes to fire Missiles, since it was using Beam and Screens.)

#### 7.1.2 EXAMPLE OF BEAM FIRE

W3 is going to fire its Beam at S25, using the Attack combat tactic. The order for this combat would look like this:

```
W3 (Level 0) ATTACKS S25: D=0, B=3, S=2, T=0.
```

(W3 also powered its Screens at 2 while allocating nothing to Drive or Tubes. W3 would have needed a minimum PD = 5 for this example. Obviously, if W3 had not been built with a Beam of at least 3 and a Screen of at least 2, it could not have carried out this order. Beams and Screens cannot be powered past their capacity, even if extra power is available.)

#### 7.1.3 EXAMPLE OF MISSILE FIRE

S25 fires back at W3, using a missile and the Dodge combat tactic.

```
S25 (Level 0) DODGE: D=4, B=0, S=0, T=1.
M at S25: D=3.
```

(Note that S25 needed a PD of at least 5 to execute this order. The D = 3 for the Missile did NOT come out of the firing ship's PD. Also, note that S25 did not designate a target of its own. It dodged while firing the Missile, and the MISSILE attacked W3. When the Combat Results Table (CRT) is read, the Attack tactic will be used for the Missile to see if the Missile hit.)

It may be helpful to think of a Missile as a little ship that exists for only one combat round and always uses the Attack tactic. The Missile also has its own Drive unit, which can be set to any level of 1 or greater when launched, regardless of the PD of the firing ship, A missile does a basic 2 hits of damage when it hits.

When writing orders, remember: Systemships may NOT select the Retreat tactic. Only Warpships may attempt to Retreat.

### 7.2 READING THE COMBAT RESULTS TABLE

Beam Fire: The appropriate cell from the CRT for Beam fire is read at the intersection of the target ship's combat-tactic column and the firing ship's combat-tactic row. The specific row is found by subtracting the target ship's Drive allocation from the firing ship's Drive allocation and using the row corresponding to the difference.

**Table 1: Combat Results Table**

| Firing Ship Tactics | Drive Difference (attacker-target) | Target ship Attacking | Target ship Dodging | Target ship Retreating |
|---|---|---|---|---|
| Attacking | -3 or less | Miss | Miss | Escapes |
| Attacking | -1, -2 | Hit | Miss | Escapes |
| Attacking | 0, +1 | Hit +2 | Miss | Miss |
| Attacking | +2 | Hit +1 | Hit +1 | Miss |
| Attacking | +3, +4 | Miss | Hit | Hit |
| Attacking | +5 or more | Miss | Miss | Miss |
| Dodging | -4 or less | Miss | Miss | Escapes |
| Dodging | -2, -3 | Miss | Hit | Escapes |
| Dodging | 0, -1 | Hit | Hit | Escapes |
| Dodging | +1, +2 | Hit | Miss | Escapes |
| Dodging | +3 or more | Miss | Miss | Escapes |
| Retreating | -2 or less | Miss | Miss | Escapes |
| Retreating | -1, 0 | Hit | Miss | Escapes |
| Retreating | +1 or more | Miss | Miss | Escapes |

#### 7.2.1 EXPLANATION OF COMBAT RESULTS

MISS: The MISS result means the weapon fired missed the target ship, and no damage was done.

ESCAPES: The ESCAPES result means that the ship that selected the RETREAT combat tactic successfully withdrew from its enemy(ies) and escaped. In order to ESCAPE, a retreating ship must simultaneously obtain the ESCAPE result against EACH enemy ship (not missile) that fired on it.

HIT: The HIT result means that the Beam or Missile fired at the target hit it. A Beam which hits does damage equivalent to the power of the beam, plus tech level. A Missile which hits does 2 hits damage, plus tech level. "HIT + 1" and "HIT + 2" mean you add one and two hits, respectively, to the hits of damage inflicted by the weapon.

Beam Fire Example: The firing ship selects the Dodge tactic, allocates 3 PD to Drives, and allocates 3 PD to Beam. The target ship selects the Attack tactic and allocates 2 to Drive with Screens unpowered. Subtracting the target Drive of 2 from the firing ship's Drive of 3 yields a +1. The result from the CRT is read at the intersection of the target ship's ATTACK column and the firing ship's DODGE row at +1, +2. The +1, +2 row is read because of the +1 difference between Drives. (It also would have been read if the difference was +2.) The result at this intersection is "HIT."

Missile Fire: The appropriate CRT cell for Missile fire is read at the intersection of the target ship's combat tactic column and the firing ship's ATTACK row. (Missiles always attack.) The specific ship tactic row is found by subtracting the target's Drive allocation from the Drive setting given to the MISSILE. (Remember: A Missile may be given any Drive setting of +1 or greater, at no PD cost except the 1 PD needed to power its Tube.)

Missile Fire Example: A Missile is fired with a drive setting of 4. It attacks (as always). The target ship selected the Attack tactic and allotted 3 PD to Drive. Subtracting the target's Drive allocation of 3 from the Missile's Drive setting of 4 yields a +l **[sic]** difference. The CRT result is read at the intersection of the target's ATTACK column and the firing ship's ATTACK (0, +1) row. The 0, +1 row is read because the difference between the Missile and target's Drive settings is +1. The result at that intersection is "Hit + 2."

#### 7.2.2 RECORDING SHIP DAMAGE FROM COMBAT

When enemy weapons hit a target ship, that ship takes damage cumulatively from all weapons (of all ships) that hit it in each combat round. The amount of power allocated to a ship's Screens, PLUS that ship's technological level, is subtracted from all hits a ship receives. (If the Screen is not powered, no tech level is added to the S = 0.) The Hit + 1 and Hit + 2 results from the CRT add one and two hits, respectively, to the hits a weapon inflicts. One hit (if unabsorbed by Screens) does one Build Point worth of damage to the target. Warp generators NEVER take damage in combat; when all the rest of a ship is destroyed, the warp generator explodes.

After subtracting the hits absorbed by the target ship's screen from all hits scored on it, the remaining hits ("effective hits") are taken somewhere in the target's attributes. When all of a ship's attributes (except the warp generator) are reduced to 0, the ship is destroyed. Its counter is then removed from the map.

The player owning a ship decides where the hits are to be taken.

EXAMPLE

A ship of technological level 0 has Screens powered at 4. It takes 7 hits in one combat round (including tech level adjustments). The Screen absorbs 4 of the 7 hits. The remaining 3 "effective" hits must be taken in the ship's attributes. This is done by subtracting directly from Power/Drives, Beams, Screens, Tubes, Missiles, and Systemship Racks. Before and after records for one round might look like this:

```
BEFORE: W4: Level 0, PD=7, B=3, S=3, T=1, M= 6, SR=1 (A 22-BP ship, counting the generator.)
```

AFTER: W4: Level 0, PD=~~7~~ 6, B=3, S=~~3~~ 2, T=1, M=~~6~~ 3, SR=1

The player chose to take one hit in PD, one in Screens, and one in Missiles. Since 3 Missiles cost 1 BP, the one hit took out 3 Missiles. If a ship has only 1 or 2 Missiles left, it can use them to take a hit. However, if a ship has 3 or more Missiles, a hit in Missiles must take out 3.

Suppose W4 did not kill its enemy, but enters another round of combat. The enemy ship is S35, a Level 1 Systemship. It fired two missiles last round, and has attributes as follows:

S35: Level 1, PD=6, B=2, S=3, T=2, M=~~9~~ 7.

Combat orders for both ships are written out. The players choose the following tactics:

```
S35 (Level 1): DODGE PD=4, B=0, S=0, T=2.
M at W4: D=3
M at W4: D=4
W4 (Level 0): ATTACK D=2, B=3, S=1,T=0
```

The Systemship dodged and fired two Missiles, one at drive setting 3 and one at 4. The Warpship attacked, firing its Beam at 3 and putting up a Screen with a strength of 1.

Reading the CRT, we see that both Missiles hit W4: one at ATTACK (0, +1) and one at ATTACK (+2). Those are, respectively, a Hit + 2 and a Hit + 1. S35 also adds one more hit to the damage inflicted by each Missile because it is tech level 1. Thus, the two Missiles that hit each do a basic 2 hits of damage, plus one more for tech level, and add the +2 and +1 from the CRT. The two Missiles inflict 5 and 4 hits, respectively, for a total of 9 hits.

W4's Screen was powered at 1, which subtracts 1 hit from the 9 done by the two Missiles - leaving 8 effective hits. (Since W4 is only tech level 0, the Screen absorbed no extra hits.) W4 must take 8 hits somewhere in its attributes. Its record at the end of last round looked like this:

W4: Level 0, PD=~~7~~ 6, B=3, S=~~3~~ 2, T=1, M=~~6~~ 3, SR=1

After taking 8 hits, it looks like this:

W4: Level 0, PD=~~7~~ 6, B=~~3~~ 0, S=~~3~~ ~~2~~ 0, T=~~1~~ 0, M=~~6~~ ~~3~~ 0, SR=~~1~~ 0

W4 has elected to preserve all the PD possible in order to make an effective retreat attempt.

(S35 took no damage, because W4 missed with its Beam fire. The Drive difference, subtracting S35's drive from W4's drive, was a -2. Reading the ATTACK (l, -2) **[sic]** row for a firing ship and the DODGE column for the target ship gives a result of MISS.

### 7.3 SYSTEMSHIP PICKUP AND DROP IN COMBAT

A Warpship may pick up or drop a Systemship during a combat round if it allocates Drive = 0 and Screen = 0 and selects the Dodge or Retreat tactic. Only one Systemship may be picked up or dropped per combat round. The Warpship may fire its Beam while picking up or dropping a Systemship, but may NOT fire Missiles.

Systemships dropped during a combat round may NOT fire weapons (or be fired on) that combat round.

Systemships picked up during a combat round may not fire any weapon during that round, but may power Screens. They may be fired upon by enemy ships.

If a Systemship was to be picked up by a Warpship on a given round, but the Warpship is destroyed during that round, the Systemship is not automatically destroyed, but remains on the star hex.

If the Warpship dropping a Systemship is destroyed on the round it drops the Systemship, the Systemship is NOT destroyed. If the Warpship successfully retreats on the round it drops a Systemship, the Systemship stays in the star hex.

## 8 SYSTEMSHIP PICKUP AND DROP AFTER COMBAT

After all combat on all star hexes has been resolved for a player's turn, he may designate any Systemships he wishes picked up or dropped by any Warpship on the appropriate star hex. This is essentially a free rearrangement of Systemships following combat, for the player whose turn it was.

*End of Classic WarpWar rules.*

---

## Transcription notes

Mechanical changes from the `pdftotext` extraction of pages 5–13. None changes a number or a rule.

- **Layout.** Page headers/footers ("WarpWar Classic WarpWar Rules … Page N") removed. The PDF's two-column
  layout places 4.1 after the "5 SHIP BUILDING" heading; sections are restored to numeric order (4, 4.1, 4.2,
  4.3, 5). Paragraphs split across columns/pages are rejoined.
- **Illustrations.** Illustration 1 (map) and Illustration 2 (counters) are images; replaced with placeholders.
- **Line-break hyphenation rejoined:** "Warp- ships" → "Warpships" (§1, §3 event 3, §4.2), "destroy- ed" →
  "destroyed", "dis- carded" → "discarded", "System- ships" →
  "Systemships", "re-supply"/"re- supplied" → "resupply"/"resupplied" (§5.3), "Power/ Drive" → "Power/Drive" (§6).
- **OCR spelling fixes (letters only):** "THE, PLAY COUNTERS" → "THE PLAY COUNTERS"; "tiring" → "firing"
  (§5.2 tech example, §7.2.1 missile example); "arc" → "are" (§5.1 "Systemships carried…", §7 step 3); "lull" →
  "full" (§6.2); "inc end" → "one end" (§6.2); "thai" → "that" (§6.2.1); "asa" → "as a" (§7); "docs" → "does"
  (§7.1.3); "flred" → "fired" (§7.2.1); "allocate s" → "allocates" (§7.2.1); "War- ship" → "Warpship" (§3 event 5).
- **Kept as printed (not fixed):** unclosed parenthesis in §3 event 2 "(if you are using the Advanced Scenario.";
  "missiles'" in the W7 example; "PD of 9. in previous combat" (§7.1.1); stray comma "on the same round, that"
  (§5.1 Screens); "firing ship, A missile" (§7.1.3); unclosed "(S35 took no damage…" parenthesis (§7.2.2);
  "M at S25: D=3." (§7.1.3 — the prose says the missile attacked W3; see D-005); "PD=4" in the S35 order (D-004);
  "M= 6" spacing; missing spaces in "1BP" and "S=1,T=0".
- **Numeric garbles kept with [sic]** and logged in `docs/decisions.md`: "PD = I" (§5.1 S55), "tech level of I"
  (§5.2), "turns 912" (§5.2), "+l difference" (§7.2.1), "ATTACK (l, -2)" (§7.2.2).
- **Strikethrough.** The W4/S35 records in §7.2.2 print old values struck through followed by new values.
  Text extraction loses the strike formatting (e.g., "PD=7 6", "S=32 0", "M=63 0"); rendered here as
  `~~old~~ new`, inferred from the example's arithmetic. These records are left as plain lines (not code
  blocks) so the strikethrough renders.
- **Build-cost table** in §5.1 is an added restatement of the printed schedule; the printed list is kept verbatim above it.
- **CRT** converted from the PDF's grid (verified against `pdftotext -layout`). Each row repeats its
  firing-ship tactic so the table is lookup-friendly; row labels use the source wording.
