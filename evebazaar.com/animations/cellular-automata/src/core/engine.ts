import type { AutomatonConfig } from './types';
import { buildPalette } from './palette';
import { createElementaryState, stepElementary } from './automata/elementary';
import { createCyclicState, stepCyclic } from './automata/cyclic';
import { createLifeState, stepLife } from './automata/life';

/**
 * Runs a cellular automaton onto a <canvas>, rendering at low (grid) resolution
 * to an offscreen canvas and scaling it up crisply. Framework-agnostic: used by
 * both the React component and the vanilla embed custom element.
 */
export class CellularAutomatonEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offscreen: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;

  private config: AutomatonConfig;
  private palette: Uint8ClampedArray[] = [];

  private cols = 0;
  private rows = 0;
  private state: Uint8Array = new Uint8Array(0);
  private nextState: Uint8Array = new Uint8Array(0);

  private rafId: number | null = null;
  private lastStepTime = 0;
  private resizeObserver: ResizeObserver | null = null;
  private running = false;

  constructor(canvas: HTMLCanvasElement, config: AutomatonConfig) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    this.offscreen = document.createElement('canvas');
    const offCtx = this.offscreen.getContext('2d', { willReadFrequently: true });
    if (!offCtx) throw new Error('2D canvas context unavailable');
    this.offCtx = offCtx;

    this.config = config;
    this.palette = buildPalette(config.colors);
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.canvas.style.width = this.canvas.style.width || '100%';
    this.canvas.style.height = this.canvas.style.height || '100%';

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.canvas);
    this.handleResize();

    this.lastStepTime = 0;
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  updateConfig(config: AutomatonConfig): void {
    const paletteChanged = JSON.stringify(config.colors) !== JSON.stringify(this.config.colors);
    const gridAffectingChange =
      config.cellSize !== this.config.cellSize ||
      JSON.stringify(config.params) !== JSON.stringify(this.config.params);

    this.config = config;
    if (paletteChanged) this.palette = buildPalette(config.colors);
    if (gridAffectingChange) {
      this.resize(true);
    } else {
      this.render();
    }
  }

  private handleResize(): void {
    this.resize(false);
  }

  private resize(force: boolean): void {
    const cssWidth = Math.max(1, this.canvas.clientWidth);
    const cssHeight = Math.max(1, this.canvas.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    const backingWidth = Math.round(cssWidth * dpr);
    const backingHeight = Math.round(cssHeight * dpr);

    const cols = Math.max(1, Math.ceil(cssWidth / this.config.cellSize));
    const rows = Math.max(1, Math.ceil(cssHeight / this.config.cellSize));

    const sizeChanged = cols !== this.cols || rows !== this.rows;

    if (this.canvas.width !== backingWidth || this.canvas.height !== backingHeight) {
      this.canvas.width = backingWidth;
      this.canvas.height = backingHeight;
      this.ctx.imageSmoothingEnabled = false;
    }

    if (sizeChanged || force) {
      this.cols = cols;
      this.rows = rows;
      this.offscreen.width = cols;
      this.offscreen.height = rows;
      this.state = this.createState();
      this.nextState = new Uint8Array(cols * rows);
      this.render();
    }
  }

  private createState(): Uint8Array {
    const { params } = this.config;
    switch (params.kind) {
      case 'elementary':
        return createElementaryState(this.cols, this.rows, params);
      case 'cyclic':
        return createCyclicState(this.cols, this.rows, params);
      case 'life':
        return createLifeState(this.cols, this.rows, params);
    }
  }

  private step(): void {
    const { params } = this.config;
    switch (params.kind) {
      case 'elementary':
        stepElementary(this.state, this.cols, this.rows, params);
        break;
      case 'cyclic':
        stepCyclic(this.state, this.nextState, this.cols, this.rows, params);
        [this.state, this.nextState] = [this.nextState, this.state];
        break;
      case 'life':
        stepLife(this.state, this.nextState, this.cols, this.rows, params);
        [this.state, this.nextState] = [this.nextState, this.state];
        break;
    }
  }

  private render(): void {
    const imageData = this.offCtx.createImageData(this.cols, this.rows);
    const data = imageData.data;
    const palette = this.palette;
    const paletteLen = palette.length;

    for (let i = 0; i < this.state.length; i++) {
      const color = palette[this.state[i] % paletteLen];
      const o = i * 4;
      data[o] = color[0];
      data[o + 1] = color[1];
      data[o + 2] = color[2];
      data[o + 3] = color[3];
    }

    this.offCtx.putImageData(imageData, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.offscreen, 0, 0, this.canvas.width, this.canvas.height);
  }

  private loop = (timestamp: number): void => {
    if (!this.running) return;
    if (timestamp - this.lastStepTime >= this.config.stepIntervalMs) {
      this.lastStepTime = timestamp;
      this.step();
      this.render();
    }
    this.rafId = requestAnimationFrame(this.loop);
  };
}
