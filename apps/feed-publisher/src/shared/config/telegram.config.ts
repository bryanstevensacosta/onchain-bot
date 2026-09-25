import { registerAs } from '@nestjs/config';

export interface TelegramConfig {
  ingestionUrl: string;
  ingestionApiKey: string;
  feedBotToken: string;
  threadsBotToken: string;
}

export function buildTelegramConfig(
  env: NodeJS.ProcessEnv = process.env,
): TelegramConfig {
  return {
    ingestionUrl: env.INGESTION_TELEGRAM_URL ?? 'http://localhost:3031',
    ingestionApiKey: env.INGESTION_TELEGRAM_API_KEY ?? '',
    feedBotToken: env.CRYPTO_NEWS_BOT_TOKEN ?? '',
    threadsBotToken: env.THREADS_BOT_TOKEN ?? '',
  };
}

export const telegramConfig = registerAs(
  'telegram',
  (): TelegramConfig => buildTelegramConfig(),
);
