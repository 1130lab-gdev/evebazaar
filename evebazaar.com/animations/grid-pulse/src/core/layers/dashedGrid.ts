import type { DashedGridLayerConfig } from '../types';

/** Stateless: dash-scroll position is derived purely from elapsed time. */
export type DashedGridState = Record<string, never>;

export function createDashedGridState(): DashedGridState {
  return {};
}

export function renderDashedGrid(
  ctx: CanvasRenderingContext2D,
  _state: DashedGridState,
  config: DashedGridLayerConfig,
  cols: number,
  rows: number,
  cellSize: number,
  widthPx: number,
  heightPx: number,
  elapsedMs: number,
): void {
  const { axis, color, opacity, lineWidth, dash, scrollSpeed } = config;
  if (opacity <= 0) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = opacity;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash[1] <= 0 ? [] : dash);
  ctx.lineDashOffset = -(elapsedMs / 1000) * scrollSpeed;

  if (axis === 'vertical' || axis === 'both') {
    for (let c = 0; c <= cols; c++) {
      const x = c * cellSize;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, heightPx);
      ctx.stroke();
    }
  }

  if (axis === 'horizontal' || axis === 'both') {
    for (let r = 0; r <= rows; r++) {
      const y = r * cellSize;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(widthPx, y);
      ctx.stroke();
    }
  }

  ctx.restore();
}
