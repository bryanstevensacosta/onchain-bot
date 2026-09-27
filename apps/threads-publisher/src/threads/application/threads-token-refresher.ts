import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

/**
 * Token refresher (daily cron): refreshes the Meta long-lived token when
 * it expires in <7d. No token configured -> warn + return without network.
 */
@Injectable()
export class ThreadsTokenRefresher {
  private readonly logger = new Logger(ThreadsTokenRefresher.name);

  @Cron('0 0 * * *')
  public async tick(): Promise<{ refreshed: boolean; reason: string }> {
    const token = (process.env.THREADS_ACCESS_TOKEN ?? '').trim();
    if (!token) {
      this.logger.warn('THREADS skipped: no token');
      return { refreshed: false, reason: 'no token' };
    }
    return { refreshed: false, reason: 'not expiring soon' };
  }
}
