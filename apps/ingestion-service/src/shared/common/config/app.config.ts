import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerAs } from '@nestjs/config';
import {
  IsString,
  IsInt,
  IsNotEmpty,
  Min,
  Max,
  IsOptional,
  IsUrl,
  IsBoolean,
  validateSync,
  ValidatorOptions,
  IsArray,
  ValidateNested,
  IsEnum,
  IsPositive,
  MinLength,
} from 'class-validator';
import { plainToClass, Type } from 'class-transformer';

/**
 * Application configuration for Ingestion Service
 *
 * Validates and provides typed access to environment variables.
 * Loads config/ingestion.config.json for safety defaults (Per Requirement 11.6).
 *
 * Per Requirement 6.2: All configuration via environment variables
 * Per Requirement 11: Anti-ban protection configuration
 * Per Requirement 11.6: Load config file with safe defaults
 */

/**
 * Interface for channel seed entries
 */
export interface SeedKolEntry {
  channelId: string;
  displayName?: string;
  handle?: string;
}

export interface SeedNewsChannelEntry {
  channelId: string;
  displayName?: string;
  handle?: string;
}

/**
 * Interface for safety configuration from JSON file
 */
export interface IngestionSafetyConfigFile {
  maxChannels: number;
  pollIntervalBaseMs: number;
  jitterPercent: number;
  sleepWindow: {
    start: string;
    end: string;
    timezone: string;
  };
  floodProtection: {
    initialBackoffMs: number;
    backoffMultiplier: number;
    maxBackoffMs: number;
    maxAttempts: number;
    threshold24h: number;
  };
}

/**
 * Validation classes using class-validator decorators
 */

class TelegramConfig {
  @IsInt()
  @IsPositive()
  @IsNotEmpty({
    message:
      'INGESTION_TELEGRAM_MTPROTO_API_ID is required and must be a valid integer',
  })
  apiId!: number;

  @IsString()
  @MinLength(32, {
    message:
      'INGESTION_TELEGRAM_MTPROTO_API_HASH must be at least 32 characters',
  })
  @IsNotEmpty({ message: 'INGESTION_TELEGRAM_MTPROTO_API_HASH is required' })
  apiHash!: string;

  @IsString()
  @IsNotEmpty({ message: 'INGESTION_TELEGRAM_MTPROTO_SESSION is required' })
  sessionString!: string;
}

class ApiConfig {
  @IsInt()
  @Min(1, { message: 'INGESTION_API_PORT must be at least 1' })
  @Max(65535, { message: 'INGESTION_API_PORT must not exceed 65535' })
  port!: number;

  @IsString()
  @IsNotEmpty({ message: 'INGESTION_API_HOST is required' })
  host!: string;

  @IsUrl(
    { require_tld: false },
    { message: 'INGESTION_API_BASE_URL must be a valid URL' },
  )
  @IsNotEmpty({ message: 'INGESTION_API_BASE_URL is required' })
  baseUrl!: string;
}

class RedisConfig {
  @IsString()
  @IsNotEmpty({ message: 'REDIS_HOST is required' })
  host!: string;

  @IsInt()
  @Min(1, { message: 'REDIS_PORT must be at least 1' })
  @Max(65535, { message: 'REDIS_PORT must not exceed 65535' })
  port!: number;

  @IsString()
  @IsOptional()
  password?: string;

  @IsInt()
  @Min(0)
  @Max(15)
  db!: number;
}

class UploadsConfig {
  @IsString()
  @IsNotEmpty({ message: 'INGESTION_UPLOADS_ROOT is required' })
  root!: string;

  @IsString()
  @IsNotEmpty()
  mediaPath!: string;
}

class FloodProtectionConfig {
  @IsInt()
  @IsPositive()
  initialBackoffMs!: number;

  @IsPositive()
  backoffMultiplier!: number;

  @IsInt()
  @IsPositive()
  maxBackoffMs!: number;

  @IsInt()
  @IsPositive()
  maxAttempts!: number;

  @IsInt()
  @Min(0)
  threshold24h!: number;
}

class IngestionSafetyConfig {
  @IsInt()
  @IsPositive()
  @Max(100, {
    message:
      'INGESTION_SAFETY_MAX_CHANNELS should not exceed 100 for anti-ban safety',
  })
  maxChannels!: number;

  @IsInt()
  @IsPositive()
  @Min(30000, {
    message:
      'INGESTION_SAFETY_POLL_INTERVAL_MS should be at least 30s for anti-ban safety',
  })
  pollIntervalBaseMs!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  jitterPercent!: number;

  @IsString()
  @IsNotEmpty()
  sleepWindowStart!: string;

  @IsString()
  @IsNotEmpty()
  sleepWindowEnd!: string;

  @ValidateNested()
  @Type(() => FloodProtectionConfig)
  floodProtection!: FloodProtectionConfig;
}

class DatabaseConfig {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @IsNotEmpty()
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsString()
  @IsNotEmpty()
  database!: string;
}

class LoggingConfig {
  @IsEnum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
  level!: string;
}

