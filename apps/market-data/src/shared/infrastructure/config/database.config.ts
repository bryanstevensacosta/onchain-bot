import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  url: string;
  synchronize: boolean;
}

export function buildDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  return {
    url:
      env.DATABASE_URL ??
      'postgres://onchain_bot:onchain_bot@localhost:5438/onchain_bot_market_data',
    synchronize: env.DATABASE_SYNCHRONIZE === 'true',
  };
}

/**
 * Opt-in persistence switch (Tramo 3, todo 14, GAP-1).
 *
 * TypeORM is wired ONLY when `DATABASE_ENABLED=true` (explicit
 * operator decision). Default off: boots never block on an
 * unreachable Postgres and the snapshot history keeps the v1
 * in-memory ring. `.env.example` documents the flag.
 */
export function isDatabaseEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DATABASE_ENABLED === 'true';
}

export const databaseConfig = registerAs(
  'database',
  (): DatabaseConfig => buildDatabaseConfig(),
);
