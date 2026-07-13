import { validateAppConfig, ConfigValidationError } from '../config-validator';
import type { AppConfig } from '../app.config';

function createMutableConfig(): Omit<AppConfig, 'llm'> & {
  llm: { gateway: { baseUrl: string; apiKey: string; model: string } };
} {
  return {
    port: 3000,
    nodeEnv: 'development',

    alchemy: { apiKey: 'alchemy-key' },
    birdeye: { apiKey: 'birdeye-key' },
    coinmarketcap: { apiKey: 'coinmarketcap-key' },
    fluxrpc: {
      apiKey: 'fluxrpc-key',
      rpcUrl: 'https://rpc.flux.dev',
      wsUrl: 'wss://ws.flux.dev',
    },
    helius: {
      apiKey: 'helius-key',
      mainnet: {
        rpcUrl: 'https://mainnet.helius.dev',
        parseTransaction: 'parse-tx',
        parseTransactionHistory: 'parse-tx-hist',
        wsUrl: 'wss://mainnet.helius.dev/ws',
      },
      devnet: {
        rpcUrl: 'https://devnet.helius.dev',
        parseTransaction: 'parse-tx',
        parseTransactionHistory: 'parse-tx-hist',
        wsUrl: 'wss://devnet.helius.dev/ws',
      },
    },
    mobula: { apiKey: 'mobula-key' },
    moralis: { apiKey: 'moralis-key' },
    pumpdev: {
      apiKey: 'pumpdev-key',
      walletPublic: 'wallet-public-key',
      walletPrivate: 'wallet-private-key',
    },

    telegram: {
      botToken: 'telegram-bot-token',
      mtprotoApiId: 12345678,
      mtprotoApiHash: 'mtproto-api-hash',
      mtprotoSession: 'mtproto-session-string',
    },

    ingestion: {
      telegram: {
        seed: {
          enabled: true,
          autoStartListening: true,
          channels: [{ kolId: '123', handle: 'test', title: 'Test' }],
        },
        newsSeed: {
          enabled: true,
          channels: [{ channelId: '456', handle: 'news', title: 'News' }],
        },
        metadataCache: { filePath: '/tmp/cache.json' },
        backfill: { enabled: false },
      },
    },

    publishing: {
      telegram: { useRealMtproto: false, outputChannel: '-1001234567890' },
      vipCalls: {
        botToken: 'vip-calls-bot-token',
        outputChannel: '-1001234567891',
      },
      cryptoNews: {
        botToken: 'crypto-news-bot-token',
        outputChannel: '-1001234567892',
      },
      chainDexterBot: { botToken: 'chain-dexter-bot-token' },
      reconciliation: { enabled: true },
    },

    chainDexterBot: {
      webhookSecret: 'webhook-secret',
      ingestMode: 'webhook',
      pollingIntervalMs: 1000,
      defaultTradeButtons: ['DEX', 'PHO', 'TRO'],
    },

    analytics: {
      evaluationHorizonsHours: [24, 168, 720],
      schedulerCron: '*/5 * * * *',
      schedulerEnabled: true,
      schedulerBatchSize: 50,
    },

    milestone: {
      activeWindowHours: 72,
      schedulerCron: '*/5 * * * *',
      schedulerEnabled: true,
      schedulerBatchSize: 30,
    },

    kolReputation: {
      schedulerCron: '*/15 * * * *',
      schedulerEnabled: true,
    },

    database: {
      enabled: false,
      host: 'localhost',
      port: 5432,
      username: 'testuser',
      password: 'testpass',
      database: 'testdb',
      synchronize: true,
      logging: false,
    },

    redis: {
      enabled: false,
      host: 'localhost',
      port: 6379,
      password: '',
      db: 0,
    },

    uploadsRoot: '/tmp/uploads',

    llm: {
      gateway: {
        baseUrl: 'http://localhost:4845',
        apiKey: 'llm-gateway-api-key',
        model: 'opencode-zen/deepseek-v4-flash',
      },
    },

    logging: {
      level: 'debug',
      dir: '/tmp',
      fileName: 'test.log',
      rotationSize: '10m',
      rotationLimit: 5,
      prettyInDev: true,
    },
  };
}

