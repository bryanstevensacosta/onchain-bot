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
    port: parseInt(env.PORT ?? '3030', 10),
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
      `Invalid kol-system config: ${issues
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
    envVar: 'KOL_SYSTEM_API_KEY',
    description: 'API key for feed consumers (fail-open when empty)',
  },
];

/**
 * Tier-1 validation for kol-system config.
 * ENCRYPTION_KEY / DATABASE_URL must be non-empty strings.
 * The app boots without any bot configured (dashboard-only mode);
 * bot token resolution moves to the DB catalog (template.bot_id, P23).
 * @throws ConfigValidationError with a clear per-key message when any Tier-1 key is missing.
 */
export function validateKolSystemConfig(env: NodeJS.ProcessEnv = process.env): {
  warnings: string[];
} {
  const issues: ConfigValidationIssue[] = [];
  for (const def of TIER_1_REQUIRED) {
    const value = env[def.envVar];
    if (!value || value.trim() === '') {
      issues.push({
        envVar: def.envVar,
        message: `is required but is empty (${def.description})`,
      });
    }
  }
  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }
  const warnings: string[] = [];
  for (const def of OPTIONAL_WITH_WARNING) {
    const value = env[def.envVar];
    if (!value || value.trim() === '') {
      warnings.push(`${def.envVar} is optional but empty - ${def.description}`);
    }
  }
  return { warnings };
}
