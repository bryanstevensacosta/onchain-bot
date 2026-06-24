/**
 * Application configuration loaded from environment variables.
 *
 * The project ships with `.env` at the project root containing real API keys
 * for development. In production, env vars should be set by the platform.
 *
 * All env vars are read once at startup and exposed via ConfigService.
 */
import { registerAs } from '@nestjs/config';

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

export interface AppConfig {
  // Milestone notification settings
  milestone: {
    activeWindowHours: number;
    schedulerCron: string;
    schedulerEnabled: boolean;
    schedulerBatchSize: number;
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
        metadataCache: {
          filePath:
            process.env.INGESTION_TELEGRAM_METADATA_CACHE_FILE ??
            `${process.cwd()}/.cache/kol-metadata.json`,
        },
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
  }),
);
