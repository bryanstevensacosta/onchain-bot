import { DomainEvent } from '../../../shared/kernel/domain-event';

export interface PublishingJobPayload {
  readonly jobId: string;
  readonly templateId: string;
  readonly mentionId: string;
  readonly channelTarget: string;
  readonly telegramMessageId: number | null;
  readonly reason: string | null;
}

/**
 * Publishing outcome events (backend wire names kept:
 * `publishing.telegram.published|failed`). Emitted by `PublishingJob`
 * finalization; returned directly by the publish use-cases (fix-1 — no bus
 * wired yet, same pattern as the rest of the pipeline).
 */
export class PublishingJobPublishedEvent extends DomainEvent {
  public readonly payload: PublishingJobPayload;

  public constructor(payload: PublishingJobPayload) {
    super('publishing.telegram.published', payload.jobId);
    this.payload = Object.freeze({ ...payload });
  }

  public toPayload(): Record<string, unknown> {
    return { ...this.payload };
  }
}

export class PublishingJobFailedEvent extends DomainEvent {
  public readonly payload: PublishingJobPayload;

  public constructor(payload: PublishingJobPayload) {
    super('publishing.telegram.failed', payload.jobId);
    this.payload = Object.freeze({ ...payload });
  }

  public toPayload(): Record<string, unknown> {
    return { ...this.payload };
  }
}
