import type { LifeParams } from '../types';

const MOORE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

export function createLifeState(cols: number, rows: number, params: LifeParams): Uint8Array {
  const state = new Uint8Array(cols * rows);
  for (let i = 0; i < state.length; i++) {
    state[i] = Math.random() < params.density ? 1 : 0;
  }
  return state;
}

/** Writes the next generation into `out` (must be a different buffer than `state`). */
export function stepLife(state: Uint8Array, out: Uint8Array, cols: number, rows: number, params: LifeParams): void {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let count = 0;
      for (const [dx, dy] of MOORE_OFFSETS) {
        let nx = x + dx;
        let ny = y + dy;
        if (params.wrap) {
          nx = (nx + cols) % cols;
          ny = (ny + rows) % rows;
        } else if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) {
          continue;
        }
        count += state[ny * cols + nx];
      }
      const idx = y * cols + x;
      const alive = state[idx] === 1;
      out[idx] = alive ? (count === 2 || count === 3 ? 1 : 0) : (count === 3 ? 1 : 0);
    }
  }
}
