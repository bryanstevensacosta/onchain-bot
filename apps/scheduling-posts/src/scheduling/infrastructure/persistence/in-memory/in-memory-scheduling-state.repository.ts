import { Injectable } from '@nestjs/common';
import { SchedulingState } from '../../../domain/scheduling-state.entity';
import { SchedulingStateRepository } from '../../../domain/ports/scheduling-state.repository';
import type { SchedulingTarget } from '../../../domain/scheduling-target';

/**
 * In-memory `SchedulingStateRepository` — the LIVE binding until
 * GAP-1. Single row (`id = 1`); lazily seeded empty.
 */
@Injectable()
export class InMemorySchedulingStateRepository extends SchedulingStateRepository {
  private current: SchedulingState | null = null;

  public async load(): Promise<SchedulingState> {
    if (!this.current) {
      this.current = SchedulingState.empty();
    }
    return this.current;
  }

  public async save(state: SchedulingState): Promise<void> {
    this.current = state;
  }

  public async resetPostsSinceLastAd(): Promise<void> {
    const state = await this.load();
    this.current = state.resetPostsSinceLastAd();
  }

  public async markPublished(
    target: SchedulingTarget,
    adId: string,
    at: Date,
  ): Promise<void> {
    const state = await this.load();
    this.current = state.markPublished(target, adId, at);
  }
}
