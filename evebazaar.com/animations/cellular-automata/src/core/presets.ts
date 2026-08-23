import type { Preset } from './types';

export const presets: Preset[] = [
  {
    id: 'hypolayer-signal',
    name: 'Hypolayer Signal',
    description: 'Blue rule-90 data stream scrolling upward — the routing rail in motion.',
    config: {
      cellSize: 6,
      stepIntervalMs: 60,
      colors: ['#14161a', '#0059aa'],
      params: { kind: 'elementary', rule: 90, randomSeed: true, density: 0.22 },
    },
  },
  {
    id: 'hypolayer-network',
    name: 'Hypolayer Network',
    description: 'Slow multi-state cyclic automaton in the brand palette, like traffic on the mesh.',
    config: {
      cellSize: 8,
      stepIntervalMs: 110,
      colors: ['#14161a', '#0059aa', '#7c9cbf', '#69ae86', '#d9a441'],
      params: { kind: 'cyclic', states: 5, threshold: 3, neighborhood: 'moore' },
    },
  },
  {
    id: 'futuristic-horizontal-lines',
    name: 'Futuristic Horizontal Lines',
    description: 'Neon rule-90 data stream scrolling upward, like a HUD signal feed.',
    config: {
      cellSize: 6,
      stepIntervalMs: 60,
      colors: ['#050914', '#00e5ff'],
      params: { kind: 'elementary', rule: 90, randomSeed: true, density: 0.25 },
    },
  },
  {
    id: 'matrix-rain',
    name: 'Matrix Rain',
    description: 'Chaotic rule-30 cascade in classic green-on-black.',
    config: {
      cellSize: 5,
      stepIntervalMs: 70,
      colors: ['#000000', '#00ff41'],
      params: { kind: 'elementary', rule: 30, randomSeed: true, density: 0.3 },
    },
  },
  {
    id: 'cyclic-black-and-white',
    name: 'Cyclic Black & White',
    description: 'Two-state cyclic automaton carving out organic flipping regions.',
    config: {
      cellSize: 8,
      stepIntervalMs: 90,
      colors: ['#000000', '#ffffff'],
      params: { kind: 'cyclic', states: 2, threshold: 3, neighborhood: 'moore' },
    },
  },
  {
    id: 'cyclic-spiral-rainbow',
    name: 'Cyclic Spiral Rainbow',
    description: 'Classic multi-state cyclic cellular automaton forming rotating spiral colonies.',
    config: {
      cellSize: 6,
      stepIntervalMs: 45,
      colors: ['#1a0033', '#ff0066', '#ff9900', '#ffee00', '#33ff66', '#00ccff', '#6600ff'],
      params: { kind: 'cyclic', states: 7, threshold: 3, neighborhood: 'moore' },
    },
  },
  {
    id: 'conway-classic',
    name: "Conway's Classic",
    description: "Game of Life in phosphor green, wrapping at the edges.",
    config: {
      cellSize: 7,
      stepIntervalMs: 120,
      colors: ['#001a00', '#39ff14'],
      params: { kind: 'life', density: 0.22, wrap: true },
    },
  },
];

export function getPreset(id: string): Preset | undefined {
  return presets.find((p) => p.id === id);
}
