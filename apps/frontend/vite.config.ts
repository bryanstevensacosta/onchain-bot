import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3030',
        changeOrigin: false,
      },
      '/crypto-news-publisher': {
        target: 'http://localhost:3030',
        changeOrigin: false,
      },
      '/crypto-news-ads': {
        target: 'http://localhost:3030',
        changeOrigin: false,
      },
      // Matching activation (SOLE source: crypto_news_matching_config id=1)
      // GET/PATCH /crypto-news/matching/config on the backend
      // IMPORTANT: Use specific path to avoid intercepting frontend /crypto-news route
      '/crypto-news/matching': {
        target: 'http://localhost:3030',
        changeOrigin: false,
      },
      // POST /crypto-news/sources now handled by ingestion-service (migrated 2026-09-05)
      // Old endpoint /crypto-news/sources deprecated (backend returns 501)
      '/ingestion-api': {
        target: 'http://localhost:3031',
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/ingestion-api/, '/api'),
      },
      '/socket.io': {
        target: 'http://localhost:3030',
        ws: true,
        changeOrigin: false,
      },
    },
  },

});
