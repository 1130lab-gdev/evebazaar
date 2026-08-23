import type { Preset } from './types';

const heading = {
  fontFamily: "'Segoe UI', system-ui, sans-serif",
  fontWeight: 700,
  letterSpacing: 0,
  lineHeight: 1.2,
  textAlign: 'center' as const,
};

const mono = {
  fontFamily: "ui-monospace, Consolas, 'SFMono-Regular', monospace",
  fontWeight: 500,
  letterSpacing: 0,
  lineHeight: 1.4,
  textAlign: 'left' as const,
};

export const presets: Preset[] = [
  {
    id: 'fade-up-words',
    name: 'Fade Up',
    description: 'Words fade in and drift up into place, staggered left to right.',
    settings: {
      text: 'Build faster with Hypolayer.',
      animation: {
        kind: 'fade',
        splitBy: 'words',
        durationMs: 600,
        staggerMs: 80,
        startOpacity: 0,
        translateY: 24,
        translateX: 0,
        easing: 'cubic-bezier(.2,.8,.2,1)',
      },
      trigger: 'inView',
      loop: false,
      loopDelayMs: 0,
    },
    style: { ...heading, fontSize: 44, color: '#e9edf1' },
  },
  {
    id: 'fade-in-chars',
    name: 'Soft Char Fade',
    description: 'Every character fades in gently with a quick, tight stagger -- no movement, just opacity.',
    settings: {
      text: 'Clarity, one letter at a time.',
      animation: {
        kind: 'fade',
        splitBy: 'chars',
        durationMs: 500,
        staggerMs: 18,
        startOpacity: 0,
        translateY: 0,
        translateX: 0,
        easing: 'ease-out',
      },
      trigger: 'inView',
      loop: false,
      loopDelayMs: 0,
    },
    style: { ...heading, fontSize: 36, color: '#c9a3ff' },
  },
  {
    id: 'line-reveal',
    name: 'Line by Line',
    description: 'A multi-line headline reveals one full line at a time.',
    settings: {
      text: 'Ship confidently.\nScale effortlessly.\nSleep well.',
      animation: {
        kind: 'fade',
        splitBy: 'lines',
        durationMs: 700,
        staggerMs: 220,
        startOpacity: 0,
        translateY: 16,
        translateX: 0,
        easing: 'ease-out',
      },
      trigger: 'inView',
      loop: false,
      loopDelayMs: 0,
    },
    style: { ...heading, fontSize: 40, color: '#7dffb0' },
  },
  {
    id: 'grow-in-words',
    name: 'Grow In',
    description: 'Words scale up from half-size with a blur that resolves into focus.',
    settings: {
      text: 'Motion with meaning.',
      animation: {
        kind: 'grow',
        splitBy: 'words',
        durationMs: 650,
        staggerMs: 90,
        startScale: 0.6,
        blurPx: 8,
        fade: true,
        origin: 'bottom',
        easing: 'cubic-bezier(.22,1,.36,1)',
      },
      trigger: 'inView',
      loop: false,
      loopDelayMs: 0,
    },
    style: { ...heading, fontSize: 44, color: '#00e5ff' },
  },
  {
    id: 'grow-bounce-chars',
    name: 'Pop In',
    description: 'Characters pop in one by one with a springy overshoot, like a bouncy title card.',
    settings: {
      text: 'Hypolayer!',
      animation: {
        kind: 'grow',
        splitBy: 'chars',
        durationMs: 500,
        staggerMs: 40,
        startScale: 0,
        blurPx: 0,
        fade: true,
        origin: 'center',
        easing: 'cubic-bezier(.68,-0.55,.27,1.55)',
      },
      trigger: 'inView',
      loop: false,
      loopDelayMs: 0,
    },
    style: { ...heading, fontSize: 52, color: '#e6d4ff' },
  },
  {
    id: 'terminal-typewriter',
    name: 'Terminal',
    description: 'Classic terminal-style typing with a blinking block cursor, looping forever.',
    settings: {
      text: '$ hypolayer deploy --prod',
      animation: {
        kind: 'typewriter',
        charIntervalMs: 55,
        charIntervalJitter: 0.35,
        startDelayMs: 400,
        eraseIntervalMs: 28,
        cursor: { enabled: true, style: 'block', color: '#39ffc9', blinkMs: 900, hideOnComplete: false },
      },
      trigger: 'inView',
      loop: true,
      loopDelayMs: 1400,
    },
    style: { ...mono, fontSize: 26, color: '#39ffc9' },
  },
  {
    id: 'typewriter-once',
    name: 'Type Once',
    description: 'A single typed line with a thin bar cursor that disappears once typing finishes.',
    settings: {
      text: 'Now loading the future...',
      animation: {
        kind: 'typewriter',
        charIntervalMs: 38,
        charIntervalJitter: 0.15,
        startDelayMs: 200,
        eraseIntervalMs: 20,
        cursor: { enabled: true, style: 'bar', color: '#00e5ff', blinkMs: 600, hideOnComplete: true },
      },
      trigger: 'inView',
      loop: false,
      loopDelayMs: 0,
    },
    style: { ...mono, fontSize: 26, color: '#00e5ff' },
  },
];

export function getPreset(id: string): Preset | undefined {
  return presets.find((p) => p.id === id);
}
