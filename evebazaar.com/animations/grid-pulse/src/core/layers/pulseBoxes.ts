import type { PulseBoxesLayerConfig } from '../types';

interface PulseBox {
  col: number;
  row: number;
  /** Full breath duration in ms, jittered per-box so they don't move in lockstep. */
  period: number;
  phaseOffsetMs: number;
}

export interface PulseBoxesState {
  boxes: PulseBox[];
}

export function createPulseBoxesState(
  cols: number,
  rows: number,
  config: PulseBoxesLayerConfig,
): PulseBoxesState {
  const boxes: PulseBox[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (Math.random() >= config.density) continue;
      const jitter = 1 + (Math.random() * 2 - 1) * config.periodJitter;
      boxes.push({
        col,
        row,
        period: Math.max(200, config.periodMs * jitter),
        phaseOffsetMs: Math.random() * config.periodMs,
      });
    }
  }
  return { boxes };
}

/** Smooth 0 -> 1 -> 0 breathing curve over one period. */
function breathAt(elapsedMs: number, box: PulseBox): number {
  const t = ((elapsedMs + box.phaseOffsetMs) % box.period) / box.period;
  return (1 - Math.cos(t * Math.PI * 2)) / 2;
}

export function renderPulseBoxes(
  ctx: CanvasRenderingContext2D,
  state: PulseBoxesState,
  config: PulseBoxesLayerConfig,
  cellSize: number,
  elapsedMs: number,
): void {
  const { color, minScale, maxScale, fill, lineWidth, maxOpacity } = config;
  if (maxOpacity <= 0) return;

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  for (const box of state.boxes) {
    const breath = breathAt(elapsedMs, box);
    const size = cellSize * (minScale + (maxScale - minScale) * breath);
    const cx = box.col * cellSize + cellSize / 2;
    const cy = box.row * cellSize + cellSize / 2;

    ctx.globalAlpha = maxOpacity * breath;
    if (fill) {
      ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    } else {
      ctx.strokeRect(cx - size / 2, cy - size / 2, size, size);
    }
  }

  ctx.restore();
}
