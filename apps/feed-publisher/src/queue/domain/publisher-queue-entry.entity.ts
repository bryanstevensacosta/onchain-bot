import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import {
  ContentTypeVo,
  type ContentType,
} from 'shared/value-objects/content-type.vo';
import { ContentQueuedEvent } from 'shared/events/content.events';
import {
  isTerminalQueueStatus,
  type PublisherQueueStatus,
} from './publisher-queue-status';

export interface DuplicateReference {
  readonly channelId?: string | null;
  readonly messageId?: number | null;
  readonly entryId?: string | null;
}

export interface GeneratedPublishData {
  readonly content?: string | null;
}

interface PublisherQueueEntryProps {
  readonly contentType: ContentType;
  readonly channelId: string;
  readonly messageId: number;
  readonly rawContent: string;
  readonly rawTitle: string | null;
  readonly imagePaths: string[];
  readonly groupedId: string | null;
  readonly messageReceivedAt: Date;
  readonly queuedAt: Date;
  readonly matchedKeywordIds: string[];
  readonly keywordTemplateId: string | null;
  status: PublisherQueueStatus;
  attempts: number;
  publishedAt: Date | null;
  telegramMessageId: string | null;
  generatedContent: string | null;
  lastError: string | null;
  blockedReason: string | null;
  duplicateOfChannelId: string | null;
  duplicateOfMessageId: number | null;
  duplicateOfEntryId: string | null;
}

/**
 * PublisherQueueEntry aggregate (moved from backend feed-publisher,
 * todo 4; unified with the `contentType` discriminator).
 *
 * State machine: PENDING -> SCHEDULED -> PUBLISHING -> PUBLISHED, with
 * -> FAILED and -> BLOCKED (dedup) terminals from PENDING/SCHEDULED/
 * PUBLISHING, plus PUBLISHING -> PENDING (`releaseToPending`) for retries
 * that must not lose the attempt count. FK-less by design (no FK into the
 * ingestion store); threads rows flow through the same table in todo 8.
 */
export class PublisherQueueEntry extends AggregateRoot<string> {
  private state: PublisherQueueEntryProps;

  protected constructor(id: string, props: PublisherQueueEntryProps) {
    super(id);
    this.state = props;
  }

