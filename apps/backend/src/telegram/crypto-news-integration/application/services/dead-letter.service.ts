import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { DeadLetterQueueRepository } from 'telegram/crypto-news-integration/application/ports/dead-letter-queue.repository';
import { DeadLetterQueueEntry } from 'telegram/crypto-news-integration/domain/entities/dead-letter-queue-entry.entity';
import { EnqueueMatchingMessageUseCase } from 'telegram/crypto-news-publisher/application/handlers/enqueue-matching-message.use-case';

export interface CaptureDeadLetterInput {
  readonly channelId: string;
  readonly messageId: number;
  readonly failureReason: string;
  readonly failedPayload?: unknown;
}

/**
 * DeadLetterService — manual on-demand dead-letter queue for crypto-news.
 *
 * - `capture()` persists a PENDING row for every failed message and NEVER
 *   throws (a DLQ outage must never break the SSE stream).
 * - `list()` returns entries newest-first for the operator view.
 * - `retry(id)` re-enqueues a PENDING entry via
 *   `EnqueueMatchingMessageUseCase` and marks it RETRIED. Unknown id →
 *   NotFoundException (404). There is NO automatic retry anywhere.
 */
@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  public constructor(
    private readonly repo: DeadLetterQueueRepository,
    private readonly enqueueUseCase: EnqueueMatchingMessageUseCase,
  ) {}

  /**
   * Capture a failed message as PENDING. Never throws — all failures
   * (validation, persistence, anything) are logged and swallowed so the
   * SSE stream stays sacred.
   */
  public async capture(input: CaptureDeadLetterInput): Promise<void> {
    try {
      const entry = DeadLetterQueueEntry.create({
        channelId: input.channelId,
        messageId: input.messageId,
        failureReason: input.failureReason,
        failedPayload: safeStringify(input.failedPayload),
      });
      await this.repo.save(entry);
    } catch (error) {
      this.logger.error(
        `Failed to capture dead-letter ${input?.channelId}:${input?.messageId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      // Swallowed by design — DLQ outage must never break SSE.
    }
  }

  public async list(limit = 50): Promise<ReadonlyArray<DeadLetterQueueEntry>> {
    return this.repo.findAll(limit);
  }

  /**
   * Manual on-demand retry: load a PENDING entry, re-enqueue its payload,
   * mark RETRIED (retryCount + 1) and persist.
   *
   * @throws NotFoundException when the id is unknown (→ 404).
   * @throws ConflictException when the entry is not PENDING.
   */
  public async retry(id: string): Promise<DeadLetterQueueEntry> {
    const entry = await this.repo.findById(id);
    if (!entry) {
      throw new NotFoundException(`Dead-letter entry ${id} not found`);
    }
    if (entry.status !== 'PENDING') {
      throw new ConflictException(
        `Dead-letter entry ${id} is ${entry.status} (only PENDING can be retried)`,
      );
    }
    await this.enqueueUseCase.execute({
      message: rebuildEnqueueMessage(entry),
    });
    entry.markRetried();
    await this.repo.save(entry);
    return entry;
  }
}

/**
 * Best-effort JSON snapshot of the failed payload. Never throws:
 * circular structures fall back to a type marker.
 */
function safeStringify(payload: unknown): string | null {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload);
  } catch {
    try {
      return `[unserializable ${typeof payload} payload]`;
    } catch {
      return null;
    }
  }
}

/**
 * Rebuild the enqueue DTO from the stored JSON snapshot. Unknown or
 * malformed payloads degrade to a minimal valid shape (channel + message
 * + empty content + no media) so the operator can always retry.
 */
function rebuildEnqueueMessage(entry: DeadLetterQueueEntry): {
  channelId: string;
  messageId: number;
  content: string;
  publishedAt: Date;
  ingestedAt: Date;
  media: [];
  groupedId: string | null;
  matchedKeywords: [];
} {
  const now = new Date();
  const fallback = {
    channelId: entry.channelId,
    messageId: entry.messageId,
    content: '',
    publishedAt: now,
    ingestedAt: now,
    media: [] as [],
    groupedId: null as string | null,
    matchedKeywords: [] as [],
  };
  const raw = entry.failedPayload;
  if (!raw) return fallback;
  let parsed: Record<string, unknown>;
  try {
    parsed =
      typeof raw === 'string'
        ? (JSON.parse(raw) as Record<string, unknown>)
        : raw;
  } catch {
    return fallback;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return fallback;
  }
  const pick = (keys: string[]): unknown => {
    for (const k of keys) {
      const v = parsed[k];
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  };
  const content = pick(['content', 'rawContent', 'text']);
  const toDate = (v: unknown): Date => {
    if (v instanceof Date && !isNaN(v.getTime())) return v;
    if (typeof v === 'string' || typeof v === 'number') {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d;
    }
    return now;
  };
  return {
    channelId: entry.channelId,
    messageId: entry.messageId,
    content: typeof content === 'string' ? content : '',
    publishedAt: toDate(pick(['publishedAt'])),
    ingestedAt: toDate(pick(['ingestedAt'])),
    media: [],
    groupedId:
      typeof parsed['groupedId'] === 'string' ? parsed['groupedId'] : null,
    matchedKeywords: [],
  };
}
