import { Injectable } from '@nestjs/common';
import { ScheduledAd } from '../../domain/scheduled-ad.entity';
import {
  ScheduledAdDispatcherPort,
  type ScheduledAdDispatchResult,
} from '../../domain/ports/scheduled-ad-dispatcher.port';
import type { SchedulingTarget } from '../../domain/scheduling-target';

export interface DispatchedSchedulingPost {
  readonly adId: string;
  readonly target: SchedulingTarget;
  readonly at: Date;
  readonly messageId: number;
}

/**
 * In-memory `ScheduledAdDispatcherPort` — the LIVE binding until
 * todo 7 binds the real Bot API adapters (C2). Records every publish
 * per target so per-target rotation specs assert independently;
 * `failNextWith` arms one transient failure (test double only).
 */
@Injectable()
export class InMemoryScheduledAdDispatcher extends ScheduledAdDispatcherPort {
  private readonly sent: DispatchedSchedulingPost[] = [];
  private nextMessageId = 1;
  private armedFailure: string | null = null;

  public failNextWith(error: string): void {
    this.armedFailure = error;
  }

  public published(): ReadonlyArray<DispatchedSchedulingPost> {
    return [...this.sent];
  }

  public publishedTo(
    target: SchedulingTarget,
  ): ReadonlyArray<DispatchedSchedulingPost> {
    return this.sent.filter((entry) => entry.target === target);
  }

  public async publish(
    ad: ScheduledAd,
    target: SchedulingTarget,
  ): Promise<ScheduledAdDispatchResult> {
    if (this.armedFailure !== null) {
      const error = this.armedFailure;
      this.armedFailure = null;
      return { ok: false, messageId: null, error };
    }
    const messageId = this.nextMessageId;
    this.nextMessageId += 1;
    this.sent.push({ adId: ad.id, target, at: new Date(), messageId });
    return { ok: true, messageId, error: null };
  }
}