  public static create(input: {
    id?: string;
    contentType: string;
    channelId: string;
    messageId: number;
    rawContent: string;
    rawTitle?: string | null;
    imagePaths?: string[];
    groupedId?: string | null;
    messageReceivedAt?: Date;
    queuedAt?: Date;
    matchedKeywordIds?: string[];
    keywordTemplateId?: string | null;
  }): PublisherQueueEntry {
    const contentType = ContentTypeVo.from(input.contentType).raw;
    if (typeof input.channelId !== 'string' || input.channelId.length === 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'PublisherQueueEntry requires a non-empty channelId',
      );
    }
    if (!Number.isFinite(input.messageId) || input.messageId < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'PublisherQueueEntry requires a finite messageId >= 0',
        { messageId: input.messageId },
      );
    }
    if (input.rawContent === null || input.rawContent === undefined) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'PublisherQueueEntry requires non-null rawContent',
      );
    }
    const id =
      input.id ??
      `${contentType}:${input.channelId}:${input.messageId}`.toLowerCase();
    const entry = new PublisherQueueEntry(id, {
      contentType,
      channelId: input.channelId,
      messageId: input.messageId,
      rawContent: input.rawContent,
      rawTitle: input.rawTitle ?? null,
      imagePaths: [...(input.imagePaths ?? [])],
      groupedId: input.groupedId ?? null,
      messageReceivedAt: input.messageReceivedAt ?? new Date(),
      queuedAt: input.queuedAt ?? new Date(),
      matchedKeywordIds: [...(input.matchedKeywordIds ?? [])],
      keywordTemplateId: input.keywordTemplateId ?? null,
      status: 'PENDING',
      attempts: 0,
      publishedAt: null,
      telegramMessageId: null,
      generatedContent: null,
      lastError: null,
      blockedReason: null,
      duplicateOfChannelId: null,
      duplicateOfMessageId: null,
      duplicateOfEntryId: null,
    });
    entry.addEvent(new ContentQueuedEvent(id, contentType));
    return entry;
  }

  public static reconstitute(input: {
    id: string;
    contentType: string;
    channelId: string;
    messageId: number;
    rawContent: string;
    rawTitle?: string | null;
    imagePaths?: string[];
    groupedId?: string | null;
    messageReceivedAt?: Date;
    queuedAt?: Date;
    matchedKeywordIds?: string[];
    keywordTemplateId?: string | null;
    status?: PublisherQueueStatus;
    attempts?: number;
    publishedAt?: Date | null;
    telegramMessageId?: string | null;
    generatedContent?: string | null;
    lastError?: string | null;
    blockedReason?: string | null;
    duplicateOfChannelId?: string | null;
    duplicateOfMessageId?: number | null;
    duplicateOfEntryId?: string | null;
  }): PublisherQueueEntry {
    const contentType = ContentTypeVo.from(input.contentType).raw;
    return new PublisherQueueEntry(input.id, {
      contentType,
      channelId: input.channelId,
      messageId: input.messageId,
      rawContent: input.rawContent,
      rawTitle: input.rawTitle ?? null,
      imagePaths: [...(input.imagePaths ?? [])],
      groupedId: input.groupedId ?? null,
      messageReceivedAt: input.messageReceivedAt ?? new Date(),
      queuedAt: input.queuedAt ?? new Date(),
      matchedKeywordIds: [...(input.matchedKeywordIds ?? [])],
      keywordTemplateId: input.keywordTemplateId ?? null,
      status: input.status ?? 'PENDING',
      attempts: input.attempts ?? 0,
      publishedAt: input.publishedAt ?? null,
      telegramMessageId: input.telegramMessageId ?? null,
      generatedContent: input.generatedContent ?? null,
      lastError: input.lastError ?? null,
      blockedReason: input.blockedReason ?? null,
      duplicateOfChannelId: input.duplicateOfChannelId ?? null,
      duplicateOfMessageId: input.duplicateOfMessageId ?? null,
      duplicateOfEntryId: input.duplicateOfEntryId ?? null,
    });
  }

  public get contentType(): ContentType {
    return this.state.contentType;
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

  public get imagePaths(): ReadonlyArray<string> {
    return [...this.state.imagePaths];
  }

  public get groupedId(): string | null {
    return this.state.groupedId;
  }

  public get messageReceivedAt(): Date {
    return this.state.messageReceivedAt;
  }

  public get queuedAt(): Date {
    return this.state.queuedAt;
  }

  public get matchedKeywordIds(): ReadonlyArray<string> {
    return [...this.state.matchedKeywordIds];
  }

  public get keywordTemplateId(): string | null {
    return this.state.keywordTemplateId;
  }

  public get status(): PublisherQueueStatus {
    return this.state.status;
  }

  public get attempts(): number {
    return this.state.attempts;
  }

  public get publishedAt(): Date | null {
    return this.state.publishedAt;
  }

  public get telegramMessageId(): string | null {
    return this.state.telegramMessageId;
  }

  public get generatedContent(): string | null {
    return this.state.generatedContent;
  }

  public get lastError(): string | null {
    return this.state.lastError;
  }

  public get blockedReason(): string | null {
    return this.state.blockedReason;
  }

  public get duplicateOfChannelId(): string | null {
    return this.state.duplicateOfChannelId;
  }

  public get duplicateOfMessageId(): number | null {
    return this.state.duplicateOfMessageId;
  }

  public get duplicateOfEntryId(): string | null {
    return this.state.duplicateOfEntryId;
  }

  public isTerminal(): boolean {
    return isTerminalQueueStatus(this.state.status);
  }

  public markScheduled(at: Date = new Date()): void {
    this.assertTransition('SCHEDULED', ['PENDING']);
    this.state.status = 'SCHEDULED';
    void at;
  }

  public markPublishing(): void {
    this.assertTransition('PUBLISHING', ['PENDING', 'SCHEDULED']);
    this.state.status = 'PUBLISHING';
  }

  public markPublished(
    telegramMessageId: string,
    generated?: GeneratedPublishData,
  ): void {
    this.assertTransition('PUBLISHED', ['PENDING', 'SCHEDULED', 'PUBLISHING']);
    this.state.status = 'PUBLISHED';
    this.state.telegramMessageId = telegramMessageId;
    this.state.generatedContent = generated?.content ?? null;
    this.state.publishedAt = new Date();
    this.state.lastError = null;
  }

  public markFailed(reason: string): void {
    this.assertTransition('FAILED', ['PENDING', 'SCHEDULED', 'PUBLISHING']);
    this.state.status = 'FAILED';
    this.state.lastError = reason;
  }

  public markBlocked(reason: string, duplicateOf?: DuplicateReference): void {
    this.assertTransition('BLOCKED', ['PENDING', 'SCHEDULED', 'PUBLISHING']);
    this.state.status = 'BLOCKED';
    this.state.blockedReason = reason;
    this.state.duplicateOfChannelId = duplicateOf?.channelId ?? null;
    this.state.duplicateOfMessageId = duplicateOf?.messageId ?? null;
    this.state.duplicateOfEntryId = duplicateOf?.entryId ?? null;
  }

  public incrementAttempts(): void {
    if (this.isTerminal()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Cannot increment attempts on terminal entry (${this.state.status})`,
      );
    }
    this.state.attempts += 1;
  }

  public releaseToPending(): void {
    this.assertTransition('PENDING', ['PUBLISHING']);
    this.state.status = 'PENDING';
  }

  private assertTransition(
    to: PublisherQueueStatus,
    from: ReadonlyArray<PublisherQueueStatus>,
  ): void {
    if (this.isTerminal()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Cannot transition terminal entry from ${this.state.status} to ${to}`,
      );
    }
    if (!from.includes(this.state.status)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Illegal queue transition from ${this.state.status} to ${to} (allowed from: ${from.join(', ')})`,
      );
    }
  }
}
