// The Mayhem app's page (pnpm mayhem:web): only mayhem.html, into its own folder, so neither
// EXE carries the other's page.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    outDir: 'dist-mayhem',
    emptyOutDir: true,
    rollupOptions: { input: 'mayhem.html' },
  },
});
