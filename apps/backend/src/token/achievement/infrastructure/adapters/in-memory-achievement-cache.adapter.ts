import { Injectable } from '@nestjs/common';
import { AchievementCachePort } from '../../application/ports/achievement-cache.port';

@Injectable()
export class InMemoryAchievementCacheAdapter extends AchievementCachePort {
  private store: Map<string, Set<number>> = new Map();

  async getNotifiedThresholds(callId: string): Promise<Set<number>> {
    return new Set(this.store.get(callId) ?? []);
  }

  async addNotifiedThreshold(callId: string, threshold: number): Promise<void> {
    const set = this.store.get(callId) ?? new Set<number>();
    set.add(threshold);
    this.store.set(callId, set);
  }

  async invalidateCall(callId: string): Promise<void> {
    this.store.delete(callId);
  }
}
