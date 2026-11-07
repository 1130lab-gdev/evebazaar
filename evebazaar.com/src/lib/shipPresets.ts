export interface ShipPreset {
  label: string;
  /** Approximate fitted cargo capacity, m³. Users can't type a hold size
   * by hand for now, so picking a ship is the only way to set it. */
  cargoM3: number;
}

// Common EVE hauling ship classes; cargo figures are deliberately round.
export const SHIP_PRESETS: ShipPreset[] = [
  { label: 'Blockade Runner', cargoM3: 6_500 },
  { label: 'T1 Industrial', cargoM3: 8_000 },
  { label: 'Deep Space Transport', cargoM3: 62_000 },
  { label: 'Orca', cargoM3: 165_000 },
  { label: 'Jump Freighter', cargoM3: 360_000 },
  { label: 'Freighter', cargoM3: 1_100_000 },
];
