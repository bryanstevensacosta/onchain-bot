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
      'postgres://onchain_bot:onchain_bot@localhost:5432/feed_publisher_db',
    synchronize: env.DATABASE_SYNCHRONIZE === 'true',
  };
}

export const databaseConfig = registerAs(
  'database',
  (): DatabaseConfig => buildDatabaseConfig(),
);
