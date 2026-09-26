import { registerAs } from '@nestjs/config';

export interface SchedulingPostsGatewayConfig {
  readonly baseUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface SchedulingPostsSessionCallbackConfig {
  readonly url: string;
  readonly apiKey: string;
}

export interface SchedulingPostsConfig {
  readonly port: number;
  readonly nodeEnv: string;
  readonly enabled: boolean;
  readonly apiKey: string;
  readonly uploadsRoot: string;
  readonly cronEnabled: boolean;
  readonly rateLimitPerMin: number;
  readonly sessionBindingsJson: string;
  readonly gateway: SchedulingPostsGatewayConfig;
  readonly sessionCallback: SchedulingPostsSessionCallbackConfig;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  return raw.toLowerCase() === 'true';
}

function parseIntOr(raw: string | undefined, fallback: number): number {
  const parsed = parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Scheduling-posts app config (todo 1).
 *
 * Telegram is gateway-only by construction (contract P42): there is no
 * publish-mode flag because no direct Bot API leg exists in this app.
 * Ports follow the triplet convention (dev :4080, staging :4081,
 * prod :4082); the database lives in `database.config.ts` (C-DB-01:
 * `onchain_bot_scheduling[_staging]` on :5437).
 */
export function buildSchedulingPostsConfig(
  env: NodeJS.ProcessEnv = process.env,
): SchedulingPostsConfig {
  const gatewayBase = (env.BOTS_GATEWAY_URL ?? 'http://localhost:4070').replace(
    /\/+$/,
    '',
  );
  return {
    port: parseIntOr(env.SCHEDULING_POSTS_PORT, 4080),
    nodeEnv: env.NODE_ENV ?? 'development',
    enabled: parseBool(env.SCHEDULING_POSTS_ENABLED, false),
    apiKey: env.SCHEDULING_POSTS_API_KEY ?? '',
    uploadsRoot:
      env.SCHEDULING_POSTS_UPLOADS_ROOT ?? `${process.cwd()}/uploads`,
    cronEnabled: parseBool(env.SCHEDULING_CRON_ENABLED, true),
    rateLimitPerMin: parseIntOr(env.PUBLISH_RATE_LIMIT_PER_MIN, 10),
    sessionBindingsJson: env.SCHEDULING_SESSION_BINDINGS ?? '',
    gateway: {
      baseUrl: gatewayBase || 'http://localhost:4070',
      clientId: env.BOTS_GATEWAY_CLIENT_ID ?? '',
      clientSecret: env.BOTS_GATEWAY_CLIENT_SECRET ?? '',
    },
    sessionCallback: {
      url: env.SESSION_CALLBACK_URL ?? '',
      apiKey: env.SESSION_CALLBACK_API_KEY ?? '',
    },
  };
}

export const schedulingPostsConfig = registerAs(
  'schedulingPosts',
  (): SchedulingPostsConfig => buildSchedulingPostsConfig(),
);

export interface ConfigValidationIssue {
  envVar: string;
  message: string;
}

export class ConfigValidationError extends Error {
  constructor(public readonly issues: ConfigValidationIssue[]) {
    super(
      `Invalid scheduling-posts config: ${issues
        .map((issue) => `${issue.envVar} ${issue.message}`)
        .join('; ')}`,
    );
    this.name = 'ConfigValidationError';
  }
}

const TIER_1_REQUIRED: Array<{ envVar: string; description: string }> = [
  { envVar: 'DATABASE_URL', description: 'Postgres connection string' },
];

const OPTIONAL_WITH_WARNING: Array<{ envVar: string; description: string }> = [
  {
    envVar: 'SCHEDULING_POSTS_API_KEY',
    description: 'inbound x-api-key (fail-open when empty, keyless dev)',
  },
  {
    envVar: 'BOTS_GATEWAY_CLIENT_ID',
    description: 'gateway HMAC client id (keyless dev sends fail-closed)',
  },
  {
    envVar: 'BOTS_GATEWAY_CLIENT_SECRET',
    description: 'gateway HMAC client secret (DISTINCT per env, never commit)',
  },
];

/**
 * Tier-1 validation: DATABASE_URL must be non-empty. The app boots
 * without bots or sessions configured (dashboard-only mode: schedule
 * calls 409 NO_ACTIVE_TARGET until bindings are seeded).
 */
export function validateSchedulingPostsConfig(
  env: NodeJS.ProcessEnv = process.env,
): { warnings: string[] } {
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
