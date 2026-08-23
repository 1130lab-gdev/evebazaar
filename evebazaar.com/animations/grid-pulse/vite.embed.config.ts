import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Builds the framework-free embed bundle for WordPress: a single IIFE script
// that registers the <grid-pulse-bg> custom element and a
// window.GridPulse.mount() API. No React is included in this build.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist-embed',
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/embed/main.ts'),
      name: 'GridPulse',
      formats: ['iife'],
      fileName: () => 'grid-pulse.js',
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
});
