import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Builds the framework-free embed bundle for WordPress: a single IIFE script
// that registers the <cellular-automata-bg> custom element and a
// window.CellularAutomata.mount() API. No React is included in this build.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist-embed',
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/embed/main.ts'),
      name: 'CellularAutomata',
      formats: ['iife'],
      fileName: () => 'cellular-automata.js',
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
});
