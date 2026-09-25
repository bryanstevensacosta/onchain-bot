import { registerAs } from '@nestjs/config';

export interface AppConfig {
  port: number;
  nodeEnv: string;
}

export function buildAppConfig(
  env: NodeJS.ProcessEnv = process.env,
): AppConfig {
  return {
    port: parseInt(env.MARKET_DATA_PORT ?? '4000', 10),
    nodeEnv: env.NODE_ENV ?? 'development',
  };
}

export const appConfig = registerAs('app', (): AppConfig => buildAppConfig());
