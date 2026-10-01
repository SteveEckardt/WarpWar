// Systemship carrying: racks, rearrangement after combat, forced withdrawal.
// Rules: docs/rules/classic.md §3 event 5, §5.1, §7 step 6(c), §8. Rulings: D-021, D-023 in docs/decisions.md.
//
// A Warpship record may hold `carrying: { id: Systemship record }` (no owner: it is the carrier's).
// A Systemship on a star hex is an ordinary entry in a `ships` map: { id: record + owner }.

// A Warpship carries one Systemship per undamaged SR (§5.1): its current SR, less what it carries.
export const carriedIds = (ship) => Object.keys(ship.carrying ?? {});
export const freeRacks = (ship) => ship.SR - carriedIds(ship).length;

// A destroyed Warpship destroys every Systemship it was carrying (§5.1).
export const cargoLost = (ship) => carriedIds(ship);

function ownerShips(ships, owner) {
  return Object.entries(ships).filter(([, s]) => s.owner === owner);
}

function assertOwnWarpship(ships, owner, id) {
  if (!(id in ships) || ships[id].owner !== owner || !ships[id].WG) {
    throw new RangeError(`${id} is not a ${owner} Warpship in this hex`);
  }
}

// §8: a free rearrangement of the owner's Systemships at one star hex: drops, pickups and transfers.
// `assignment` maps a Warpship id to the Systemship ids it carries afterwards. A Warpship left out of
// it keeps its load. Every owner Systemship in the hex (loose or carried) not named ends up loose on the hex.
// Returns a new ships map. Throws RangeError for an illegal assignment.
export function rearrange(ships, owner, assignment) {
  const pool = {};
  for (const [id, s] of ownerShips(ships, owner)) {
    if (!s.WG) pool[id] = s;
    for (const [cid, rec] of Object.entries(s.carrying ?? {})) pool[cid] = { ...rec, owner };
  }

  const claimed = new Set();
  const claim = (cid) => {
    if (!(cid in pool)) throw new RangeError(`${cid} is not a ${owner} Systemship in this hex`);
    if (pool[cid].WG) throw new RangeError(`${cid} is a Warpship and cannot be carried`);
    if (claimed.has(cid)) throw new RangeError(`${cid} is assigned more than once`);
    claimed.add(cid);
  };
  for (const [id, s] of ownerShips(ships, owner)) {
    if (s.WG && !(id in assignment)) carriedIds(s).forEach(claim);
  }
  for (const [id, load] of Object.entries(assignment)) {
    assertOwnWarpship(ships, owner, id);
    if (load.length > ships[id].SR) {
      throw new RangeError(`${id} has ${ships[id].SR} SR but was assigned ${load.length} Systemships`);
    }
    load.forEach(claim);
  }

  const next = {};
  for (const [id, s] of Object.entries(ships)) {
    if (s.owner === owner && !s.WG && claimed.has(id)) continue; // now aboard a Warpship
    if (id in assignment) {
      const cargo = Object.fromEntries(assignment[id].map((cid) => [cid, withoutOwner(pool[cid])]));
      next[id] = { ...s, carrying: cargo };
    } else {
      next[id] = s;
    }
  }
  for (const cid of Object.keys(pool)) {
    if (!claimed.has(cid) && !(cid in next)) next[cid] = pool[cid];
  }
  return next;
}

const withoutOwner = ({ owner, ...record }) => record;

// §7 step 6(c), D-023: on forced withdrawal the owner's loose Systemships are picked up by Warpships
// of the owner's choosing; those beyond the free SR capacity are destroyed.
// `pickups` maps a Warpship id to the loose Systemship ids it takes aboard. The owner must carry as many
// as the free racks allow. Returns { ships, destroyed }: ships has the loose Systemships removed.
export function withdrawSystemships(ships, owner, pickups) {
  const loose = ownerShips(ships, owner).filter(([, s]) => !s.WG).map(([id]) => id);
  const warpships = ownerShips(ships, owner).filter(([, s]) => s.WG);
  const capacity = warpships.reduce((sum, [, s]) => sum + freeRacks(s), 0);

  const taken = new Set();
  for (const [id, load] of Object.entries(pickups)) {
    assertOwnWarpship(ships, owner, id);
    if (load.length > freeRacks(ships[id])) {
      throw new RangeError(`${id} has ${freeRacks(ships[id])} free SR but was assigned ${load.length} Systemships`);
    }
    for (const cid of load) {
      if (!loose.includes(cid)) throw new RangeError(`${cid} is not a loose ${owner} Systemship in this hex`);
      if (taken.has(cid)) throw new RangeError(`${cid} is assigned more than once`);
      taken.add(cid);
    }
  }
  const mustCarry = Math.min(loose.length, capacity);
  if (taken.size !== mustCarry) {
    throw new RangeError(`${mustCarry} Systemships must be carried off (free SR capacity), but ${taken.size} were assigned`);
  }

  const next = {};
  for (const [id, s] of Object.entries(ships)) {
    if (s.owner === owner && !s.WG) continue;
    const load = pickups[id] ?? [];
    next[id] = load.length === 0 ? s : {
      ...s,
      carrying: { ...(s.carrying ?? {}), ...Object.fromEntries(load.map((cid) => [cid, withoutOwner(ships[cid])])) },
    };
  }
  return { ships: next, destroyed: loose.filter((cid) => !taken.has(cid)) };
}
