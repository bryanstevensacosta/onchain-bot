import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from 'shared/common/cache/redis.service';
import { MilestoneCachePort } from '../../application/ports/milestone-cache.port';

@Injectable()
export class RedisMilestoneCacheAdapter extends MilestoneCachePort {
  private readonly logger = new Logger(RedisMilestoneCacheAdapter.name);
  private static readonly KEY_PREFIX = 'milestone:notified:';
  private static readonly TTL_SECONDS = 60 * 60 * 24 * 30;

  constructor(private readonly redis: RedisService) {
    super();
  }

  async getNotifiedThresholds(callId: string): Promise<Set<number>> {
    if (!this.redis.isEnabled()) {
      return new Set();
    }
    try {
      const key = this.keyFor(callId);
      const members = await this.redis.getClient().smembers(key);
      return new Set(
        members.map((m) => parseFloat(m)).filter((n) => Number.isFinite(n)),
      );
    } catch (err) {
      this.logger.warn(
        `Redis get failed for ${callId}: ${(err as Error).message}`,
      );
      return new Set();
    }
  }

  async addNotifiedThreshold(callId: string, threshold: number): Promise<void> {
    if (!this.redis.isEnabled()) return;
    try {
      const key = this.keyFor(callId);
      const client = this.redis.getClient();
      await client.sadd(key, String(threshold));
      await client.expire(key, RedisMilestoneCacheAdapter.TTL_SECONDS);
    } catch (err) {
      this.logger.warn(
        `Redis add failed for ${callId}/${threshold}: ${(err as Error).message}`,
      );
    }
  }

  async invalidateCall(callId: string): Promise<void> {
    if (!this.redis.isEnabled()) return;
    try {
      await this.redis.getClient().del(this.keyFor(callId));
    } catch (err) {
      this.logger.warn(
        `Redis del failed for ${callId}: ${(err as Error).message}`,
      );
    }
  }

  private keyFor(callId: string): string {
    return `${RedisMilestoneCacheAdapter.KEY_PREFIX}${callId}`;
  }
}
