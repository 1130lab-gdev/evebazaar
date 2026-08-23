import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The three animation packages under animations/* are separate, self-contained
// Vite apps (each with its own node_modules and its own copy of react/react-dom).
// We reuse their React source components directly rather than publishing/building
// them as libraries, so two things have to be forced here:
//
//  1. Bare imports of the animation packages' React entry points are aliased
//     straight to their src/react/index.ts, bypassing npm resolution entirely
//     (none of them declare a "main"/"exports" field to resolve through).
//  2. Every react / react-dom import -- ours and theirs -- is pinned to this
//     app's node_modules copy. Without this, Node's directory-walking module
//     resolution would let each animation package's source pull in its own
//     react copy, giving the page multiple React instances and breaking hooks.
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: /^react$/, replacement: path.resolve(__dirname, 'node_modules/react') },
      { find: /^react\/jsx-runtime$/, replacement: path.resolve(__dirname, 'node_modules/react/jsx-runtime') },
      { find: /^react\/jsx-dev-runtime$/, replacement: path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime') },
      { find: /^react-dom$/, replacement: path.resolve(__dirname, 'node_modules/react-dom') },
      { find: /^react-dom\/client$/, replacement: path.resolve(__dirname, 'node_modules/react-dom/client') },
      {
        find: '@eve-anim/text-animations',
        replacement: path.resolve(__dirname, 'animations/text-animations/src/react/index.ts'),
      },
      {
        find: '@eve-anim/cellular-automata',
        replacement: path.resolve(__dirname, 'animations/cellular-automata/src/react/index.ts'),
      },
      {
        find: '@eve-anim/grid-pulse',
        replacement: path.resolve(__dirname, 'animations/grid-pulse/src/react/index.ts'),
      },
    ],
  },
});
