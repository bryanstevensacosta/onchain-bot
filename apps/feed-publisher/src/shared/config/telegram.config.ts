import { registerAs } from '@nestjs/config';

/** Publish path selector (telegram-bots-gateway todo 5). */
export type FeedPublishMode = 'direct' | 'dual' | 'gateway';

export interface BotsGatewayClientConfig {
  /** Gateway base URL (dev :4070, staging :4071, prod :4072). */
  baseUrl: string;
  /** Gateway client id (`x-api-key`; empty = keyless dev, guard fails open). */
  clientId: string;
  /** HMAC secret for `x-signature` (empty = unsigned, keyless dev only). */
  clientSecret: string;
  /**
   * `direct` = legacy adapters only (deprecated);
   * `dual` = gateway + direct, compare, return the direct leg (parity runs);
   * `gateway` = gateway only, fail-closed (cutover).
   */
  publishMode: FeedPublishMode;
}

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
  botsGateway: BotsGatewayClientConfig;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 1) {
    return Math.floor(parsed);
  }
  return fallback;
}

function parsePublishMode(raw: string | undefined): FeedPublishMode {
  const mode = (raw ?? '').trim().toLowerCase();
  if (mode === 'direct' || mode === 'dual' || mode === 'gateway') return mode;
  return 'dual';
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
    botsGateway: {
      baseUrl:
        (env.BOTS_GATEWAY_URL ?? '').trim().replace(/\/+$/, '') ||
        'http://localhost:4070',
      clientId: (env.BOTS_GATEWAY_CLIENT_ID ?? '').trim(),
      clientSecret: (env.BOTS_GATEWAY_CLIENT_SECRET ?? '').trim(),
      publishMode: parsePublishMode(env.FEED_PUBLISH_MODE),
    },
  };
}

export const telegramConfig = registerAs(
  'telegram',
  (): TelegramConfig => buildTelegramConfig(),
);
