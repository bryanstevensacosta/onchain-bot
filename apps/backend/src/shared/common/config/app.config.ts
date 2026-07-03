/**
 * Application configuration loaded from environment variables.
 *
 * The project ships with `.env` at the project root containing real API keys
 * for development. In production, env vars should be set by the platform.
 *
 * All env vars are read once at startup and exposed via ConfigService.
 *
 * Environment variables consumed here:
 *
 *   General:
 *     PORT (default 3000)
 *     NODE_ENV (default 'development')
 *
 *   Provider keys (all empty-string by default):
 *     ALCHEMY_API_KEY, BIRDEYE_API_KEY, COINMARKETCAP_API_KEY,
 *     FLUXRPC_API_KEY/FLUXRPC_RPC/FLUXRPC_WS,
 *     HELIUS_API_KEY + HELIUS_*_{MAINNET,DEVNET},
 *     MOBULA_API_KEY, MORALIS_API_KEY,
 *     PUMPDEV_API_KEY/WALLET_PUBLIC/WALLET_PRIVATE,
 *     TELEGRAM_BOT_TOKEN, INGESTION_TELEGRAM_MTPROTO_API_ID/HASH/SESSION
 *
 *   Pipeline behaviour:
 *     INGESTION_TELEGRAM_SEED_* (KOL seed)
 *     INGESTION_TELEGRAM_SEED_NEWS (news seed)
 *     INGESTION_TELEGRAM_METADATA_CACHE_FILE
 *     INGESTION_TELEGRAM_BACKFILL_ENABLED
 *     PUBLISHING_TELEGRAM_USE_REAL_MTPROTO/OUTPUT_CHANNEL,
 *     VIP_CALLS_BOT_TOKEN/OUTPUT_CHANNEL,
 *     CHAIN_DEXTER_BOT_TOKEN/WEBHOOK_SECRET/INGEST_MODE/POLLING_INTERVAL_MS/DEFAULT_TRADE_BUTTONS,
 *     PUBLISHING_RECONCILIATION_ENABLED
 *     ANALYTICS_EVALUATION_HORIZONS_HOURS,
 *     ANALYTICS_SCHEDULER_{CRON,ENABLED,BATCH_SIZE}
 *     MILESTONE_ACTIVE_WINDOW_HOURS,
 *     MILESTONE_SCHEDULER_{CRON,ENABLED,BATCH_SIZE}
 *     KOL_REPUTATION_SCHEDULER_{CRON,ENABLED}
 *
 *   Persistence:
 *     DATABASE_ENABLED, POSTGRES_{HOST,PORT,USER,PASSWORD,DB},
 *     DATABASE_SYNCHRONIZE, DATABASE_LOGGING
 *     REDIS_ENABLED, REDIS_{HOST,PORT,PASSWORD,DB}
 *
 *   Local media storage (crypto-news photos downloaded at ingestion):
 *     UPLOADS_ROOT — absolute or cwd-relative directory for downloaded
 *                    attachments (default `<cwd>/uploads`).
 *
 *   Logging (consumed by the `logging` config block; see src/app.module.ts
 *   where it is wired into nestjs-pino's LoggerModule.forRootAsync):
 *     LOG_LEVEL       — pino level (default 'info' in production, 'debug'
 *                       otherwise). Examples: 'trace','debug','info','warn',
 *                       'error','fatal','silent'.
 *     LOG_DIR         — directory for the rotating log file
 *                       (default 'apps/backend/logs'; resolved against
 *                       process.cwd() at app boot).
 *     LOG_FILE        — log file name (default
 *                       `backend-${NODE_ENV}.log`, e.g.
 *                       'backend-development.log' or 'backend-production.log').
 *     LOG_ROTATION_SIZE — pino-roll size threshold, e.g. '10m', '1g'
 *                       (default '10m'). Trigger a rotation when the file
 *                       reaches this size.
 *     LOG_ROTATION_LIMIT — max number of rotated files to keep
 *                       (default 5). Older rotations are pruned automatically.
 */
import { registerAs } from '@nestjs/config';
import { join } from 'path';

export interface HeliusNetworkConfig {
  rpcUrl: string;
  gatewayRpcUrl?: string;
  parseTransaction: string;
  parseTransactionHistory: string;
  wsUrl: string;
}

export interface SeedKolEntry {
  kolId: string;
  handle?: string;
  title?: string;
}

export interface SeedNewsChannelEntry {
  channelId: string;
  handle?: string;
  title?: string;
}

