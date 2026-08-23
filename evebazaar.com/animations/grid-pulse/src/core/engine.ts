import type { GridAnimationConfig, GridLayerConfig } from './types';
import { createDashedGridState, renderDashedGrid, type DashedGridState } from './layers/dashedGrid';
import { createPulseBoxesState, renderPulseBoxes, type PulseBoxesState } from './layers/pulseBoxes';
import { createTravelingBeamsState, renderTravelingBeams, type TravelingBeamsState } from './layers/travelingBeams';
import { createBlipsState, renderBlips, type BlipsState } from './layers/blips';

type LayerState = DashedGridState | PulseBoxesState | TravelingBeamsState | BlipsState;

interface LayerEntry {
  config: GridLayerConfig;
  state: LayerState;
}

/**
 * A key that changes whenever a layer's config changes in a way that affects the
 * *shape* of its internal state (element counts, positions) rather than just its
 * appearance (color, speed, opacity). Only shape changes require rebuilding state.
 */
function structuralKey(config: GridLayerConfig): string {
  switch (config.kind) {
    case 'dashedGrid':
      return 'dashedGrid';
    case 'pulseBoxes':
      return `pulseBoxes:${config.density}`;
    case 'travelingBeams':
      return `travelingBeams:${config.count}:${config.spawnAxis}`;
    case 'blips':
      return `blips:${config.count}`;
  }
}

/**
 * Renders a grid of animated effects (scrolling dashed lines, breathing boxes,
 * traveling beams) directly onto a <canvas> with the 2D API, scaled for the
 * device pixel ratio. Framework-agnostic: used by both the React component and
 * the vanilla embed custom element.
 */
export class GridAnimationEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private config: GridAnimationConfig;
  private layers: LayerEntry[] = [];

  private cols = 0;
  private rows = 0;
  private widthPx = 0;
  private heightPx = 0;

  private rafId: number | null = null;
  private startTimestamp = 0;
  private lastTimestamp = 0;
  private lastElapsedMs = 0;
  private resizeObserver: ResizeObserver | null = null;
  private running = false;

  constructor(canvas: HTMLCanvasElement, config: GridAnimationConfig) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.config = config;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.canvas.style.width = this.canvas.style.width || '100%';
    this.canvas.style.height = this.canvas.style.height || '100%';

    this.resizeObserver = new ResizeObserver(() => this.resize(false));
    this.resizeObserver.observe(this.canvas);
    this.resize(true);

    this.startTimestamp = 0;
    this.lastTimestamp = 0;
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  updateConfig(config: GridAnimationConfig): void {
    const cellSizeChanged = config.cellSize !== this.config.cellSize;
    const prevKeys = this.config.layers.map(structuralKey);
    const nextKeys = config.layers.map(structuralKey);
    const structureChanged = prevKeys.length !== nextKeys.length || prevKeys.some((k, i) => k !== nextKeys[i]);

    this.config = config;

    if (cellSizeChanged) {
      this.resize(true);
      return;
    }

    if (structureChanged) {
      this.rebuildLayers();
    } else {
      this.layers.forEach((layer, i) => {
        layer.config = config.layers[i];
      });
    }

    this.render(this.lastElapsedMs, 0);
  }

  private resize(force: boolean): void {
    const cssWidth = Math.max(1, this.canvas.clientWidth);
    const cssHeight = Math.max(1, this.canvas.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    const backingWidth = Math.round(cssWidth * dpr);
    const backingHeight = Math.round(cssHeight * dpr);

    const cols = Math.max(1, Math.ceil(cssWidth / this.config.cellSize));
    const rows = Math.max(1, Math.ceil(cssHeight / this.config.cellSize));
    const sizeChanged = cols !== this.cols || rows !== this.rows || cssWidth !== this.widthPx || cssHeight !== this.heightPx;

    if (this.canvas.width !== backingWidth || this.canvas.height !== backingHeight) {
      this.canvas.width = backingWidth;
      this.canvas.height = backingHeight;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (sizeChanged || force) {
      this.cols = cols;
      this.rows = rows;
      this.widthPx = cssWidth;
      this.heightPx = cssHeight;
      this.rebuildLayers();
      this.render(this.lastElapsedMs, 0);
    }
  }

  private rebuildLayers(): void {
    this.layers = this.config.layers.map((layerConfig) => ({
      config: layerConfig,
      state: this.createLayerState(layerConfig),
    }));
  }

  private createLayerState(config: GridLayerConfig): LayerState {
    switch (config.kind) {
      case 'dashedGrid':
        return createDashedGridState();
      case 'pulseBoxes':
        return createPulseBoxesState(this.cols, this.rows, config);
      case 'travelingBeams':
        return createTravelingBeamsState(this.cols, this.rows, this.config.cellSize, this.widthPx, this.heightPx, config);
      case 'blips':
        return createBlipsState(this.cols, this.rows, config);
    }
  }

  private render(elapsedMs: number, dtMs: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.widthPx, this.heightPx);
    if (this.config.background && this.config.background !== 'transparent') {
      ctx.fillStyle = this.config.background;
      ctx.fillRect(0, 0, this.widthPx, this.heightPx);
    }

    for (const layer of this.layers) {
      switch (layer.config.kind) {
        case 'dashedGrid':
          renderDashedGrid(
            ctx,
            layer.state as DashedGridState,
            layer.config,
            this.cols,
            this.rows,
            this.config.cellSize,
            this.widthPx,
            this.heightPx,
            elapsedMs,
          );
          break;
        case 'pulseBoxes':
          renderPulseBoxes(ctx, layer.state as PulseBoxesState, layer.config, this.config.cellSize, elapsedMs);
          break;
        case 'travelingBeams':
          renderTravelingBeams(ctx, layer.state as TravelingBeamsState, layer.config, dtMs);
          break;
        case 'blips':
          renderBlips(ctx, layer.state as BlipsState, layer.config, this.config.cellSize, elapsedMs);
          break;
      }
    }
    ctx.restore();
  }

  private loop = (timestamp: number): void => {
    if (!this.running) return;
    if (this.startTimestamp === 0) this.startTimestamp = timestamp;
    const dtMs = this.lastTimestamp === 0 ? 16 : Math.min(100, timestamp - this.lastTimestamp);
    this.lastTimestamp = timestamp;
    this.lastElapsedMs = timestamp - this.startTimestamp;

    this.render(this.lastElapsedMs, dtMs);
    this.rafId = requestAnimationFrame(this.loop);
  };
}
