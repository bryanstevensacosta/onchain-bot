import { registerAs } from '@nestjs/config';

export interface TelegramConfig {
  /** Bot token placeholder; dashboard-only mode resolves tokens from DB catalog (template.bot_id, P23). */
  botToken: string;
  apiKey: string;
}

export function buildTelegramConfig(
  env: NodeJS.ProcessEnv = process.env,
): TelegramConfig {
  return {
    // TODO(P23): resolve bot token from DB catalog template.bot_id; no env fallback.
    botToken: '',
    apiKey: (env.KOL_SYSTEM_API_KEY ?? '').trim(),
  };
}

export const telegramConfig = registerAs(
  'telegram',
  (): TelegramConfig => buildTelegramConfig(),
);
