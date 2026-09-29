// Builds the browser extension into extension/dist (pnpm extension:build); separate from the app.
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const here = import.meta.dirname;

export default defineConfig({
  root: here,
  publicDir: resolve(here, 'public'),
  clearScreen: false,
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    // Readable code: the stores' reviewers and the user can see what it does.
    minify: false,
    modulePreload: false,
    rollupOptions: {
      input: {
        background: resolve(here, 'src/background.ts'),
        popup: resolve(here, 'popup.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
