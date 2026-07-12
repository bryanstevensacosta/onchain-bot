import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { ArticlePublishedEvent } from 'telegram/crypto-news-publisher/domain/events/article-published.event';

export type PublisherQueueStatus =
  | 'PENDING'
  | 'SCHEDULED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED';

const VALID_PUBLISH_TRANSITIONS = new Set<PublisherQueueStatus>([
  'PENDING',
  'SCHEDULED',
]);

export interface PublisherQueueEntryProps {
  readonly id: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly rawContent: string;
  readonly rawTitle: string | null;
  readonly imagePath: string | null;
  readonly imagePaths: string[];
  readonly groupedId: string | null;
  readonly messageReceivedAt: Date;
  /**
   * Captured at enqueue time: the `PromptTemplate.id` that the
   * matched keyword was bound to, or `null` when the keyword has no
   * override (the LLM adapter falls back to
   * `LlmConfig.defaultTemplateId`). Frozen at enqueue so a later
   * keyword/template edit does not retroactively re-route an
   * already-queued entry — the entry's resolved template is the
   * contract with the queue's cron publisher.
   */
  readonly keywordTemplateId: string | null;
  status: PublisherQueueStatus;
  publishedAt: Date | null;
  telegramMessageId: string | null;
  lastError: string | null;
  attempts: number;
  /** LLM-generated refined post content. Set when the entry is published. */
  generatedContent: string | null;
  /** System prompt used when generating the refined post. */
  generatedSystemPrompt: string | null;
  /** User prompt (template rendered with entry data) sent to the LLM. */
  generatedUserPrompt: string | null;
  /** Temperature used when generating. */
  generatedTemperature: number | null;
  /** Reasoning effort used (low/medium/high/max). */
  generatedReasoningEffort: string | null;
  /** Model used when generating the post. */
  generatedModel: string | null;
}

/**
 * Aggregate root: a single message queued for publication to the
 * crypto-news output channel.
 *
 * Lifecycle:
 *   PENDING → SCHEDULED → PUBLISHING → PUBLISHED
 *                                    ↘ FAILED
 *
 * `markScheduled`, `markPublished` (and the failure path) only succeed
 * from PENDING or SCHEDULED; once PUBLISHED or FAILED the entry is
 * terminal. `incrementAttempts` may be called any number of times on
 * a PENDING/SCHEDULED entry to record LLM retries.
 *
 * `imagePath` is a LOCAL filesystem path (e.g.
 * `/uploads/crypto-news/media/<channelId>/<messageId>_0.jpg`). Telegram
 * CDN URLs expire after ~1h, but the local file persists across the
 * queue's delay window.
 */
export class PublisherQueueEntry extends AggregateRoot<string> {
  private state: PublisherQueueEntryProps;

  protected constructor(id: string, props: PublisherQueueEntryProps) {
    super(id);
    this.state = props;
  }

