import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  /** Tier-1: Postgres connection string (validated non-empty by validateKolSystemConfig). */
  url: string;
  synchronize: boolean;
  logging: boolean;
}

export function buildDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  return {
    url: env.DATABASE_URL ?? '',
    synchronize: (env.DATABASE_SYNCHRONIZE ?? 'false').toLowerCase() === 'true',
    logging: (env.DATABASE_LOGGING ?? 'false').toLowerCase() === 'true',
  };
}

export const databaseConfig = registerAs(
  'database',
  (): DatabaseConfig => buildDatabaseConfig(),
);
