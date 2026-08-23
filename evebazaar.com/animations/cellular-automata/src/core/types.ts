export type Neighborhood = 'moore' | 'vonNeumann';

export interface ElementaryParams {
  kind: 'elementary';
  /** Wolfram rule number, 0-255 */
  rule: number;
  /** Randomize a new seed row when the buffer is exhausted (vs. repeating single live cell) */
  randomSeed?: boolean;
  /** Probability (0-1) a cell in a fresh random row starts alive */
  density?: number;
}

export interface CyclicParams {
  kind: 'cyclic';
  /** Number of distinct states a cell cycles through */
  states: number;
  /** Neighbor count of state (n+1)%states required to advance a cell */
  threshold: number;
  neighborhood: Neighborhood;
}

export interface LifeParams {
  kind: 'life';
  /** Probability (0-1) a cell starts alive */
  density: number;
  /** Whether the grid wraps at edges (toroidal) */
  wrap: boolean;
}

export type AutomatonParams = ElementaryParams | CyclicParams | LifeParams;

export interface AutomatonConfig {
  /** CSS pixel size of one automaton cell, rendered as a crisp square */
  cellSize: number;
  /** Milliseconds between generation steps */
  stepIntervalMs: number;
  /** Palette: index 0..states-1 map to CSS colors. Background is colors[0]. */
  colors: string[];
  params: AutomatonParams;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  config: AutomatonConfig;
}
