/**
 * DedupRecord domain entity.
 *
 * Represents a deduplication record for crypto news messages.
 * This is a plain domain entity (NOT TypeORM) following the entity pattern.
 */

import { Entity } from 'shared/kernel/entity';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { Fingerprint } from 'shared/deduplication/domain/value-objects/fingerprint.vo';

export interface DedupRecordProps {
  readonly id: string;
  readonly fingerprint: Fingerprint;
  readonly source: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly urlsHashes: readonly string[];
  readonly tokens: readonly string[];
  readonly numbers: readonly number[];
  readonly entities: readonly string[];
  readonly cashtags: readonly string[];
  readonly embedding: readonly number[] | null;
  readonly referencedEntryId: string | null;
  readonly referencedChannelId: string | null;
  readonly referencedMessageId: number | null;
  readonly createdAt: Date;
}

/**
 * Domain entity for deduplication records.
 *
 * Stores fingerprints and metadata for crypto news deduplication.
 */
export class DedupRecord extends Entity<string> {
  private constructor(
    id: string,
    private readonly props: DedupRecordProps,
  ) {
    super(id);
  }

  /**
   * Factory: create a new dedup record with validation.
   */
  public static create(input: {
    id?: string;
    fingerprint: Fingerprint;
    source: string;
    channelId: string;
    messageId: number;
    urlsHashes?: readonly string[];
    tokens?: readonly string[];
    numbers?: readonly number[];
    entities?: readonly string[];
    cashtags?: readonly string[];
    embedding?: readonly number[] | null;
    referencedEntryId?: string | null;
    referencedChannelId?: string | null;
    referencedMessageId?: number | null;
    createdAt?: Date;
  }): DedupRecord {
    // Validate fingerprint is required
    if (!input.fingerprint || !(input.fingerprint instanceof Fingerprint)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'DedupRecord fingerprint is required and must be a Fingerprint instance',
      );
    }

    // Validate source is required and non-empty
    if (
      !input.source ||
      typeof input.source !== 'string' ||
      !input.source.trim()
    ) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'DedupRecord source cannot be empty',
      );
    }

    // Validate channelId is required and non-empty
    if (
      !input.channelId ||
      typeof input.channelId !== 'string' ||
      !input.channelId.trim()
    ) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'DedupRecord channelId cannot be empty',
      );
    }

    // Validate messageId is required and positive integer
    if (
      input.messageId === undefined ||
      input.messageId === null ||
      !Number.isInteger(input.messageId) ||
      input.messageId < 0
    ) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'DedupRecord messageId must be a non-negative integer',
        { messageId: input.messageId },
      );
    }

    const id = input.id ?? crypto.randomUUID();
    const createdAt = input.createdAt ?? new Date();

    return new DedupRecord(id, {
      id,
      fingerprint: input.fingerprint,
      source: input.source.trim(),
      channelId: input.channelId.trim(),
      messageId: input.messageId,
      urlsHashes: input.urlsHashes ?? [],
      tokens: input.tokens ?? [],
      numbers: input.numbers ?? [],
      entities: input.entities ?? [],
      cashtags: input.cashtags ?? [],
      embedding: input.embedding ?? null,
      referencedEntryId: input.referencedEntryId ?? null,
      referencedChannelId: input.referencedChannelId ?? null,
      referencedMessageId: input.referencedMessageId ?? null,
      createdAt,
    });
  }

  /**
   * Rehydrate from persistence without validation (use the persisted
   * shape as-is).
   */
  public static reconstitute(props: DedupRecordProps): DedupRecord {
    if (!props.id) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'DedupRecord reconstitute requires id',
      );
    }
    return new DedupRecord(props.id, props);
  }

  // Getters

  public get fingerprint(): Fingerprint {
    return this.props.fingerprint;
  }

  public get source(): string {
    return this.props.source;
  }

  public get channelId(): string {
    return this.props.channelId;
  }

  public get messageId(): number {
    return this.props.messageId;
  }

  public get urlsHashes(): readonly string[] {
    return this.props.urlsHashes;
  }

  public get tokens(): readonly string[] {
    return this.props.tokens;
  }

  public get numbers(): readonly number[] {
    return this.props.numbers;
  }

  public get entities(): readonly string[] {
    return this.props.entities;
  }

  public get cashtags(): readonly string[] {
    return this.props.cashtags;
  }

  public get embedding(): readonly number[] | null {
    return this.props.embedding;
  }

  public get referencedEntryId(): string | null {
    return this.props.referencedEntryId;
  }

  public get referencedChannelId(): string | null {
    return this.props.referencedChannelId;
  }

  public get referencedMessageId(): number | null {
    return this.props.referencedMessageId;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }
}
