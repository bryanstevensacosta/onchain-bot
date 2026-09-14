import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  // loadEnv con prefijo '' para leer también vars sin VITE_ (solo config,
  // no se exponen al cliente). process.env NO ve los .env por sí solo.
  const env = loadEnv(mode, process.cwd(), '');
  // Proxy targets are env-overridable for alt-port dev setups
  // (defaults preserve the standard localhost layout).
  const BACKEND_PROXY_TARGET =
    env.BACKEND_PROXY_TARGET ?? 'http://localhost:3030';
  const INGESTION_PROXY_TARGET =
    env.INGESTION_PROXY_TARGET ?? 'http://localhost:3031';

  return {
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
          target: BACKEND_PROXY_TARGET,
          changeOrigin: false,
        },
        '/crypto-news-publisher': {
          target: BACKEND_PROXY_TARGET,
          changeOrigin: false,
        },
        '/crypto-news-ads': {
          target: BACKEND_PROXY_TARGET,
          changeOrigin: false,
        },
        // Matching activation (SOLE source: crypto_news_matching_config id=1)
        // GET/PATCH /crypto-news/matching/config on the backend
        // IMPORTANT: Use specific path to avoid intercepting frontend /crypto-news route
        '/crypto-news/matching': {
          target: BACKEND_PROXY_TARGET,
          changeOrigin: false,
        },
        // POST /crypto-news/sources now handled by ingestion-service (migrated 2026-09-05)
        // Old endpoint /crypto-news/sources deprecated (backend returns 501)
        '/ingestion-api': {
          target: INGESTION_PROXY_TARGET,
          changeOrigin: false,
          rewrite: (path) => path.replace(/^\/ingestion-api/, '/api'),
        },
        '/socket.io': {
          target: BACKEND_PROXY_TARGET,
          ws: true,
          changeOrigin: false,
        },
      },
    },
  };
});
