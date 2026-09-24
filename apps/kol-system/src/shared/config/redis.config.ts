import { registerAs } from '@nestjs/config';

export interface RedisConfig {
  url: string;
  host: string;
  port: number;
}

export function buildRedisConfig(
  env: NodeJS.ProcessEnv = process.env,
): RedisConfig {
  const port = parseInt(env.REDIS_PORT ?? '6379', 10);
  return {
    url: env.REDIS_URL ?? '',
    host: env.REDIS_HOST ?? 'localhost',
    port: Number.isFinite(port) ? port : 6379,
  };
}

export const redisConfig = registerAs(
  'redis',
  (): RedisConfig => buildRedisConfig(),
);
