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
      // Only proxy API calls to crypto-news, not HTML navigation
      '^/crypto-news/(messages|sources|backfill|media)': {
        target: 'http://localhost:3030',
        changeOrigin: false,
      },
      '/socket.io': {
        target: 'http://localhost:3030',
        ws: true,
        changeOrigin: false,
      },
    },
  },

});
