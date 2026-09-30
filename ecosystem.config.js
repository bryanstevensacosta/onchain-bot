// ecosystem.config.js — pm2 HOST orchestration for local dev.
//
// Branch: feat/mega-refactor-tramos. Companion: DEV-LOCAL.md (§ pm2 section)
//           + docker-compose.dev.yml (C-DB-01 per-app DB names/ports).
//
// What this is: run every NestJS app + vite natively on the HOST via pm2
// instead of Docker. DB/Redis targets below are the HOST-mapped C-DB-01
// endpoints from docker-compose.dev.yml (service names translated to
// localhost:<host-port>). Start the infra first, e.g.:
//   docker compose -f docker-compose.dev.yml up -d pg redis-backend \
//     redis-kol redis-feed redis-market \
//     redis-dexter redis-scheduling redis-aiml \
//     redis-threads
// (Single postgres `pg` on host :5432 holds one DB per app — consolidated
//  2026-09-28; kol-calls-publisher has its OWN DB since the split.
//  Ingestion shares the single postgres, DB ingestion_telegram_db —
//  create once: see DEV-LOCAL.md step 3.)
//
// SECRETS: ALL values below are DUMMIES. Never put real tokens/keys here.
//   - Backend provider keys (CoinGecko/Alchemy/Helius/...) are DUMMY/empty:
//     enrichment degrades to nulls, publishers fail 401 without posting.
//   - Ingestion MTProto triple is NOT set here (it lives ONLY in
//     apps/ingestion-telegram/.env): pm2 env would shadow the real triple
//     (real ENV wins over env files) and break kind auto-resolution.
//     Without a .env triple the listener idles fail-soft;
//     HTTP API + SSE still serve.
//   - ENCRYPTION_KEY values are the documented dev dummies from each app's
//     .env.development / docker-compose.dev.yml.
//
// Conventions per app:
//   - cwd = ./apps/<dir>, script = npm, args = run start:dev
//     (nest --watch; backend = tsc-watch + nodemon; frontend = vite).
//   - watch=false: Nest/vite watch themselves; pm2 must NOT double-watch.
//   - Nest ConfigModule reads ['.env.dev', '.env'] + REAL ENV WINS, so the
//     `env:` blocks below override any local env files. Per-app env files:
//       .env.development present: feed-publisher, kol-calls,
//         kol-calls-publisher, scheduling-posts, telegram-bots-gateway.
//       .env.dev present: backend only.
//       neither (env comes from compose/pm2): ingestion-telegram, market-data,
//         dexter-onchain-bot, threads-publisher, ai-ml, frontend.
//   - PORT var per app verified in src/main.ts (or vite --port for frontend).
//
// Usage: pm2 start ecosystem.config.js
//        pm2 start ecosystem.config.js --only backend   (single service)
//        pm2 logs <app> | pm2 monit | pm2 restart <app>
//        pm2 stop all && pm2 delete all                 (full cleanup)

const path = require('path');

// Absolute log dir: pm2 resolves relative out_file/error_file against each
// app's cwd (verified 2026-09-27: logs landed in apps/backend/.logs).
// __dirname keeps them in the repo-root .logs/ for all 12 apps.
const LOG_DIR = path.join(__dirname, '.logs');

const base = {
  script: 'npm',
  watch: false, // Nest/vite watch themselves — never double-watch via pm2
  autorestart: true,
  kill_timeout: 5000,
  max_memory_restart: '1G',
  error_file: `${LOG_DIR}/<APP>-error.log`,
  out_file: `${LOG_DIR}/<APP>.log`,
  merge_logs: true,
  time: true,
};

function app(name, dir, args, env, overrides = {}) {
  return {
    ...base,
    name,
    cwd: `apps/${dir}`,
    args,
    env: { NODE_ENV: 'development', ...env },
    error_file: `${LOG_DIR}/${name}-error.log`,
    out_file: `${LOG_DIR}/${name}.log`,
    ...overrides,
  };
}

// Local redis reality (2026-09-28): the ONLY dev redis running is
// onchain-bot-redis-dev on localhost:6379 (docker-compose.dev.yml per-app
// redis services :6382+ were never started). Every app below therefore
// targets redis://localhost:6379/<db> with a UNIQUE db index per app
// (backend + ingestion-telegram use HOST/PORT vars = implicit db 0):
//   db 0: backend (REDIS_HOST/PORT) + ingestion-telegram (INGESTION_REDIS_*)
//   db 1: kol-calls | db 2: kol-calls-publisher | db 3: feed-publisher
//   db 4: market-data | db 5: dexter | db 6: scheduling-posts
//   db 7: ai-ml | db 8: threads-publisher
// (kol-calls/publisher shared one redis :6382/0 before; split to db 1/2.)
// gateway has no REDIS usage (no REDIS_URL needed).
// To run the old per-app redises instead, start them via
// docker-compose.dev.yml and revert these URLs.

