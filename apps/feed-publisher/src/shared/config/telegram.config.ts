import { registerAs } from '@nestjs/config';

export interface TelegramConfig {
  ingestionUrl: string;
  ingestionApiKey: string;
  feedBotToken: string;
  threadsBotToken: string;
  cryptoNewsOutputChannel: string;
  threadsOutputChannel: string;
  rateLimitPerMinute: number;
  cryptoNewsRateLimitPerMinute: number;
  threadsRateLimitPerMinute: number;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 1) {
    return Math.floor(parsed);
  }
  return fallback;
}

export function buildTelegramConfig(
  env: NodeJS.ProcessEnv = process.env,
): TelegramConfig {
  const shared = parsePositiveInt(env.TELEGRAM_RATE_LIMIT_PER_MINUTE, 20);
  return {
    ingestionUrl: env.INGESTION_TELEGRAM_URL ?? 'http://localhost:3031',
    ingestionApiKey: env.INGESTION_TELEGRAM_API_KEY ?? '',
    feedBotToken: env.CRYPTO_NEWS_BOT_TOKEN ?? '',
    threadsBotToken: env.THREADS_BOT_TOKEN ?? '',
    cryptoNewsOutputChannel: env.CRYPTO_NEWS_OUTPUT_CHANNEL ?? '',
    threadsOutputChannel: env.THREADS_OUTPUT_CHANNEL ?? '',
    rateLimitPerMinute: shared,
    cryptoNewsRateLimitPerMinute: parsePositiveInt(
      env.CRYPTO_NEWS_RATE_LIMIT_PER_MINUTE,
      shared,
    ),
    threadsRateLimitPerMinute: parsePositiveInt(
      env.THREADS_RATE_LIMIT_PER_MINUTE,
      shared,
    ),
  };
}

export const telegramConfig = registerAs(
  'telegram',
  (): TelegramConfig => buildTelegramConfig(),
);
