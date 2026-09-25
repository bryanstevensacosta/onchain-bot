import { registerAs } from '@nestjs/config';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  encryptionKey: string;
}

export function buildAppConfig(
  env: NodeJS.ProcessEnv = process.env,
): AppConfig {
  return {
    port: parseInt(env.CONTENT_PUBLISHER_PORT ?? '3040', 10),
    nodeEnv: env.NODE_ENV ?? 'development',
    encryptionKey: env.ENCRYPTION_KEY ?? '',
  };
}

export const appConfig = registerAs('app', (): AppConfig => buildAppConfig());

export interface ConfigValidationIssue {
  envVar: string;
  message: string;
}

export class ConfigValidationError extends Error {
  constructor(public readonly issues: ConfigValidationIssue[]) {
    super(
      `Invalid content-publisher config: ${issues
        .map((issue) => `${issue.envVar} ${issue.message}`)
        .join('; ')}`,
    );
    this.name = 'ConfigValidationError';
  }
}

const TIER_1_REQUIRED: Array<{ envVar: string; description: string }> = [
  {
    envVar: 'ENCRYPTION_KEY',
    description: 'Secret key for encrypting sensitive fields',
  },
  { envVar: 'DATABASE_URL', description: 'Postgres connection string' },
];

const OPTIONAL_WITH_WARNING: Array<{ envVar: string; description: string }> = [
  {
    envVar: 'REDIS_URL',
    description: 'Redis connection string (falls back to in-memory)',
  },
  {
    envVar: 'CONTENT_PUBLISHER_API_KEY',
    description: 'API key for inbound consumers (fail-open when empty)',
  },
  {
    envVar: 'INGESTION_TELEGRAM_API_KEY',
    description: 'Upstream key sent as x-api-key on SSE + feed reads',
  },
];

/**
 * Tier-1 validation for content-publisher config.
 * ENCRYPTION_KEY / DATABASE_URL must be non-empty strings.
 * Bot tokens are OPTIONAL at boot (dashboard-only mode); the telegram
 * adapters fail with a clear error when a token is absent (todo 7).
 */
export function validateAppConfig(env: NodeJS.ProcessEnv = process.env): void {
  const missing = TIER_1_REQUIRED.filter(
    (item) => (env[item.envVar] ?? '').trim() === '',
  ).map((item) => ({ envVar: item.envVar, message: item.description }));
  if (missing.length > 0) {
    throw new ConfigValidationError(missing);
  }
  void OPTIONAL_WITH_WARNING;
}