  /**
   * Factory: build a fresh PENDING queue entry from a matched crypto-news
   * message. The `id` is the unique queue identifier (not the source
   * Telegram message id — those live on `messageId`/`channelId`).
   */
  public static create(input: {
    id?: string;
    channelId: string;
    messageId: number;
    rawContent: string;
    rawTitle: string | null;
    imagePath?: string | null;
    imagePaths?: string[];
    groupedId: string | null;
    messageReceivedAt: Date;
    keywordTemplateId?: string | null;
  }): PublisherQueueEntry {
    if (!input.channelId?.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'PublisherQueueEntry channelId cannot be empty',
      );
    }
    if (!Number.isFinite(input.messageId) || input.messageId < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'PublisherQueueEntry messageId must be a non-negative number',
        { messageId: input.messageId },
      );
    }
    if (input.rawContent === null || input.rawContent === undefined) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'PublisherQueueEntry rawContent cannot be null/undefined',
      );
    }
    if (
      input.keywordTemplateId !== undefined &&
      input.keywordTemplateId !== null &&
      (typeof input.keywordTemplateId !== 'string' ||
        input.keywordTemplateId.trim().length === 0)
    ) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'PublisherQueueEntry keywordTemplateId, when provided, must be a non-empty string or null',
      );
    }
    const allPaths = input.imagePaths ?? [];
    const firstPath = input.imagePath ?? allPaths[0] ?? null;
    return new PublisherQueueEntry(input.id ?? crypto.randomUUID(), {
      id: input.id ?? crypto.randomUUID(),
      channelId: input.channelId,
      messageId: input.messageId,
      rawContent: input.rawContent,
      rawTitle: input.rawTitle,
      imagePath: firstPath,
      imagePaths: allPaths,
      groupedId: input.groupedId,
      messageReceivedAt: input.messageReceivedAt,
      keywordTemplateId: input.keywordTemplateId ?? null,
      status: 'PENDING',
      publishedAt: null,
      telegramMessageId: null,
      lastError: null,
      attempts: 0,
      generatedContent: null,
      generatedSystemPrompt: null,
      generatedUserPrompt: null,
      generatedTemperature: null,
      generatedReasoningEffort: null,
      generatedModel: null,
    });
  }

  /**
   * Rehydrate from persistence without validation (use the persisted
   * shape as-is).
   */
  public static reconstitute(
    props: PublisherQueueEntryProps,
  ): PublisherQueueEntry {
    return new PublisherQueueEntry(props.id, props);
  }

  public get id(): string {
    return this.state.id;
  }

  public get channelId(): string {
    return this.state.channelId;
  }

  public get messageId(): number {
    return this.state.messageId;
  }

  public get rawContent(): string {
    return this.state.rawContent;
  }

  public get rawTitle(): string | null {
    return this.state.rawTitle;
  }

  public get imagePath(): string | null {
    return this.state.imagePath;
  }

  public get imagePaths(): string[] {
    return this.state.imagePaths ?? [];
  }

  public get groupedId(): string | null {
    return this.state.groupedId;
  }

  public get keywordTemplateId(): string | null {
    return this.state.keywordTemplateId;
  }

  public get messageReceivedAt(): Date {
    return this.state.messageReceivedAt;
  }

  public get status(): PublisherQueueStatus {
    return this.state.status;
  }

  public get publishedAt(): Date | null {
    return this.state.publishedAt;
  }

  public get telegramMessageId(): string | null {
    return this.state.telegramMessageId;
  }

  public get lastError(): string | null {
    return this.state.lastError;
  }

  public get attempts(): number {
    return this.state.attempts;
  }

  public get generatedContent(): string | null {
    return this.state.generatedContent;
  }

  public get generatedSystemPrompt(): string | null {
    return this.state.generatedSystemPrompt;
  }

  public get generatedUserPrompt(): string | null {
    return this.state.generatedUserPrompt;
  }

  public get generatedTemperature(): number | null {
    return this.state.generatedTemperature;
  }

  public get generatedReasoningEffort(): string | null {
    return this.state.generatedReasoningEffort;
  }

  public get generatedModel(): string | null {
    return this.state.generatedModel;
  }

  public get isTerminal(): boolean {
    return this.state.status === 'PUBLISHED' || this.state.status === 'FAILED';
  }

  /**
   * Transition PENDING/SCHEDULED → SCHEDULED with the planned publish
   * time. The cron publisher uses this to record "I picked this entry
   * and will publish at <at>".
   */
  public markScheduled(at: Date): void {
    this.assertPublishTransition('markScheduled');
    this.state.status = 'SCHEDULED';
    void at;
  }

  /**
   * Transition PENDING/SCHEDULED → PUBLISHED. Records the Telegram-side
   * message id, publishedAt, and emits an `ArticlePublishedEvent`.
   */
  public markPublished(
    telegramMessageId: string,
    generated?: {
      content: string;
      systemPrompt: string | null;
      userPrompt: string | null;
      temperature: number | null;
      reasoningEffort: string | null;
      model?: string | null;
    },
  ): void {
    this.assertPublishTransition('markPublished');
    if (!telegramMessageId?.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'telegramMessageId cannot be empty',
        { id: this.state.id },
      );
    }
    const now = new Date();
    this.state.status = 'PUBLISHED';
    this.state.telegramMessageId = telegramMessageId;
    this.state.publishedAt = now;
    this.state.lastError = null;
    this.state.generatedContent = generated?.content ?? null;
    this.state.generatedSystemPrompt = generated?.systemPrompt ?? null;
    this.state.generatedUserPrompt = generated?.userPrompt ?? null;
    this.state.generatedTemperature = generated?.temperature ?? null;
    this.state.generatedReasoningEffort = generated?.reasoningEffort ?? null;
    this.state.generatedModel = generated?.model ?? null;
    this.apply(
      new ArticlePublishedEvent({
        channelId: this.state.channelId,
        messageId: this.state.messageId,
        telegramMessageId,
        publishedAt: now,
      }),
    );
  }

  /**
   * Transition PENDING/SCHEDULED → FAILED. Records the reason and
   * timestamp; terminal — no further transitions allowed.
   */
  public markFailed(reason: string): void {
    this.assertPublishTransition('markFailed');
    if (!reason?.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'failure reason cannot be empty',
        { id: this.state.id },
      );
    }
    this.state.status = 'FAILED';
    this.state.lastError = reason;
    this.state.publishedAt = new Date();
  }

  /**
   * Increment the LLM/POST attempt counter. Allowed on PENDING and
   * SCHEDULED entries. The caller is expected to enforce a max-attempts
   * cap based on config.
   */
  public incrementAttempts(): void {
    if (!VALID_PUBLISH_TRANSITIONS.has(this.state.status)) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `Cannot increment attempts: aggregate is in ${this.state.status} state (expected PENDING or SCHEDULED)`,
        { id: this.state.id, status: this.state.status },
      );
    }
    this.state.attempts += 1;
  }

  private assertPublishTransition(method: string): void {
    if (!VALID_PUBLISH_TRANSITIONS.has(this.state.status)) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `Cannot ${method}: aggregate is in ${this.state.status} state (expected PENDING or SCHEDULED)`,
        { id: this.state.id, status: this.state.status },
      );
    }
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
