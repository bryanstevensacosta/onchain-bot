import { registerAs } from '@nestjs/config';

export interface RedisConfig {
  url: string;
}

export function buildRedisConfig(
  env: NodeJS.ProcessEnv = process.env,
): RedisConfig {
  return {
    url: env.REDIS_URL ?? 'redis://localhost:6383/0',
  };
}

export const redisConfig = registerAs(
  'redis',
  (): RedisConfig => buildRedisConfig(),
);
