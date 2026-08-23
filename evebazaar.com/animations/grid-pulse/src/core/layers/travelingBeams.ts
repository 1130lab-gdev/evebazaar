import type { Axis, TravelingBeamsLayerConfig } from '../types';

interface Beam {
  axis: 'horizontal' | 'vertical';
  /** Index of the grid line (row or column) the beam travels along. */
  line: number;
  /** Distance travelled along the line so far, in px; the bright segment trails behind this point. */
  progress: number;
  /** px length of the full line the beam travels (canvas width for horizontal, height for vertical). */
  trackLength: number;
}

export interface TravelingBeamsState {
  beams: Beam[];
  cols: number;
  rows: number;
  cellSize: number;
  widthPx: number;
  heightPx: number;
}

function pickAxis(spawnAxis: Axis): 'horizontal' | 'vertical' {
  if (spawnAxis === 'both') return Math.random() < 0.5 ? 'horizontal' : 'vertical';
  return spawnAxis;
}

function spawnBeam(
  state: Pick<TravelingBeamsState, 'cols' | 'rows' | 'widthPx' | 'heightPx'>,
  config: TravelingBeamsLayerConfig,
): Beam {
  const axis = pickAxis(config.spawnAxis);
  const line =
    axis === 'horizontal' ? Math.floor(Math.random() * (state.rows + 1)) : Math.floor(Math.random() * (state.cols + 1));
  const trackLength = axis === 'horizontal' ? state.widthPx : state.heightPx;
  return { axis, line, progress: -config.length, trackLength };
}

export function createTravelingBeamsState(
  cols: number,
  rows: number,
  cellSize: number,
  widthPx: number,
  heightPx: number,
  config: TravelingBeamsLayerConfig,
): TravelingBeamsState {
  const state: TravelingBeamsState = { beams: [], cols, rows, cellSize, widthPx, heightPx };
  for (let i = 0; i < config.count; i++) {
    const beam = spawnBeam(state, config);
    // Stagger the initial position so beams aren't all born at the same instant.
    beam.progress = Math.random() * beam.trackLength;
    state.beams.push(beam);
  }
  return state;
}

export function renderTravelingBeams(
  ctx: CanvasRenderingContext2D,
  state: TravelingBeamsState,
  config: TravelingBeamsLayerConfig,
  dtMs: number,
): void {
  const { color, length, thickness, glow, speed } = config;
  if (length <= 0 || state.beams.length === 0) return;
  const dt = dtMs / 1000;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = thickness;
  if (glow > 0) {
    ctx.shadowBlur = glow;
    ctx.shadowColor = color;
  }

  for (const beam of state.beams) {
    beam.progress += speed * dt;
    if (beam.progress - length > beam.trackLength) {
      const fresh = spawnBeam(state, config);
      beam.axis = fresh.axis;
      beam.line = fresh.line;
      beam.trackLength = fresh.trackLength;
      beam.progress = -length;
    }

    const start = Math.max(0, beam.progress - length);
    const end = Math.min(beam.trackLength, beam.progress);
    if (end <= start) continue;

    const fixed = beam.line * state.cellSize;
    const gradient =
      beam.axis === 'horizontal' ? ctx.createLinearGradient(start, 0, end, 0) : ctx.createLinearGradient(0, start, 0, end);
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(0.5, color);
    gradient.addColorStop(1, 'transparent');
    ctx.strokeStyle = gradient;

    ctx.beginPath();
    if (beam.axis === 'horizontal') {
      ctx.moveTo(start, fixed);
      ctx.lineTo(end, fixed);
    } else {
      ctx.moveTo(fixed, start);
      ctx.lineTo(fixed, end);
    }
    ctx.stroke();
  }

  ctx.restore();
}
