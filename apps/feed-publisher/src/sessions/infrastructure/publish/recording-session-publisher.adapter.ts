import { Injectable } from '@nestjs/common';
import {
  SessionPublisherPort,
  type SessionPublishPlan,
} from '../../application/ports/session-publisher.port';

/**
 * Recording session publisher (live binding, todo 12).
 *
 * Keeps every routed plan in memory for dashboard visibility and
 * tests. The Bot API binding is a follow-up: resolve the catalog token
 * per call and send via the telegram BC adapters (same per-call-token
 * shape as todo 7).
 */
@Injectable()
export class RecordingSessionPublisher extends SessionPublisherPort {
  private readonly sent: SessionPublishPlan[] = [];

  public async publish(plan: SessionPublishPlan): Promise<void> {
    this.sent.push(plan);
  }

  public delivered(): ReadonlyArray<SessionPublishPlan> {
    return [...this.sent];
  }

  public deliveredFor(sessionId: string): ReadonlyArray<SessionPublishPlan> {
    return this.sent.filter((plan) => plan.sessionId === sessionId);
  }

  public clear(): void {
    this.sent.length = 0;
  }
}
