import type { AppConfig } from './app.config';

/**
 * Custom error class for configuration validation failures.
 * Collects all validation errors before throwing.
 */
export class ConfigValidationError extends Error {
  public readonly details: ReadonlyArray<{ envVar: string; message: string }>;

  constructor(errors: Array<{ envVar: string; message: string }>) {
    const message =
      `Config validation failed with ${errors.length} error(s): ` +
      errors.map((e) => `${e.envVar}: ${e.message}`).join('; ');
    super(message);
    this.name = 'ConfigValidationError';
    this.details = Object.freeze([...errors]);
    Error.captureStackTrace(this, ConfigValidationError);
  }
}

/**
 * Category of validation to apply to a config variable.
 */
type ValidationCategory = 'required' | 'required-if' | 'optional' | 'format';

/**
 * Definition of a config variable to validate.
 */
interface ConfigVarDef {
  envVar: string;
  configPath: string;
  category: ValidationCategory;
  condition?: () => boolean;
  format?: (value: unknown) => string | null;
  description: string;
}

/**
 * Validation manifest - defines all config variables to validate.
 */
const CONFIG_MANIFEST: ConfigVarDef[] = [
  // ========== Tier 1: Always Required ==========
  {
    envVar: 'ALCHEMY_API_KEY',
    configPath: 'alchemy.apiKey',
    category: 'required',
    description: 'Alchemy RPC API key',
  },
  {
    envVar: 'BIRDEYE_API_KEY',
    configPath: 'birdeye.apiKey',
    category: 'required',
    description: 'Birdeye API key',
  },
  {
    envVar: 'COINMARKETCAP_API_KEY',
    configPath: 'coinmarketcap.apiKey',
    category: 'required',
    description: 'CoinMarketCap API key',
  },
  {
    envVar: 'FLUXRPC_API_KEY',
    configPath: 'fluxrpc.apiKey',
    category: 'required',
    description: 'FluxRPC API key',
  },
  {
    envVar: 'HELIUS_API_KEY',
    configPath: 'helius.apiKey',
    category: 'required',
    description: 'Helius RPC API key',
  },
  {
    envVar: 'MOBULA_API_KEY',
    configPath: 'mobula.apiKey',
    category: 'required',
    description: 'Mobula API key',
  },
  {
    envVar: 'MORALIS_API_KEY',
    configPath: 'moralis.apiKey',
    category: 'required',
    description: 'Moralis API key',
  },
  {
    envVar: 'PUMPDEV_API_KEY',
    configPath: 'pumpdev.apiKey',
    category: 'required',
    description: 'PumpFun/Dev API key',
  },
  {
    envVar: 'PUMPDEV_WALLET_PUBLIC',
    configPath: 'pumpdev.walletPublic',
    category: 'required',
    description: 'PumpFun public wallet address',
  },
  {
    envVar: 'PUMPDEV_WALLET_PRIVATE',
    configPath: 'pumpdev.walletPrivate',
    category: 'required',
    description: 'PumpFun private wallet key',
  },
  {
    envVar: 'VIP_CALLS_BOT_TOKEN',
    configPath: 'publishing.vipCalls.botToken',
    category: 'required',
    description: 'Bot token for VIP calls channel',
  },
  {
    envVar: 'CRYPTO_NEWS_BOT_TOKEN',
    configPath: 'publishing.cryptoNews.botToken',
    category: 'required',
    description: 'Bot token for crypto news channel',
  },
  {
    envVar: 'CHAIN_DEXTER_BOT_TOKEN',
    configPath: 'publishing.chainDexterBot.botToken',
    category: 'required',
    description: 'Bot token for ChainDexter channel',
  },

  // ========== Tier 2: Required When Enabled ==========
  {
    envVar: 'POSTGRES_HOST',
    configPath: 'database.host',
    category: 'required-if',
    condition: () => true, // Will be overridden per-test via getter
    description: 'PostgreSQL host',
  },
  {
    envVar: 'POSTGRES_PORT',
    configPath: 'database.port',
    category: 'required-if',
    condition: () => true,
    description: 'PostgreSQL port',
  },
  {
    envVar: 'POSTGRES_USER',
    configPath: 'database.username',
    category: 'required-if',
    condition: () => true,
    description: 'PostgreSQL username',
  },
  {
    envVar: 'POSTGRES_PASSWORD',
    configPath: 'database.password',
    category: 'required-if',
    condition: () => true,
    description: 'PostgreSQL password',
  },
  {
    envVar: 'POSTGRES_DB',
    configPath: 'database.database',
    category: 'required-if',
    condition: () => true,
    description: 'PostgreSQL database name',
  },
  {
    envVar: 'REDIS_HOST',
    configPath: 'redis.host',
    category: 'required-if',
    condition: () => true,
    description: 'Redis host',
  },
  {
    envVar: 'REDIS_PORT',
    configPath: 'redis.port',
    category: 'required-if',
    condition: () => true,
    description: 'Redis port',
  },
  {
    envVar: 'INGESTION_TELEGRAM_MTPROTO_API_HASH',
    configPath: 'telegram.mtprotoApiHash',
    category: 'required-if',
    condition: () => true,
    description: 'MTProto API hash for Telegram',
  },
  {
    envVar: 'INGESTION_TELEGRAM_MTPROTO_SESSION',
    configPath: 'telegram.mtprotoSession',
    category: 'required-if',
    condition: () => true,
    description: 'MTProto session string for Telegram',
  },
  {
    envVar: 'INGESTION_TELEGRAM_MTPROTO_API_ID',
    configPath: 'telegram.mtprotoApiId',
    category: 'required-if',
    condition: () => true,
    description: 'MTProto API ID (required when enabled)',
  },

  // ========== Tier 3: Format Validation ==========
  {
    envVar: 'PORT',
    configPath: 'port',
    category: 'format',
    format: (value: unknown): string | null => {
      const port = value as number;
      if (!Number.isInteger(port)) {
        return 'must be an integer';
      }
      if (port < 1 || port > 65535) {
        return 'must be between 1 and 65535';
      }
      return null;
    },
    description: 'Server port',
  },
  {
    envVar: 'NODE_ENV',
    configPath: 'nodeEnv',
    category: 'format',
    format: (value: unknown): string | null => {
      const valid = ['development', 'production', 'staging', 'test'];
      if (!valid.includes(value as string)) {
        return `must be one of: ${valid.join(', ')}`;
      }
      return null;
    },
    description: 'Node environment',
  },
  {
    envVar: 'INGESTION_TELEGRAM_MTPROTO_API_ID',
    configPath: 'telegram.mtprotoApiId',
    category: 'format',
    format: (value: unknown): string | null => {
      const id = value as number;
      if (!Number.isInteger(id) || id <= 0) {
        return 'must be a positive integer greater than 0';
      }
      return null;
    },
    description: 'MTProto API ID (format validation)',
  },
  {
    envVar: 'CHAIN_DEXTER_INGEST_MODE',
    configPath: 'chainDexterBot.ingestMode',
    category: 'format',
    format: (value: unknown): string | null => {
      const valid = ['webhook', 'polling'];
      if (!valid.includes(value as string)) {
        return `must be one of: ${valid.join(', ')}`;
      }
      return null;
    },
    description: 'ChainDexter ingest mode',
  },

  // ========== Tier 4: Optional (warn only) ==========
  {
    envVar: 'INGESTION_TELEGRAM_SEED_KOLS',
    configPath: 'ingestion.telegram.seed.channels',
    category: 'optional',
    description: 'Seed KOL channels (comma-separated)',
  },
  {
    envVar: 'INGESTION_TELEGRAM_SEED_NEWS',
    configPath: 'ingestion.telegram.newsSeed.channels',
    category: 'optional',
    description: 'Seed news channels (comma-separated)',
  },
  {
    envVar: 'FLUXRPC_RPC',
    configPath: 'fluxrpc.rpcUrl',
    category: 'optional',
    description: 'FluxRPC RPC URL (needed for chain detection)',
  },
  {
    envVar: 'FLUXRPC_WS',
    configPath: 'fluxrpc.wsUrl',
    category: 'optional',
    description: 'FluxRPC WebSocket URL (fallback)',
  },
  {
    envVar: 'PUBLISHING_TELEGRAM_OUTPUT_CHANNEL',
    configPath: 'publishing.telegram.outputChannel',
    category: 'optional',
    description: 'Output channel for publishing',
  },
  {
    envVar: 'VIP_CALLS_OUTPUT_CHANNEL',
    configPath: 'publishing.vipCalls.outputChannel',
    category: 'optional',
    description: 'VIP calls output channel',
  },
  {
    envVar: 'CRYPTO_NEWS_OUTPUT_CHANNEL',
    configPath: 'publishing.cryptoNews.outputChannel',
    category: 'optional',
    description: 'Crypto news output channel',
  },
  {
    envVar: 'LLM_GATEWAY_API_KEY',
    configPath: 'llm.gateway.apiKey',
    category: 'optional',
    description: 'LLM gateway API key (LLM features degrade gracefully)',
  },
  // Analytics scheduler vars
  {
    envVar: 'ANALYTICS_EVALUATION_HORIZONS_HOURS',
    configPath: 'analytics.evaluationHorizonsHours',
    category: 'optional',
    description: 'Analytics evaluation horizons',
  },
  {
    envVar: 'ANALYTICS_SCHEDULER_CRON',
    configPath: 'analytics.schedulerCron',
    category: 'optional',
    description: 'Analytics scheduler cron',
  },
  {
    envVar: 'ANALYTICS_SCHEDULER_ENABLED',
    configPath: 'analytics.schedulerEnabled',
    category: 'optional',
    description: 'Analytics scheduler enabled',
  },
  {
    envVar: 'ANALYTICS_SCHEDULER_BATCH_SIZE',
    configPath: 'analytics.schedulerBatchSize',
    category: 'optional',
    description: 'Analytics scheduler batch size',
  },
  // Milestone scheduler vars
  {
    envVar: 'MILESTONE_ACTIVE_WINDOW_HOURS',
    configPath: 'milestone.activeWindowHours',
    category: 'optional',
    description: 'Milestone active window hours',
  },
  {
    envVar: 'MILESTONE_SCHEDULER_CRON',
    configPath: 'milestone.schedulerCron',
    category: 'optional',
    description: 'Milestone scheduler cron',
  },
  {
    envVar: 'MILESTONE_SCHEDULER_ENABLED',
    configPath: 'milestone.schedulerEnabled',
    category: 'optional',
    description: 'Milestone scheduler enabled',
  },
  {
    envVar: 'MILESTONE_SCHEDULER_BATCH_SIZE',
    configPath: 'milestone.schedulerBatchSize',
    category: 'optional',
    description: 'Milestone scheduler batch size',
  },
  // KOL reputation scheduler vars
  {
    envVar: 'KOL_REPUTATION_SCHEDULER_CRON',
    configPath: 'kolReputation.schedulerCron',
    category: 'optional',
    description: 'KOL reputation scheduler cron',
  },
  {
    envVar: 'KOL_REPUTATION_SCHEDULER_ENABLED',
    configPath: 'kolReputation.schedulerEnabled',
    category: 'optional',
    description: 'KOL reputation scheduler enabled',
  },
  // Uploads and logging
  {
    envVar: 'UPLOADS_ROOT',
    configPath: 'uploadsRoot',
    category: 'optional',
    description: 'Uploads root directory',
  },
  {
    envVar: 'CRYPTO_NEWS_MEDIA_RETENTION_HOURS',
    configPath: 'cryptoNewsMediaRetentionHours',
    category: 'optional',
    description:
      'Crypto-news media retention window in hours (read filter + media cleanup cron)',
  },
  {
    envVar: 'LOG_LEVEL',
    configPath: 'logging.level',
    category: 'optional',
    description: 'Log level',
  },
  {
    envVar: 'LOG_DIR',
    configPath: 'logging.dir',
    category: 'optional',
    description: 'Log directory',
  },
  {
    envVar: 'LOG_FILE',
    configPath: 'logging.fileName',
    category: 'optional',
    description: 'Log file name',
  },
];

