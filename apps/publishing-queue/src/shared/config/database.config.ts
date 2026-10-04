import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  url: string;
  synchronize: boolean;
  logging: boolean;
}

/**
 * Database config (C-DB-01): own logical database
 * `publishing_queue_db[_staging]` on the shared Postgres server
 * (dev :5442). `synchronize` stays false outside dev/test.
 */
export function buildDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  return {
    url:
      env.DATABASE_URL ??
      'postgres://onchain_bot:onchain_bot@localhost:5432/publishing_queue_db',
    synchronize: (env.DATABASE_SYNCHRONIZE ?? 'false').toLowerCase() === 'true',
    logging: (env.DATABASE_LOGGING ?? 'false').toLowerCase() === 'true',
  };
}

export const databaseConfig = registerAs(
  'database',
  (): DatabaseConfig => buildDatabaseConfig(),
);