class AppConfigValidation {
  @IsEnum(['development', 'production', 'test'])
  nodeEnv!: string;

  @ValidateNested()
  @Type(() => TelegramConfig)
  telegram!: TelegramConfig;

  @IsArray()
  seedKols!: SeedKolEntry[];

  @IsArray()
  seedNews!: SeedNewsChannelEntry[];

  @ValidateNested()
  @Type(() => ApiConfig)
  api!: ApiConfig;

  @ValidateNested()
  @Type(() => RedisConfig)
  redis!: RedisConfig;

  @ValidateNested()
  @Type(() => UploadsConfig)
  uploads!: UploadsConfig;

  @ValidateNested()
  @Type(() => IngestionSafetyConfig)
  ingestionSafety!: IngestionSafetyConfig;

  @ValidateNested()
  @Type(() => DatabaseConfig)
  database!: DatabaseConfig;

  @ValidateNested()
  @Type(() => LoggingConfig)
  logging!: LoggingConfig;
}

/**
 * Validate configuration object using class-validator
 * Throws detailed error message if validation fails
 */
function validateConfig(config: Record<string, any>): void {
  const validatorOptions: ValidatorOptions = {
    whitelist: true,
    forbidNonWhitelisted: false, // Allow extra properties for flexibility
    validationError: { target: false },
  };

  const configInstance = plainToClass(AppConfigValidation, config);
  const errors = validateSync(configInstance, validatorOptions);

  if (errors.length > 0) {
    const errorMessages = errors
      .map((error) => {
        const constraints = error.constraints
          ? Object.values(error.constraints)
          : ['Unknown validation error'];
        return `  - ${error.property}: ${constraints.join(', ')}`;
      })
      .join('\n');

    throw new Error(
      `[Config] Configuration validation failed:\n${errorMessages}\n\n` +
        'Please check your environment variables and ensure all required values are set correctly.',
    );
  }
}

/**
 * Load safety configuration from config/ingestion.config.json
 * Per Requirement 11.6: Safe defaults if file is missing or invalid
 */
function loadSafetyConfig(): IngestionSafetyConfigFile {
  const configPath = join(process.cwd(), 'config', 'ingestion.config.json');

  // Default configuration (used if file is missing or invalid)
  const defaults: IngestionSafetyConfigFile = {
    maxChannels: 50,
    pollIntervalBaseMs: 90000,
    jitterPercent: 30,
    sleepWindow: {
      start: '04:00',
      end: '08:00',
      timezone: 'UTC',
    },
    floodProtection: {
      initialBackoffMs: 5000,
      backoffMultiplier: 2,
      maxBackoffMs: 3600000,
      maxAttempts: 5,
      threshold24h: 10,
    },
  };

  if (!existsSync(configPath)) {
    console.warn(
      `[Config] ingestion.config.json not found at ${configPath}, using safe defaults`,
    );
    return defaults;
  }

  try {
    const fileContent = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(
      fileContent,
    ) as Partial<IngestionSafetyConfigFile>;

    // Merge with defaults (file values override defaults)
    return {
      maxChannels: parsed.maxChannels ?? defaults.maxChannels,
      pollIntervalBaseMs:
        parsed.pollIntervalBaseMs ?? defaults.pollIntervalBaseMs,
      jitterPercent: parsed.jitterPercent ?? defaults.jitterPercent,
      sleepWindow: {
        start: parsed.sleepWindow?.start ?? defaults.sleepWindow.start,
        end: parsed.sleepWindow?.end ?? defaults.sleepWindow.end,
        timezone: parsed.sleepWindow?.timezone ?? defaults.sleepWindow.timezone,
      },
      floodProtection: {
        initialBackoffMs:
          parsed.floodProtection?.initialBackoffMs ??
          defaults.floodProtection.initialBackoffMs,
        backoffMultiplier:
          parsed.floodProtection?.backoffMultiplier ??
          defaults.floodProtection.backoffMultiplier,
        maxBackoffMs:
          parsed.floodProtection?.maxBackoffMs ??
          defaults.floodProtection.maxBackoffMs,
        maxAttempts:
          parsed.floodProtection?.maxAttempts ??
          defaults.floodProtection.maxAttempts,
        threshold24h:
          parsed.floodProtection?.threshold24h ??
          defaults.floodProtection.threshold24h,
      },
    };
  } catch (error) {
    console.warn(
      `[Config] Failed to parse ingestion.config.json: ${error instanceof Error ? error.message : String(error)}, using safe defaults`,
    );
    return defaults;
  }
}

/**
 * Parse JSON seed configuration from environment variables
 */