describe('validateAppConfig', () => {
  describe('Tier 1: Always Required', () => {
    it('should pass when all required vars are present with non-empty values', () => {
      const cfg = createMutableConfig();
      const result = validateAppConfig(cfg);
      expect(result.warnings).toEqual([]);
    });

    it('should throw ConfigValidationError when ALCHEMY_API_KEY is empty', () => {
      const base = createMutableConfig();
      const cfg = {
        ...base,
        alchemy: { apiKey: '' },
      } as unknown as AppConfig;

      expect(() => validateAppConfig(cfg)).toThrow(ConfigValidationError);
      try {
        validateAppConfig(cfg);
      } catch (e) {
        const error = e as ConfigValidationError;
        expect(error.details).toContainEqual(
          expect.objectContaining({ envVar: 'ALCHEMY_API_KEY' }),
        );
      }
    });

    it('should throw with ALL THREE errors when three required vars are missing', () => {
      const cfg = {
        ...createMutableConfig(),
        alchemy: { apiKey: '' },
        birdeye: { apiKey: '' },
        helius: { apiKey: '' },
      };

      let error: ConfigValidationError;
      try {
        validateAppConfig(cfg);
      } catch (e) {
        error = e as ConfigValidationError;
      }

      expect(error).toBeDefined();
      expect(error.details).toHaveLength(3);
      expect(error.details).toContainEqual(
        expect.objectContaining({ envVar: 'ALCHEMY_API_KEY' }),
      );
      expect(error.details).toContainEqual(
        expect.objectContaining({ envVar: 'BIRDEYE_API_KEY' }),
      );
      expect(error.details).toContainEqual(
        expect.objectContaining({ envVar: 'HELIUS_API_KEY' }),
      );
    });
  });

  describe('Tier 2: Required When Enabled', () => {
    it('should throw when DATABASE_ENABLED=true but POSTGRES_HOST is empty', () => {
      const base = createMutableConfig();
      const cfg = {
        ...base,
        database: { ...base.database, enabled: true, host: '' },
      };

      expect(() => validateAppConfig(cfg)).toThrow(ConfigValidationError);
      try {
        validateAppConfig(cfg);
      } catch (e) {
        const error = e as ConfigValidationError;
        expect(error.details).toContainEqual(
          expect.objectContaining({ envVar: 'POSTGRES_HOST' }),
        );
      }
    });

    it('should warn (not throw) when DATABASE_ENABLED=false and POSTGRES_HOST is empty', () => {
      const base = createMutableConfig();
      const cfg = {
        ...base,
        database: { ...base.database, enabled: false, host: '' },
      };

      const result = validateAppConfig(cfg);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('POSTGRES_HOST'),
      );
    });

    it('should throw when REDIS_ENABLED=true but REDIS_HOST is empty', () => {
      const base = createMutableConfig();
      const cfg = {
        ...base,
        redis: { ...base.redis, enabled: true, host: '' },
      };

      expect(() => validateAppConfig(cfg)).toThrow(ConfigValidationError);
      try {
        validateAppConfig(cfg);
      } catch (e) {
        const error = e as ConfigValidationError;
        expect(error.details).toContainEqual(
          expect.objectContaining({ envVar: 'REDIS_HOST' }),
        );
      }
    });

    it('should warn (not throw) when REDIS_ENABLED=false and REDIS_HOST is empty', () => {
      const base = createMutableConfig();
      const cfg = {
        ...base,
        redis: { ...base.redis, enabled: false, host: '' },
      };

      const result = validateAppConfig(cfg);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('REDIS_HOST'),
      );
    });
  });

  describe('Tier 3: Format Validation', () => {
    it('should throw format error when PORT is not an integer', () => {
      const cfg = createMutableConfig();
      const invalidCfg = {
        ...cfg,
        port: 3000.5,
      };

      expect(() => validateAppConfig(invalidCfg)).toThrow(
        ConfigValidationError,
      );
      try {
        validateAppConfig(invalidCfg);
      } catch (e) {
        const error = e as ConfigValidationError;
        expect(error.details).toContainEqual(
          expect.objectContaining({ envVar: 'PORT' }),
        );
      }
    });

    it('should throw format error when PORT is 0 (must be >= 1)', () => {
      const cfg = createMutableConfig();
      cfg.port = 0;

      expect(() => validateAppConfig(cfg)).toThrow(ConfigValidationError);
      try {
        validateAppConfig(cfg);
      } catch (e) {
        const error = e as ConfigValidationError;
        expect(error.details).toContainEqual(
          expect.objectContaining({ envVar: 'PORT' }),
        );
        expect(error.details[0].message).toContain('65535');
      }
    });

    it('should throw format error when PORT is 65536 (must be <= 65535)', () => {
      const cfg = createMutableConfig();
      cfg.port = 65536;

      expect(() => validateAppConfig(cfg)).toThrow(ConfigValidationError);
      try {
        validateAppConfig(cfg);
      } catch (e) {
        const error = e as ConfigValidationError;
        expect(error.details).toContainEqual(
          expect.objectContaining({ envVar: 'PORT' }),
        );
        expect(error.details[0].message).toContain('65535');
      }
    });

    it('should throw format error when NODE_ENV is "staging"', () => {
      const cfg = createMutableConfig();
      cfg.nodeEnv = 'staging' as 'development' | 'production' | 'test';

      expect(() => validateAppConfig(cfg)).toThrow(ConfigValidationError);
      try {
        validateAppConfig(cfg);
      } catch (e) {
        const error = e as ConfigValidationError;
        expect(error.details).toContainEqual(
          expect.objectContaining({ envVar: 'NODE_ENV' }),
        );
        expect(error.details[0].message).toContain(
          'development, production, test',
        );
      }
    });

    it('should throw format error when MTPROTO_API_ID is 0', () => {
      const cfg = createMutableConfig();
      cfg.telegram.mtprotoApiId = 0;

      expect(() => validateAppConfig(cfg)).toThrow(ConfigValidationError);
      try {
        validateAppConfig(cfg);
      } catch (e) {
        const error = e as ConfigValidationError;
        expect(error.details).toContainEqual(
          expect.objectContaining({
            envVar: 'INGESTION_TELEGRAM_MTPROTO_API_ID',
          }),
        );
        expect(error.details[0].message).toContain('positive');
      }
    });

    it('should throw format error when CHAIN_DEXTER_INGEST_MODE is invalid', () => {
      const cfg = createMutableConfig();
      cfg.chainDexterBot.ingestMode = 'invalid-mode' as 'webhook' | 'polling';

      expect(() => validateAppConfig(cfg)).toThrow(ConfigValidationError);
      try {
        validateAppConfig(cfg);
      } catch (e) {
        const error = e as ConfigValidationError;
        expect(error.details).toContainEqual(
          expect.objectContaining({ envVar: 'CHAIN_DEXTER_INGEST_MODE' }),
        );
      }
    });
  });

  describe('Tier 4: Optional (warn only)', () => {
    it('should not generate warnings for empty optional vars (seed channels, WS URLs)', () => {
      const cfg = createMutableConfig();
      const emptyCfg = {
        ...cfg,
        ingestion: {
          ...cfg.ingestion,
          telegram: {
            ...cfg.ingestion.telegram,
            seed: { ...cfg.ingestion.telegram.seed, channels: [] },
            newsSeed: { ...cfg.ingestion.telegram.newsSeed, channels: [] },
          },
        },
        fluxrpc: { ...cfg.fluxrpc, wsUrl: undefined },
        llm: {
          gateway: { ...cfg.llm.gateway, apiKey: '' },
        },
        logging: { ...cfg.logging, level: '' },
      };

      const result = validateAppConfig(emptyCfg);
      expect(result.warnings).toBeDefined();
    });

    it('should return empty warnings when all valid (complete valid config)', () => {
      const cfg = createMutableConfig();
      const result = validateAppConfig(cfg);
      expect(result.warnings).toHaveLength(0);
    });
  });
});

describe('ConfigValidationError', () => {
  it('should create error with all details', () => {
    const errors = [
      { envVar: 'TEST_VAR_1', message: 'error message 1' },
      { envVar: 'TEST_VAR_2', message: 'error message 2' },
    ];
    const error = new ConfigValidationError(errors);

    expect(error.name).toBe('ConfigValidationError');
    expect(error.details).toHaveLength(2);
    expect(error.message).toContain('TEST_VAR_1');
    expect(error.message).toContain('TEST_VAR_2');
  });

  it('should freeze details array', () => {
    const errors = [{ envVar: 'TEST', message: 'test error' }];
    const error = new ConfigValidationError(errors);

    expect(() => {
      (error.details as Array<{ envVar: string; message: string }>).push({
        envVar: 'NEW',
        message: 'new',
      });
    }).toThrow();
  });
});
