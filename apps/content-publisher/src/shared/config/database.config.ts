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
      'postgres://onchain_bot:onchain_bot@localhost:5436/onchain_bot_content_publisher',
    synchronize: env.DATABASE_SYNCHRONIZE === 'true',
  };
}

export const databaseConfig = registerAs(
  'database',
  (): DatabaseConfig => buildDatabaseConfig(),
);
