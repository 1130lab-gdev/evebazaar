import type { ElementaryParams } from '../types';

export function createElementaryState(cols: number, rows: number, params: ElementaryParams): Uint8Array {
  const state = new Uint8Array(cols * rows);
  const bottomRowStart = cols * (rows - 1);
  if (params.randomSeed) {
    const density = params.density ?? 0.35;
    for (let x = 0; x < cols; x++) {
      state[bottomRowStart + x] = Math.random() < density ? 1 : 0;
    }
  } else {
    state[bottomRowStart + Math.floor(cols / 2)] = 1;
  }
  return state;
}

/** Shifts all rows up one and computes a fresh bottom row from Wolfram `rule`. */
export function stepElementary(state: Uint8Array, cols: number, rows: number, params: ElementaryParams): void {
  if (rows < 2) return;

  state.copyWithin(0, cols, cols * rows);

  const prevRowStart = cols * (rows - 2);
  const nextRowStart = cols * (rows - 1);
  let anyAlive = false;

  for (let x = 0; x < cols; x++) {
    const left = state[prevRowStart + ((x - 1 + cols) % cols)];
    const center = state[prevRowStart + x];
    const right = state[prevRowStart + ((x + 1) % cols)];
    const neighborhoodIndex = (left << 2) | (center << 1) | right;
    const alive = (params.rule >> neighborhoodIndex) & 1;
    state[nextRowStart + x] = alive;
    anyAlive = anyAlive || alive === 1;
  }

  if (!anyAlive && params.randomSeed) {
    const density = params.density ?? 0.35;
    for (let x = 0; x < cols; x++) {
      state[nextRowStart + x] = Math.random() < density ? 1 : 0;
    }
  }
}