module.exports = {
  apps: [
    // backend :3030 — NestJS alpha-call pipeline (legacy monolith core).
    // DB-less boot: DATABASE_ENABLED=false (default) skips TypeORM; set the
    // POSTGRES_* block + DATABASE_ENABLED=true for a DB-backed boot
    // (DB backend_db must exist on the single pg first).
    app('backend', 'backend', 'run start:dev', {
      PORT: 3030,
      DATABASE_ENABLED: 'false',
      // DB-backed alternative (uncomment block + create DB first):
      // DATABASE_ENABLED: 'true',
      // POSTGRES_HOST: 'localhost',
      // POSTGRES_PORT: 5432,
      // POSTGRES_USER: 'onchain_bot',
      // POSTGRES_PASSWORD: 'onchain_bot',
      // POSTGRES_DB: 'backend_db',
      // DATABASE_SYNCHRONIZE: 'true',
      // DATABASE_LOGGING: 'false',
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
      USE_SSE_INGESTION: 'true',
      INGESTION_TELEGRAM_URL: 'http://localhost:3031',
      // Dummy provider keys (degrade to nulls — see header):
      COINMARKETCAP_API_KEY: 'dummy',
      COINGECKO_API_KEY: 'dummy',
      ALCHEMY_API_KEY: 'dummy',
      BIRDEYE_API_KEY: 'dummy',
      HELIUS_API_KEY: 'dummy',
    }),

    // ingestion-telegram :3031 — MTProto listener + SSE fan-out.
    // Shares backend postgres (DB ingestion_telegram_db, CREATE DATABASE once).
    // MTProto triple (API_ID/HASH/SESSION) comes ONLY from
    // apps/ingestion-telegram/.env (gitignored) — pm2 MUST NOT inject these
    // keys (real ENV wins over env files, so pm2 dummies would shadow the
    // real triple and break kind auto-resolution with
    // "Telegram MTProto not configured"). Without a .env triple the service
    // still boots fail-soft (listener idles, HTTP API + SSE stay live).
    app('ingestion-telegram', 'ingestion-telegram', 'run start:dev', {
      INGESTION_PORT: 3031,
      INGESTION_TELEGRAM_MTPROTO_LOG_LEVEL: 'error',
      DATABASE_ENABLED: 'true',
      INGESTION_DATABASE_HOST: 'localhost',
      INGESTION_DATABASE_PORT: 5432,
      INGESTION_DATABASE_NAME: 'ingestion_telegram_db',
      INGESTION_DATABASE_USER: 'onchain_bot',
      INGESTION_DATABASE_PASSWORD: 'onchain_bot',
      INGESTION_REDIS_HOST: 'localhost',
      INGESTION_REDIS_PORT: 6379,
    }),

    // kol-calls :3050 — KOL call intake/scoring service.
    app('kol-calls', 'kol-calls', 'run start:dev', {
      KOL_CALLS_ENABLED: 'true',
      KOL_CALLS_PORT: 3050,
      DATABASE_URL:
        'postgres://onchain_bot:onchain_bot@localhost:5432/kol_calls_db',
      REDIS_URL: 'redis://localhost:6379/1',
      DATABASE_SYNCHRONIZE: 'true',
      ENCRYPTION_KEY:
        'dev-dummy-encryption-key-00000000000000000000000000000000',
      INGESTION_TELEGRAM_URL: 'http://localhost:3031',
      USE_DATA_SERVICE_API: 'true',
      MARKET_DATA_URL: 'http://localhost:4000',
      BOTS_GATEWAY_URL: 'http://localhost:4070',
      KOL_PUBLISH_MODE: 'dual',
    }),

    // kol-calls-publisher :3060 — VIP publishing worker (OWN DB since split 2026-09-28).
    app('kol-calls-publisher', 'kol-calls-publisher', 'run start:dev', {
      KOL_CALLS_PUBLISHER_ENABLED: 'true',
      KOL_CALLS_PUBLISHER_PORT: 3060,
      DATABASE_URL:
        'postgres://onchain_bot:onchain_bot@localhost:5432/kol_calls_publisher_db',
      REDIS_URL: 'redis://localhost:6379/2',
      DATABASE_SYNCHRONIZE: 'true',
      ENCRYPTION_KEY:
        'dev-dummy-encryption-key-00000000000000000000000000000000',
      KOL_CALLS_URL: 'http://localhost:3050',
      MARKET_DATA_URL: 'http://localhost:4000',
      BOTS_GATEWAY_URL: 'http://localhost:4070',
      KOL_PUBLISH_MODE: 'dual',
    }),

    // feed-publisher :3040 — crypto-news pipeline (match → LLM → publish).
    // All three flags default OFF in dev: queue stays idle, no LLM cost.
    app('feed-publisher', 'feed-publisher', 'run start:dev', {
      FEED_PUBLISHER_PORT: 3040,
      DATABASE_URL:
        'postgres://onchain_bot:onchain_bot@localhost:5432/feed_publisher_db',
      REDIS_URL: 'redis://localhost:6379/3',
      DATABASE_SYNCHRONIZE: 'true',
      ENCRYPTION_KEY:
        'dev-dummy-encryption-key-00000000000000000000000000000000',
      MATCHING_ENABLED: 'false',
      LLM_ENABLED: 'false',
      PUBLISHING_ENABLED: 'false',
    }),

    // market-data :4000 — price/chain data service.
    app('market-data', 'market-data', 'run start:dev', {
      MARKET_DATA_PORT: 4000,
      DATABASE_URL:
        'postgres://onchain_bot:onchain_bot@localhost:5432/market_data_db',
      REDIS_URL: 'redis://localhost:6379/4',
      DATABASE_SYNCHRONIZE: 'true',
      ENCRYPTION_KEY:
        'dev-dummy-encryption-key-00000000000000000000000000000000',
    }),

    // dexter :4060 — dexter-onchain-bot sidecar (dev port; 4061 = staging).
    app('dexter', 'dexter-onchain-bot', 'run start:dev', {
      DEXTER_PORT: 4060,
      DATABASE_URL:
        'postgres://onchain_bot:onchain_bot@localhost:5432/dexter_db',
      REDIS_URL: 'redis://localhost:6379/5',
      DATABASE_SYNCHRONIZE: 'true',
      ENCRYPTION_KEY:
        'dev-dummy-encryption-key-00000000000000000000000000000000',
    }),

    // gateway :4070 — telegram-bots-gateway (single dev pg :5432, user onchain_bot).
    app('gateway', 'telegram-bots-gateway', 'run start:dev', {
      BOTS_GATEWAY_PORT: 4070,
      DATABASE_URL: 'postgres://onchain_bot:onchain_bot@localhost:5432/telegram_bots_db',
      DATABASE_SYNCHRONIZE: 'true',
      ENCRYPTION_KEY:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    }),

    // scheduling-posts :4080.
    app('scheduling-posts', 'scheduling-posts', 'run start:dev', {
      SCHEDULING_POSTS_ENABLED: 'true',
      SCHEDULING_POSTS_PORT: 4080,
      DATABASE_URL:
        'postgres://onchain_bot:onchain_bot@localhost:5432/scheduling_posts_db',
      REDIS_URL: 'redis://localhost:6379/6',
      DATABASE_SYNCHRONIZE: 'true',
      ENCRYPTION_KEY:
        'dev-dummy-encryption-key-00000000000000000000000000000000',
      BOTS_GATEWAY_URL: 'http://localhost:4070',
    }),

    // threads-publisher :4100 (dev port; 4101 = staging).
    app('threads-publisher', 'threads-publisher', 'run start:dev', {
      THREADS_PUBLISHER_PORT: 4100,
      DATABASE_URL:
        'postgres://onchain_bot:onchain_bot@localhost:5432/threads_publisher_db',
      REDIS_URL: 'redis://localhost:6379/8',
      DATABASE_SYNCHRONIZE: 'true',
      ENCRYPTION_KEY:
        'dev-dummy-encryption-key-00000000000000000000000000000000',
      BOTS_GATEWAY_URL: 'http://localhost:4070',
    }),

    // ai-ml :4090.
    app('ai-ml', 'ai-ml', 'run start:dev', {
      AI_ML_PORT: 4090,
      DATABASE_URL:
        'postgres://onchain_bot:onchain_bot@localhost:5432/ai_ml_db',
      REDIS_URL: 'redis://localhost:6379/7',
      DATABASE_SYNCHRONIZE: 'true',
      ENCRYPTION_KEY:
        'dev-dummy-encryption-key-00000000000000000000000000000000',
    }),

    // frontend :5173 — vite (no PORT env; port comes from CLI args).
    app('frontend', 'frontend', 'run dev -- --host 127.0.0.1 --port 5173', {
      BACKEND_PROXY_TARGET: 'http://localhost:3030',
      INGESTION_PROXY_TARGET: 'http://localhost:3031',
      KOL_SYSTEM_PROXY_TARGET: 'http://localhost:3050',
      FEED_PUBLISHER_PROXY_TARGET: 'http://localhost:3040',
      MARKET_DATA_PROXY_TARGET: 'http://localhost:4000',
    }, { max_memory_restart: '512M' }),
  ],
};
