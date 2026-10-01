import { registerAs } from '@nestjs/config';

/** Publish path selector (telegram-bots-gateway todo 4). */
export type KolPublishMode = 'direct' | 'dual' | 'gateway';

export interface BotsGatewayClientConfig {
  /** Gateway base URL (dev :4070, staging :4071, prod :4072). */
  baseUrl: string;
  /** Gateway client id (`x-api-key`; empty = keyless dev, guard fails open). */
  clientId: string;
  /** HMAC secret for `x-signature` (empty = unsigned, keyless dev only). */
  clientSecret: string;
  /**
   * `direct` = legacy adapter only (deprecated);
   * `dual` = gateway + direct, compare, return the direct leg (parity runs);
   * `gateway` = gateway only, fail-closed (cutover).
   */
  publishMode: KolPublishMode;
}

export interface TelegramConfig {
  /** Bot token placeholder; dashboard-only mode resolves tokens from DB catalog (template.bot_id, P23). */
  botToken: string;
  apiKey: string;
  botsGateway: BotsGatewayClientConfig;
}

function parsePublishMode(raw: string | undefined): KolPublishMode {
  const mode = (raw ?? '').trim().toLowerCase();
  if (mode === 'direct' || mode === 'dual' || mode === 'gateway') return mode;
  return 'dual';
}

export function buildTelegramConfig(
  env: NodeJS.ProcessEnv = process.env,
): TelegramConfig {
  return {
    // TODO(P23): resolve bot token from DB catalog template.bot_id; no env fallback.
    botToken: '',
    apiKey: (env.KOL_CALLS_API_KEY ?? env.KOL_SYSTEM_API_KEY ?? '').trim(),
    botsGateway: {
      baseUrl:
        (env.BOTS_GATEWAY_URL ?? '').trim().replace(/\/+$/, '') ||
        'http://localhost:4070',
      clientId: (env.BOTS_GATEWAY_CLIENT_ID ?? '').trim(),
      clientSecret: (env.BOTS_GATEWAY_CLIENT_SECRET ?? '').trim(),
      publishMode: parsePublishMode(env.KOL_PUBLISH_MODE),
    },
  };
}

export const telegramConfig = registerAs(
  'telegram',
  (): TelegramConfig => buildTelegramConfig(),
);
