export interface Faction {
  id: string;
  name: string;
  color: string;
}

// Chosen to sit clearly apart (in hue) from the security-status ramp
// (cyan/green/amber/red -- see securityColor.ts), since both a region's
// faction fill and its systems' security dots are visible at once.
export const FACTIONS: Record<string, Faction> = {
  amarr: { id: 'amarr', name: 'Amarr Empire', color: '#c9a227' },
  caldari: { id: 'caldari', name: 'Caldari State', color: '#3d7fbf' },
  gallente: { id: 'gallente', name: 'Gallente Federation', color: '#4caf7d' },
  minmatar: { id: 'minmatar', name: 'Minmatar Republic', color: '#b0492e' },
};

// map-api has no faction/ownership data at all -- verified against the
// `eve` database and map-api's source: no faction_id column or factions
// table exists, and it's not something ESI's live API exposes either
// (region ownership is static SDE/lore data, not live game state). This
// is a hand-maintained mapping of the four NPC empires' home regions,
// cross-referenced against EVE University Wiki / EVE Online Wiki and spot
// -checked against live data (e.g. Dodixie -> Sinq Laison, Amarr ->
// Domain, Rens -> Heimatar, Jita -> The Forge). Regions not listed here
// (low-sec/null-sec, contested faction-warfare warzones, wormhole space)
// simply get no fill.
export const REGION_FACTION: Record<string, string> = {
  Aridia: 'amarr',
  Devoid: 'amarr',
  Domain: 'amarr',
  Genesis: 'amarr',
  Kador: 'amarr',
  'Kor-Azor': 'amarr',
  'Tash-Murkon': 'amarr',
  'The Bleak Lands': 'amarr',

  Lonetrek: 'caldari',
  'The Citadel': 'caldari',
  'The Forge': 'caldari',

  'Verge Vendor': 'gallente',
  'Sinq Laison': 'gallente',
  Essence: 'gallente',
  Placid: 'gallente',
  Solitude: 'gallente',
  Everyshore: 'gallente',

  Metropolis: 'minmatar',
  Heimatar: 'minmatar',
  'Molden Heath': 'minmatar',
};

export function factionForRegion(regionName: string): Faction | undefined {
  const id = REGION_FACTION[regionName];
  return id ? FACTIONS[id] : undefined;
}
