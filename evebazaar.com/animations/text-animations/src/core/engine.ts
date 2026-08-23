import type {
  FadeAnimationConfig,
  GrowAnimationConfig,
  GrowOrigin,
  TextAnimationSettings,
  TextStyle,
  TypewriterAnimationConfig,
  TypewriterCursorConfig,
} from './types';
import { buildSplitDom } from './split';

function originToCss(origin: GrowOrigin): string {
  switch (origin) {
    case 'center':
      return 'center';
    case 'left':
      return 'left center';
    case 'right':
      return 'right center';
    case 'top':
      return 'center top';
    case 'bottom':
      return 'center bottom';
  }
}

function jitteredMs(base: number, amount: number): number {
  if (amount <= 0) return base;
  const factor = 1 + (Math.random() * 2 - 1) * amount;
  return Math.max(0, base * factor);
}

function cursorChar(cursor: TypewriterCursorConfig): string {
  if (cursor.char) return cursor.char;
  switch (cursor.style) {
    case 'bar':
      return '|';
    case 'block':
      return '█';
    case 'underscore':
      return '_';
  }
}

/**
 * Drives a single text-reveal animation (fade, grow, or typewriter) inside a
 * container element using real DOM text nodes -- not canvas -- so the
 * result stays crisp, selectable, and readable by screen readers.
 * Framework-agnostic: used by both the React component and the vanilla
 * embed custom element.
 */
export class TextAnimationEngine {
  private container: HTMLElement;
  private settings: TextAnimationSettings;
  private style: TextStyle;

  private units: HTMLElement[] = [];
  private typedSpan: HTMLElement | null = null;
  private cursorSpan: HTMLElement | null = null;
  private cursorAnimation: Animation | null = null;

  private observer: IntersectionObserver | null = null;
  private timers: number[] = [];
  private webAnimations: Animation[] = [];
  private running = false;
  private started = false;

  constructor(container: HTMLElement, settings: TextAnimationSettings, style: TextStyle) {
    this.container = container;
    this.settings = settings;
    this.style = style;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.applyContainerStyle();
    this.render();
    this.arm();
  }

  stop(): void {
    this.running = false;
    this.teardownTimeline();
    this.observer?.disconnect();
    this.observer = null;
  }

  /** Restarts the reveal timeline from scratch, re-arming the trigger. */
  replay(): void {
    if (!this.running) return;
    this.teardownTimeline();
    this.observer?.disconnect();
    this.observer = null;
    this.render();
    this.arm();
  }

  updateConfig(settings: TextAnimationSettings, style: TextStyle): void {
    this.settings = settings;
    this.style = style;
    if (!this.running) return;
    this.teardownTimeline();
    this.observer?.disconnect();
    this.observer = null;
    this.applyContainerStyle();
    this.render();
    this.arm();
  }

  private teardownTimeline(): void {
    this.timers.forEach((id) => window.clearTimeout(id));
    this.timers = [];
    this.webAnimations.forEach((a) => a.cancel());
    this.webAnimations = [];
    this.cursorAnimation?.cancel();
    this.cursorAnimation = null;
    this.started = false;
  }

  private applyContainerStyle(): void {
    const s = this.style;
    Object.assign(this.container.style, {
      fontFamily: s.fontFamily,
      fontSize: `${s.fontSize}px`,
      fontWeight: String(s.fontWeight),
      color: s.color,
      letterSpacing: `${s.letterSpacing}px`,
      lineHeight: String(s.lineHeight),
      textAlign: s.textAlign,
    });
  }

  private render(): void {
    this.container.textContent = '';
    this.container.setAttribute('aria-label', this.settings.text);
    this.units = [];
    this.typedSpan = null;
    this.cursorSpan = null;

    const animation = this.settings.animation;
    if (animation.kind === 'typewriter') {
      this.renderTypewriterDom(animation);
    } else {
      const { root, units } = buildSplitDom(this.settings.text, animation.splitBy);
      this.units = units;
      this.container.appendChild(root);
      this.applyInitialUnitState(animation);
    }
  }

  private renderTypewriterDom(config: TypewriterAnimationConfig): void {
    const wrap = document.createElement('span');
    wrap.setAttribute('aria-hidden', 'true');

    this.typedSpan = document.createElement('span');
    this.typedSpan.style.whiteSpace = 'pre-wrap';
    wrap.appendChild(this.typedSpan);

    if (config.cursor.enabled) {
      this.cursorSpan = document.createElement('span');
      this.cursorSpan.textContent = cursorChar(config.cursor);
      this.cursorSpan.style.color = config.cursor.color;
      this.cursorSpan.style.marginLeft = '0.05em';
      this.cursorSpan.style.display = 'inline-block';
      wrap.appendChild(this.cursorSpan);
    }

    this.container.appendChild(wrap);
  }