/**
 * Resolves a dot-notation path to a value in the AppConfig object.
 * @param obj The object to traverse
 * @param path Dot-separated path (e.g., 'alchemy.apiKey')
 * @returns The value at the path, or undefined if not found
 */
function getConfigValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * Validates the application configuration.
 * @param appCfg The AppConfig to validate
 * @returns An object with warnings array (empty means all optional vars are present/valid)
 * @throws ConfigValidationError if any required/required-if/format validation fails
 */
export function validateAppConfig(appCfg: unknown): {
  warnings: string[];
} {
  const errors: Array<{ envVar: string; message: string }> = [];
  const warnings: string[] = [];

  if (!appCfg || typeof appCfg !== 'object') {
    throw new ConfigValidationError([
      { envVar: 'AppConfig', message: 'Invalid config object' },
    ]);
  }

  const cfgRecord = appCfg as Record<string, unknown>;
  const appConfig = cfgRecord as unknown as AppConfig;

  for (const def of CONFIG_MANIFEST) {
    const value = getConfigValue(cfgRecord, def.configPath);

    switch (def.category) {
      case 'required': {
        // Tier 1: Always required - must be non-empty string
        const strValue = typeof value === 'string' ? value : '';
        if (!strValue || strValue.trim() === '') {
          errors.push({
            envVar: def.envVar,
            message: `${def.description} is required but is empty`,
          });
        }
        break;
      }

      case 'required-if': {
        let isRequired = false;
        if (def.configPath.startsWith('database.')) {
          isRequired = appConfig.database.enabled;
        } else if (def.configPath.startsWith('redis.')) {
          isRequired = appConfig.redis.enabled;
        } else if (
          def.configPath === 'telegram.mtprotoApiHash' ||
          def.configPath === 'telegram.mtprotoSession' ||
          def.configPath === 'telegram.mtprotoApiId'
        ) {
          isRequired = appConfig.telegram.mtprotoEnabled;
        }

        if (isRequired) {
          let isValid = false;
          if (typeof value === 'string') {
            isValid = value.trim().length > 0;
          } else if (typeof value === 'number') {
            isValid = value > 0;
          }

          if (!isValid) {
            errors.push({
              envVar: def.envVar,
              message: `${def.description} is required when ${def.configPath.split('.')[0]}.enabled is true but is empty/invalid`,
            });
          }
        } else {
          let isEmpty = false;
          if (value === null || value === undefined) {
            isEmpty = true;
          } else if (typeof value === 'string') {
            isEmpty = value.trim() === '';
          } else if (typeof value === 'number') {
            isEmpty = value <= 0;
          }
          if (isEmpty) {
            warnings.push(
              `${def.envVar} (${def.configPath}) is optional (${def.configPath.split('.')[0]} disabled) but empty - ${def.description}`,
            );
          }
        }
        break;
      }

      case 'format': {
        // Tier 3: Format validation
        if (def.format) {
          const formatError = def.format(value);
          if (formatError) {
            errors.push({
              envVar: def.envVar,
              message: `${def.description} ${formatError}`,
            });
          }
        }
        break;
      }

      case 'optional': {
        if (def.configPath === 'fluxrpc.wsUrl') {
          break;
        }
        let shouldWarn = false;
        if (value === null || value === undefined) {
          shouldWarn = true;
        } else if (typeof value === 'string') {
          shouldWarn = value.trim() === '';
        } else if (Array.isArray(value)) {
          shouldWarn = value.length === 0;
        }
        if (shouldWarn) {
          warnings.push(
            `${def.envVar} (${def.configPath}) is optional but empty - ${def.description}`,
          );
        }
        break;
      }
    }
  }

  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }

  return { warnings };
}
