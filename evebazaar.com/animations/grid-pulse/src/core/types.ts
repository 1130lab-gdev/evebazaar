export type Axis = 'horizontal' | 'vertical' | 'both';

export interface DashedGridLayerConfig {
  kind: 'dashedGrid';
  /** Which line directions to draw. */
  axis: Axis;
  color: string;
  /** 0-1 multiplier applied on top of the color's own alpha. */
  opacity: number;
  lineWidth: number;
  /** [dash, gap] in px. Use a large gap and dash === gap for a plain solid grid. */
  dash: [number, number];
  /** px/sec the dash pattern scrolls along each line. 0 disables scrolling. */
  scrollSpeed: number;
}

export interface PulseBoxesLayerConfig {
  kind: 'pulseBoxes';
  color: string;
  /** 0-1 fraction of grid cells that host a breathing box. */
  density: number;
  /** Box size as a fraction of cellSize at the smallest point of the breath (0-1). */
  minScale: number;
  /** Box size as a fraction of cellSize at the largest point of the breath (0-1). */
  maxScale: number;
  /** Average breath duration in ms; each box jitters around this. */
  periodMs: number;
  /** 0-1 randomization of period/phase per box, so they don't breathe in lockstep. */
  periodJitter: number;
  fill: boolean;
  lineWidth: number;
  /** Peak opacity reached mid-breath. */
  maxOpacity: number;
}

export interface TravelingBeamsLayerConfig {
  kind: 'travelingBeams';
  color: string;
  /** Number of concurrent beams in flight. */
  count: number;
  /** px/sec beams travel along their grid line. */
  speed: number;
  /** Length of the beam's bright segment, in px. */
  length: number;
  thickness: number;
  /** shadowBlur px for the glow; 0 disables. */
  glow: number;
  spawnAxis: Axis;
}

export type BlipShape = 'square' | 'circle';

export interface BlipsLayerConfig {
  kind: 'blips';
  shape: BlipShape;
  color: string;
  /** Number of concurrent blips. */
  count: number;
  /** Peak size in px (side length for squares, diameter for circles). */
  size: number;
  /** How long one appear-bloom-fade cycle lasts, in ms. */
  lifetimeMs: number;
  /** 0-1 randomization of lifetime per blip. */
  lifetimeJitter: number;
  /** Average idle time in ms between one blip fading out and the next appearing at a new cell. */
  gapMs: number;
  /** 0-1 randomization of the idle gap per blip. */
  gapJitter: number;
  /** shadowBlur px for the bloom; 0 disables. */
  glow: number;
  fill: boolean;
  lineWidth: number;
  /** Peak opacity reached mid-bloom. */
  maxOpacity: number;
}

export type GridLayerConfig = DashedGridLayerConfig | PulseBoxesLayerConfig | TravelingBeamsLayerConfig | BlipsLayerConfig;

export interface GridAnimationConfig {
  /** CSS pixel spacing between grid lines/cells. */
  cellSize: number;
  background: string;
  layers: GridLayerConfig[];
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  config: GridAnimationConfig;
}