export interface AppConfig {
  // Milestone notification settings
  milestone: {
    activeWindowHours: number;
    schedulerCron: string;
    schedulerEnabled: boolean;
    schedulerBatchSize: number;
  };

  // KOL reputation aggregation settings
  kolReputation: {
    schedulerCron: string;
    schedulerEnabled: boolean;
  };

  port: number;
  nodeEnv: 'development' | 'production' | 'test';

  alchemy: { apiKey: string };
  birdeye: { apiKey: string };
  fluxrpc: { apiKey: string; rpcUrl: string; wsUrl?: string };

  helius: {
    apiKey: string;
    mainnet: HeliusNetworkConfig;
    devnet: HeliusNetworkConfig;
  };

  mobula: { apiKey: string };
  moralis: { apiKey: string };
  coinmarketcap: { apiKey: string };

  pumpdev: {
    apiKey: string;
    walletPublic: string;
    walletPrivate: string;
  };

  telegram: {
    botToken: string;
    mtprotoApiId: number;
    mtprotoApiHash: string;
    mtprotoSession: string;
  };

  ingestion: {
    telegram: {
      seed: {
        enabled: boolean;
        autoStartListening: boolean;
        channels: SeedKolEntry[];
      };
      newsSeed: {
        enabled: boolean;
        channels: SeedNewsChannelEntry[];
      };
      metadataCache: {
        filePath: string;
      };
      backfill: {
        enabled: boolean;
      };
    };
  };

  publishing: {
    telegram: {
      useRealMtproto: boolean;
      outputChannel: string;
    };
    vipCalls: {
      botToken: string;
      outputChannel: string;
    };
    chainDexterBot: {
      botToken: string;
    };
    reconciliation: {
      enabled: boolean;
    };
  };

  chainDexterBot: {
    webhookSecret: string;
    ingestMode: 'webhook' | 'polling';
    pollingIntervalMs: number;
    defaultTradeButtons: string[];
  };

  analytics: {
    evaluationHorizonsHours: ReadonlyArray<number>;
    schedulerCron: string;
    schedulerEnabled: boolean;
    schedulerBatchSize: number;
  };

  database: {
    enabled: boolean;
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    synchronize: boolean;
    logging: boolean;
  };

  redis: {
    enabled: boolean;
    host: string;
    port: number;
    password: string;
    db: number;
  };

  uploadsRoot: string;

  logging: {
    level: string;
    dir: string;
    fileName: string;
    rotationSize: string;
    rotationLimit: number;
    prettyInDev: boolean;
  };
}

/**
 * Parse a comma-separated list of positive integers.
 * Used for ANALYTICS_EVALUATION_HORIZONS_HOURS env var.
 */
function parseHorizonList(raw: string): ReadonlyArray<number> {
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const nums = parts
    .map((p) => parseInt(p, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return nums.length > 0 ? nums : [24, 168, 720];
}

/**
 * Parse INGESTION_TELEGRAM_SEED_KOLS env var (format: "kolId|handle|title,...").
 *
 * Accepts the legacy INGESTION_TELEGRAM_SEED_CHANNELS env var as a
 * fallback for one release.
 */
function parseSeedKols(raw: string | undefined): SeedKolEntry[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const parts = entry.split('|').map((p) => p.trim());
      const kolId = parts[0];
      if (!kolId) {
        throw new Error(
          `Invalid INGESTION_TELEGRAM_SEED_KOLS entry: "${entry}". Expected at least a kolId.`,
        );
      }
      const handle = parts[1] || undefined;
      const title = parts[2] || undefined;
      const out: SeedKolEntry = { kolId };
      if (handle) out.handle = handle;
      if (title) out.title = title;
      return out;
    });
}

/**
 * Parse INGESTION_TELEGRAM_SEED_NEWS env var (format: "channelId|handle|title,...").
 * Mirrors parseSeedKols but produces SeedNewsChannelEntry.
 */
function parseSeedNewsChannels(
  raw: string | undefined,
): SeedNewsChannelEntry[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const parts = entry.split('|').map((p) => p.trim());
      const channelId = parts[0];
      if (!channelId) {
        throw new Error(
          `Invalid INGESTION_TELEGRAM_SEED_NEWS entry: "${entry}". Expected at least a channelId.`,
        );
      }
      const handle = parts[1] || undefined;
      const title = parts[2] || undefined;
      const out: SeedNewsChannelEntry = { channelId };
      if (handle) out.handle = handle;
      if (title) out.title = title;
      return out;
    });
}

