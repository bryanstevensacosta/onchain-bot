import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * P21 hook point: telegram publisher health (config truth, never
 * network liveness — no Bot API call is made here).
 *
 * `status` is always `up` once the module is wired (a missing token is
 * a VALID dashboard-only mode, not an outage); `detail` carries the
 * per-bot configured/missing flags the composite health can consume.
 */
@Injectable()
export class TelegramHealthIndicator {
  public constructor(private readonly config: ConfigService) {}

  public async check(): Promise<{
    readonly component: string;
    readonly status: 'up' | 'down';
    readonly detail: {
      readonly cryptoNews: 'configured' | 'missing';
      readonly threads: 'configured' | 'missing';
    };
  }> {
    const crypto = (
      this.config.get<string>('CRYPTO_NEWS_BOT_TOKEN', '') ?? ''
    ).trim();
    const threads = (
      this.config.get<string>('THREADS_BOT_TOKEN', '') ?? ''
    ).trim();
    return {
      component: 'telegram',
      status: 'up',
      detail: {
        cryptoNews: crypto ? 'configured' : 'missing',
        threads: threads ? 'configured' : 'missing',
      },
    };
  }
}
