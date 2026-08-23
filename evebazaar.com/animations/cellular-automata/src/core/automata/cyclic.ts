import type { CyclicParams } from '../types';

const MOORE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

const VON_NEUMANN_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], [-1, 0], [1, 0], [0, 1],
];

export function createCyclicState(cols: number, rows: number, params: CyclicParams): Uint8Array {
  const state = new Uint8Array(cols * rows);
  for (let i = 0; i < state.length; i++) {
    state[i] = Math.floor(Math.random() * params.states);
  }
  return state;
}

/** Writes the next generation into `out` (must be a different buffer than `state`). */
export function stepCyclic(state: Uint8Array, out: Uint8Array, cols: number, rows: number, params: CyclicParams): void {
  const { states, threshold, neighborhood } = params;
  const offsets = neighborhood === 'moore' ? MOORE_OFFSETS : VON_NEUMANN_OFFSETS;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const idx = y * cols + x;
      const current = state[idx];
      const next = (current + 1) % states;
      let count = 0;
      for (const [dx, dy] of offsets) {
        const nx = (x + dx + cols) % cols;
        const ny = (y + dy + rows) % rows;
        if (state[ny * cols + nx] === next) count++;
        if (count >= threshold) break;
      }
      out[idx] = count >= threshold ? next : current;
    }
  }
}
