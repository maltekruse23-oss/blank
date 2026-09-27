/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: { target: 'es2022' },
  // Tests (pnpm test): CSS is loaded for real, so tests can compare tokens.css with the design
  // system (without this, Vitest hands every CSS file over empty).
  test: { css: true },
});
