import type { BlipsLayerConfig } from '../types';

interface Blip {
  col: number;
  row: number;
  phase: 'active' | 'idle';
  /** elapsedMs at which the current phase began. */
  phaseStartMs: number;
  activeDuration: number;
  idleDuration: number;
}

export interface BlipsState {
  blips: Blip[];
  cols: number;
  rows: number;
}

function jitteredDuration(base: number, jitter: number): number {
  const factor = 1 + (Math.random() * 2 - 1) * jitter;
  return Math.max(50, base * factor);
}

function randomCell(cols: number, rows: number): { col: number; row: number } {
  return { col: Math.floor(Math.random() * cols), row: Math.floor(Math.random() * rows) };
}

export function createBlipsState(cols: number, rows: number, config: BlipsLayerConfig): BlipsState {
  const blips: Blip[] = [];
  for (let i = 0; i < config.count; i++) {
    const activeDuration = jitteredDuration(config.lifetimeMs, config.lifetimeJitter);
    const idleDuration = jitteredDuration(config.gapMs, config.gapJitter);
    // Stagger initial phases so blips don't all pop in at once, weighted by how
    // much of a full cycle each phase occupies.
    const activeShare = activeDuration / (activeDuration + idleDuration);
    const phase: Blip['phase'] = Math.random() < activeShare ? 'active' : 'idle';
    const duration = phase === 'active' ? activeDuration : idleDuration;
    blips.push({
      ...randomCell(cols, rows),
      phase,
      phaseStartMs: -Math.random() * duration,
      activeDuration,
      idleDuration,
    });
  }
  return { blips, cols, rows };
}

/** Fast bloom in, brief hold at full strength, then fade out. t is progress through the active phase, 0-1. */
function envelope(t: number): number {
  if (t < 0.18) return t / 0.18;
  if (t < 0.55) return 1;
  return Math.max(0, 1 - (t - 0.55) / 0.45);
}

export function renderBlips(
  ctx: CanvasRenderingContext2D,
  state: BlipsState,
  config: BlipsLayerConfig,
  cellSize: number,
  elapsedMs: number,
): void {
  const { shape, color, size, fill, lineWidth, glow, maxOpacity } = config;
  if (maxOpacity <= 0) return;

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.shadowColor = color;

  for (const blip of state.blips) {
    let elapsedInPhase = elapsedMs - blip.phaseStartMs;

    if (blip.phase === 'active' && elapsedInPhase >= blip.activeDuration) {
      blip.phase = 'idle';
      blip.phaseStartMs = elapsedMs;
      blip.idleDuration = jitteredDuration(config.gapMs, config.gapJitter);
      elapsedInPhase = 0;
    } else if (blip.phase === 'idle' && elapsedInPhase >= blip.idleDuration) {
      const cell = randomCell(state.cols, state.rows);
      blip.col = cell.col;
      blip.row = cell.row;
      blip.phase = 'active';
      blip.phaseStartMs = elapsedMs;
      blip.activeDuration = jitteredDuration(config.lifetimeMs, config.lifetimeJitter);
      elapsedInPhase = 0;
    }

    if (blip.phase === 'idle') continue;

    const strength = envelope(elapsedInPhase / blip.activeDuration);
    if (strength <= 0) continue;

    const cx = blip.col * cellSize + cellSize / 2;
    const cy = blip.row * cellSize + cellSize / 2;
    const extent = size * strength;

    ctx.globalAlpha = maxOpacity * strength;
    ctx.shadowBlur = glow * strength;

    if (shape === 'circle') {
      ctx.beginPath();
      ctx.arc(cx, cy, extent / 2, 0, Math.PI * 2);
      if (fill) ctx.fill();
      else ctx.stroke();
    } else if (fill) {
      ctx.fillRect(cx - extent / 2, cy - extent / 2, extent, extent);
    } else {
      ctx.strokeRect(cx - extent / 2, cy - extent / 2, extent, extent);
    }
  }

  ctx.restore();
}
