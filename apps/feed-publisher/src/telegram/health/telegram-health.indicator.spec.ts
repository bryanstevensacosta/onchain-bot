import type { ConfigService } from '@nestjs/config';
import { TelegramHealthIndicator } from './telegram-health.indicator';

function makeConfig(env: Record<string, string> = {}): ConfigService {
  return {
    get: (key: string, fallback = ''): string =>
      env[key] ?? (fallback as string),
  } as unknown as ConfigService;
}

describe('TelegramHealthIndicator', () => {
  it('reports per-bot configured flags without claiming network liveness', async () => {
    const indicator = new TelegramHealthIndicator(
      makeConfig({
        CRYPTO_NEWS_BOT_TOKEN: 'c',
        THREADS_BOT_TOKEN: 't',
      }),
    );
    await expect(indicator.check()).resolves.toEqual({
      component: 'telegram',
      status: 'up',
      detail: { cryptoNews: 'configured', threads: 'configured' },
    });
  });

  it('marks missing bots as missing (dashboard-only mode stays up)', async () => {
    const indicator = new TelegramHealthIndicator(makeConfig({}));
    await expect(indicator.check()).resolves.toEqual({
      component: 'telegram',
      status: 'up',
      detail: { cryptoNews: 'missing', threads: 'missing' },
    });
  });
});
