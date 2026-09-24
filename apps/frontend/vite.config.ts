import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  // loadEnv con prefijo '' para leer también vars sin VITE_ (solo config,
  // no se exponen al cliente). process.env NO ve los .env por sí solo.
  const env = loadEnv(mode, process.cwd(), '');
  // Proxy targets are env-overridable for alt-port dev setups
  // (defaults preserve the standard localhost layout).
  // INGESTION_PROXY_TARGET fronts onchain-bot-ingestion-telegram
  // (renamed from onchain-bot-ingestion; dev default stays localhost:3031).
  const BACKEND_PROXY_TARGET =
    env.BACKEND_PROXY_TARGET ?? 'http://localhost:3030';
  const INGESTION_PROXY_TARGET =
    env.INGESTION_PROXY_TARGET ?? 'http://localhost:3031';
  // Hosts permitidos (el acceso por Tailscale llega con otro Host header).
  const ALLOWED_HOSTS = (
    env.VITE_ALLOWED_HOSTS ??
    'localhost,127.0.0.1,cryptoganster.tailf01c61.ts.net'
  )
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);

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
      allowedHosts: ALLOWED_HOSTS,
      proxy: {
        '/api': {
          target: BACKEND_PROXY_TARGET,
          changeOrigin: false,
        },
        '/crypto-news-publisher': {
          target: BACKEND_PROXY_TARGET,
          changeOrigin: false,
        },
        // Ops backups status (GET /ops/backups/status on the backend).
        // IMPORTANT: Use specific path to avoid intercepting frontend /ops route
        '/ops/backups': {
          target: BACKEND_PROXY_TARGET,
          changeOrigin: false,
        },
        '/crypto-news-ads': {
          target: BACKEND_PROXY_TARGET,
          changeOrigin: false,
        },
        // Threads publisher (mirror of crypto-news-publisher precedent above).
        // IMPORTANT: Use specific paths to avoid intercepting frontend /threads route
        '/threads-publisher': {
          target: BACKEND_PROXY_TARGET,
          changeOrigin: false,
        },
        // Threads matching activation (SOLE source: threads_matching_configs id=1)
        // GET/PATCH /threads/matching/config + GET /threads/matching/health
        // IMPORTANT: Use specific path to avoid intercepting frontend /threads route
        '/threads/matching': {
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
        // POST /crypto-news/sources now handled by ingestion-telegram (migrated 2026-09-05, renamed 2026-09-17)
        // Old endpoint /crypto-news/sources deprecated (backend returns 501)
        // Content-filter CRUD stays on the backend (Opción A, filter on-read):
        // GET/POST /crypto-news/sources/:channelId/filters + PUT/DELETE/PATCH
        // /crypto-news/filters/:id. Specific prefixes only — never bare
        // /crypto-news (frontend route intact).
        '/crypto-news/sources': {
          target: BACKEND_PROXY_TARGET,
          changeOrigin: false,
        },
        '/crypto-news/filters': {
          target: BACKEND_PROXY_TARGET,
          changeOrigin: false,
        },
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