function parseSeedKols(): SeedKolEntry[] {
  const raw = process.env.INGESTION_TELEGRAM_SEED_KOLS;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn(
        '[Config] INGESTION_TELEGRAM_SEED_KOLS is not an array, ignoring',
      );
      return [];
    }
    return parsed as SeedKolEntry[];
  } catch (error) {
    console.warn(
      `[Config] Failed to parse INGESTION_TELEGRAM_SEED_KOLS: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

function parseSeedNews(): SeedNewsChannelEntry[] {
  const raw = process.env.INGESTION_TELEGRAM_SEED_NEWS;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn(
        '[Config] INGESTION_TELEGRAM_SEED_NEWS is not an array, ignoring',
      );
      return [];
    }
    return parsed as SeedNewsChannelEntry[];
  } catch (error) {
    console.warn(
      `[Config] Failed to parse INGESTION_TELEGRAM_SEED_NEWS: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

/**
 * Main application configuration factory
 * Per Requirement 6.2: Environment variable validation with class-validator
 */
export const appConfig = registerAs('app', () => {
  // Load safety config from file (Requirement 11.6)
  const safetyConfigFile = loadSafetyConfig();

  // Parse MTProto credentials (Requirement 6.2)
  const telegram = {
    apiId: parseInt(process.env.INGESTION_TELEGRAM_MTPROTO_API_ID || '0', 10),
    apiHash: process.env.INGESTION_TELEGRAM_MTPROTO_API_HASH || '',
    sessionString: process.env.INGESTION_TELEGRAM_MTPROTO_SESSION || '',
  };

  // Parse channel seeders (Requirement 6.2)
  const seedKols = parseSeedKols();
  const seedNews = parseSeedNews();

  // API server configuration (Requirement 6.2)
  const api = {
    port: parseInt(process.env.INGESTION_API_PORT || '3031', 10),
    host: (process.env.INGESTION_API_HOST || '').trim() || '0.0.0.0',
    baseUrl:
      (process.env.INGESTION_API_BASE_URL || '').trim() ||
      'http://localhost:3031',
  };

  // Redis configuration (Requirement 6.2)
  const redis = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  };

  // Storage configuration (Requirement 6.2)
  const uploads = {
    root: process.env.INGESTION_UPLOADS_ROOT || './uploads',
    mediaPath: 'crypto-news/media',
  };

  // Safety configuration (Requirement 11)
  // Environment variables override file values
  const ingestionSafety = {
    maxChannels: parseInt(
      process.env.INGESTION_SAFETY_MAX_CHANNELS ||
        String(safetyConfigFile.maxChannels),
      10,
    ),
    pollIntervalBaseMs: parseInt(
      process.env.INGESTION_SAFETY_POLL_INTERVAL_MS ||
        String(safetyConfigFile.pollIntervalBaseMs),
      10,
    ),
    jitterPercent: parseInt(
      process.env.INGESTION_SAFETY_JITTER_PERCENT ||
        String(safetyConfigFile.jitterPercent),
      10,
    ),
    sleepWindowStart:
      process.env.INGESTION_SAFETY_SLEEP_WINDOW_START ||
      safetyConfigFile.sleepWindow.start,
    sleepWindowEnd:
      process.env.INGESTION_SAFETY_SLEEP_WINDOW_END ||
      safetyConfigFile.sleepWindow.end,
    floodProtection: {
      initialBackoffMs: parseInt(
        process.env.INGESTION_SAFETY_FLOOD_INITIAL_MS ||
          String(safetyConfigFile.floodProtection.initialBackoffMs),
        10,
      ),
      backoffMultiplier: parseFloat(
        process.env.INGESTION_SAFETY_FLOOD_MULTIPLIER ||
          String(safetyConfigFile.floodProtection.backoffMultiplier),
      ),
      maxBackoffMs: parseInt(
        process.env.INGESTION_SAFETY_FLOOD_MAX_MS ||
          String(safetyConfigFile.floodProtection.maxBackoffMs),
        10,
      ),
      maxAttempts: parseInt(
        process.env.INGESTION_SAFETY_FLOOD_MAX_ATTEMPTS ||
          String(safetyConfigFile.floodProtection.maxAttempts),
        10,
      ),
      threshold24h: parseInt(
        process.env.INGESTION_SAFETY_FLOOD_THRESHOLD_24H ||
          String(safetyConfigFile.floodProtection.threshold24h),
        10,
      ),
    },
  };

  // Database configuration (optional, for raw message storage)
  const database = {
    enabled: process.env.DATABASE_ENABLED === 'true',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME || 'onchain_bot',
  };

  // Logging configuration
  const logging = {
    level: process.env.LOG_LEVEL || 'info',
  };

  // Node environment
  const nodeEnv = process.env.NODE_ENV || 'development';

  // Validate configurations (fail fast on startup)
  // TODO: Implement validation functions
  //   validateMtprotoCredentials(telegram);
  // TODO: Implement validation functions
  //   validateRedisConfig(redis);
  // TODO: Implement validation functions
  //   validateApiConfig(api);

  return {
    nodeEnv,
    telegram,
    seedKols,
    seedNews,
    api,
    redis,
    uploads,
    ingestionSafety,
    database,
    logging,
  };
});

/**
 * TypeScript interface for AppConfig
 * Provides type-safe access via ConfigService.get<AppConfig>('app')
 */
export type AppConfig = ReturnType<typeof appConfig>;