  private applyInitialUnitState(config: FadeAnimationConfig | GrowAnimationConfig): void {
    for (const unit of this.units) {
      if (config.kind === 'fade') {
        unit.style.opacity = String(config.startOpacity);
        unit.style.transform = `translate(${config.translateX}px, ${config.translateY}px)`;
      } else {
        unit.style.transformOrigin = originToCss(config.origin);
        unit.style.transform = `scale(${config.startScale})`;
        unit.style.filter = config.blurPx > 0 ? `blur(${config.blurPx}px)` : '';
        unit.style.opacity = config.fade ? '0' : '1';
      }
    }
  }

  private arm(): void {
    if (this.settings.trigger === 'mount') {
      this.beginTimeline();
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          this.observer?.disconnect();
          this.observer = null;
          this.beginTimeline();
        }
      },
      { threshold: 0.2 },
    );
    this.observer.observe(this.container);
  }

  private beginTimeline(): void {
    if (this.started) return;
    this.started = true;
    const animation = this.settings.animation;
    switch (animation.kind) {
      case 'fade':
      case 'grow':
        this.runReveal(animation);
        break;
      case 'typewriter':
        this.runTypewriter(animation);
        break;
    }
  }

  private scheduleLoop(delayMs: number, fn: () => void): void {
    const id = window.setTimeout(fn, Math.max(0, delayMs));
    this.timers.push(id);
  }

  private runReveal(config: FadeAnimationConfig | GrowAnimationConfig): void {
    this.units.forEach((unit, i) => {
      const from: Keyframe =
        config.kind === 'fade'
          ? { opacity: config.startOpacity, transform: `translate(${config.translateX}px, ${config.translateY}px)` }
          : {
              opacity: config.fade ? 0 : 1,
              transform: `scale(${config.startScale})`,
              filter: config.blurPx > 0 ? `blur(${config.blurPx}px)` : 'blur(0px)',
            };
      const to: Keyframe =
        config.kind === 'fade'
          ? { opacity: 1, transform: 'translate(0px, 0px)' }
          : { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' };

      const anim = unit.animate([from, to], {
        duration: config.durationMs,
        delay: i * config.staggerMs,
        easing: config.easing,
        fill: 'forwards',
      });
      this.webAnimations.push(anim);
    });

    if (this.settings.loop) {
      const lastIndex = this.units.length - 1;
      const totalMs = (lastIndex >= 0 ? lastIndex * config.staggerMs : 0) + config.durationMs;
      this.scheduleLoop(totalMs + this.settings.loopDelayMs, () => {
        this.webAnimations = [];
        this.applyInitialUnitState(config);
        this.runReveal(config);
      });
    }
  }

  private runTypewriter(config: TypewriterAnimationConfig): void {
    if (config.cursor.enabled && this.cursorSpan && config.cursor.blinkMs > 0) {
      this.cursorAnimation = this.cursorSpan.animate(
        [
          { opacity: 1, offset: 0 },
          { opacity: 1, offset: 0.5 },
          { opacity: 0, offset: 0.5 },
          { opacity: 0, offset: 1 },
        ],
        { duration: config.cursor.blinkMs, iterations: Infinity },
      );
    }

    const text = this.settings.text;
    const typeNext = (index: number) => {
      if (!this.typedSpan) return;
      this.typedSpan.textContent = text.slice(0, index);

      if (index >= text.length) {
        if (this.settings.loop) {
          this.scheduleLoop(this.settings.loopDelayMs, () => this.eraseTypewriter(config));
        } else if (config.cursor.enabled && config.cursor.hideOnComplete) {
          this.cursorAnimation?.cancel();
          this.cursorSpan?.style.setProperty('display', 'none');
        }
        return;
      }
      this.scheduleLoop(jitteredMs(config.charIntervalMs, config.charIntervalJitter), () => typeNext(index + 1));
    };

    this.scheduleLoop(config.startDelayMs, () => typeNext(0));
  }

  private eraseTypewriter(config: TypewriterAnimationConfig): void {
    const text = this.settings.text;
    const eraseNext = (index: number) => {
      if (!this.typedSpan) return;
      this.typedSpan.textContent = text.slice(0, index);
      if (index <= 0) {
        this.scheduleLoop(this.settings.loopDelayMs, () => this.runTypewriter(config));
        return;
      }
      this.scheduleLoop(config.eraseIntervalMs, () => eraseNext(index - 1));
    };
    eraseNext(text.length - 1);
  }
}
