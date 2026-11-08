import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5198,
    host: true,
    proxy: {
      '/api': 'http://localhost:4398',
      '/health': 'http://localhost:4398',
      '/socket.io': { target: 'http://localhost:4398', ws: true },
    },
    fs: { allow: ['../..'] },
  },
  // Fonts ship as files: the CSP allows fonts from 'self' only, never data: URIs.
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 900, assetsInlineLimit: (file: string) => (/\.(woff2?|ttf)$/.test(file) ? false : undefined) },
});