export const appConfig = registerAs(
  'app',
  (): AppConfig => ({
    port: parseInt(process.env.PORT ?? '3000', 10),
    nodeEnv: (process.env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'],

    alchemy: {
      apiKey: process.env.ALCHEMY_API_KEY ?? '',
    },
    birdeye: {
      apiKey: process.env.BIRDEYE_API_KEY ?? '',
    },
    fluxrpc: {
      apiKey: process.env.FLUXRPC_API_KEY ?? '',
      rpcUrl: process.env.FLUXRPC_RPC ?? '',
      wsUrl: process.env.FLUXRPC_WS,
    },

    helius: {
      apiKey: process.env.HELIUS_API_KEY ?? '',
      mainnet: {
        rpcUrl: process.env.HELIUS_RPC_URL_MAINNET ?? '',
        gatewayRpcUrl: process.env.HELIUS_GATEKEEPER_RPC_URL_MAINNET,
        parseTransaction:
          process.env.HELIUS_PARSE_SOLANA_TRANSACTION_MAINNET ?? '',
        parseTransactionHistory:
          process.env.HELIUS_PARSE_SOLANA_TRANSACTION_HISTORY_MAINNET ?? '',
        wsUrl: process.env.HELIUS_WS_MAINNET ?? '',
      },
      devnet: {
        rpcUrl: process.env.HELIUS_RPC_URL_DEVNET ?? '',
        parseTransaction:
          process.env.HELIUS_PARSE_SOLANA_TRANSACTION_DEVNET ?? '',
        parseTransactionHistory:
          process.env.HELIUS_PARSE_SOLANA_TRANSACTION_HISTORY_DEVNET ?? '',
        wsUrl: process.env.HELIUS_WS_DEVNET ?? '',
      },
    },

    mobula: {
      apiKey: process.env.MOBULA_API_KEY ?? '',
    },
    moralis: {
      apiKey: process.env.MORALIS_API_KEY ?? '',
    },
    coinmarketcap: {
      apiKey: process.env.COINMARKETCAP_API_KEY ?? '',
    },

    pumpdev: {
      apiKey: process.env.PUMPDEV_API_KEY ?? '',
      walletPublic: process.env.PUMPDEV_WALLET_PUBLIC ?? '',
      walletPrivate: process.env.PUMPDEV_WALLET_PRIVATE ?? '',
    },

    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
      mtprotoApiId: parseInt(
        process.env.INGESTION_TELEGRAM_MTPROTO_API_ID ?? '0',
        10,
      ),
      mtprotoApiHash: process.env.INGESTION_TELEGRAM_MTPROTO_API_HASH ?? '',
      mtprotoSession: process.env.INGESTION_TELEGRAM_MTPROTO_SESSION ?? '',
    },

    ingestion: {
      telegram: {
        seed: {
          enabled:
            (
              process.env.INGESTION_TELEGRAM_SEED_ENABLED ?? 'true'
            ).toLowerCase() === 'true',
          autoStartListening:
            (
              process.env.INGESTION_TELEGRAM_SEED_AUTO_START ?? 'true'
            ).toLowerCase() === 'true',
          channels: parseSeedKols(
            process.env.INGESTION_TELEGRAM_SEED_KOLS ??
              process.env.INGESTION_TELEGRAM_SEED_CHANNELS,
          ),
        },
        newsSeed: {
          enabled:
            (
              process.env.INGESTION_TELEGRAM_NEWS_SEED_ENABLED ?? 'true'
            ).toLowerCase() === 'true',
          channels: parseSeedNewsChannels(
            process.env.INGESTION_TELEGRAM_SEED_NEWS,
          ),
        },
        metadataCache: (() => {
          const rawCacheFile =
            process.env.INGESTION_TELEGRAM_METADATA_CACHE_FILE;
          const cacheFilePath =
            rawCacheFile && rawCacheFile.trim().length > 0
              ? rawCacheFile
              : `${process.cwd()}/.cache/kol-metadata.json`;
          return { filePath: cacheFilePath };
        })(),
        backfill: {
          enabled:
            (
              process.env.INGESTION_TELEGRAM_BACKFILL_ENABLED ?? 'true'
            ).toLowerCase() === 'true',
        },
      },
    },

    publishing: {
      telegram: {
        useRealMtproto:
          (
            process.env.PUBLISHING_TELEGRAM_USE_REAL_MTPROTO ?? 'false'
          ).toLowerCase() === 'true',
        outputChannel: process.env.PUBLISHING_TELEGRAM_OUTPUT_CHANNEL ?? '',
      },
      vipCalls: {
        botToken: process.env.VIP_CALLS_BOT_TOKEN ?? '',
        outputChannel: process.env.VIP_CALLS_OUTPUT_CHANNEL ?? '',
      },
      chainDexterBot: {
        botToken: process.env.CHAIN_DEXTER_BOT_TOKEN ?? '',
      },
      reconciliation: {
        enabled:
          (
            process.env.PUBLISHING_RECONCILIATION_ENABLED ?? 'true'
          ).toLowerCase() === 'true',
      },
    },

    chainDexterBot: {
      webhookSecret: process.env.CHAIN_DEXTER_WEBHOOK_SECRET ?? '',
      ingestMode: (process.env.CHAIN_DEXTER_INGEST_MODE ?? 'webhook') as
        | 'webhook'
        | 'polling',
      pollingIntervalMs: parseInt(
        process.env.CHAIN_DEXTER_POLLING_INTERVAL_MS ?? '1000',
        10,
      ),
      defaultTradeButtons: (
        process.env.CHAIN_DEXTER_DEFAULT_TRADE_BUTTONS ?? 'DEX,PHO,TRO'
      )
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    },

    analytics: {
      evaluationHorizonsHours: parseHorizonList(
        process.env.ANALYTICS_EVALUATION_HORIZONS_HOURS ?? '24,168,720',
      ),
      schedulerCron: process.env.ANALYTICS_SCHEDULER_CRON ?? '*/5 * * * *',
      schedulerEnabled:
        (process.env.ANALYTICS_SCHEDULER_ENABLED ?? 'true').toLowerCase() ===
        'true',
      schedulerBatchSize: parseInt(
        process.env.ANALYTICS_SCHEDULER_BATCH_SIZE ?? '50',
        10,
      ),
    },
    milestone: {
      activeWindowHours: parseInt(
        process.env.MILESTONE_ACTIVE_WINDOW_HOURS ?? '72',
        10,
      ),
      schedulerCron: process.env.MILESTONE_SCHEDULER_CRON ?? '*/5 * * * *',
      schedulerEnabled:
        (process.env.MILESTONE_SCHEDULER_ENABLED ?? 'true').toLowerCase() ===
        'true',
      schedulerBatchSize: parseInt(
        process.env.MILESTONE_SCHEDULER_BATCH_SIZE ?? '30',
        10,
      ),
    },
    kolReputation: {
      schedulerCron:
        process.env.KOL_REPUTATION_SCHEDULER_CRON ?? '*/15 * * * *',
      schedulerEnabled:
        (
          process.env.KOL_REPUTATION_SCHEDULER_ENABLED ?? 'true'
        ).toLowerCase() === 'true',
    },

    database: {
      enabled:
        (process.env.DATABASE_ENABLED ?? 'false').toLowerCase() === 'true',
      host: process.env.POSTGRES_HOST ?? 'localhost',
      port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
      username: process.env.POSTGRES_USER ?? 'alpha_meta_token_scanner',
      password: process.env.POSTGRES_PASSWORD ?? 'alpha_meta_token_scanner',
      database: process.env.POSTGRES_DB ?? 'alpha_meta_token_scanner',
      synchronize:
        (process.env.DATABASE_SYNCHRONIZE ?? 'true').toLowerCase() === 'true',
      logging:
        (process.env.DATABASE_LOGGING ?? 'false').toLowerCase() === 'true',
    },

    redis: {
      enabled: (process.env.REDIS_ENABLED ?? 'true').toLowerCase() === 'true',
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD ?? '',
      db: parseInt(process.env.REDIS_DB ?? '0', 10),
    },

    uploadsRoot: process.env.UPLOADS_ROOT ?? join(process.cwd(), 'uploads'),

    logging: {
      level:
        process.env.LOG_LEVEL ??
        (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
      dir: process.env.LOG_DIR ?? 'apps/backend/logs',
      fileName:
        process.env.LOG_FILE ??
        `backend-${process.env.NODE_ENV ?? 'development'}.log`,
      rotationSize: process.env.LOG_ROTATION_SIZE ?? '10m',
      rotationLimit: Number(process.env.LOG_ROTATION_LIMIT ?? 5),
      prettyInDev: process.env.NODE_ENV !== 'production',
    },
  }),
);
