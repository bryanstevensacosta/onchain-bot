import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import {
  Fingerprint,
  type FingerprintType,
} from '../value-objects/fingerprint.vo';

interface DedupRecordProps {
  readonly fingerprintType: FingerprintType;
  readonly fingerprintValue: string;
  readonly source: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly contentHash: string | null;
  readonly urlHashes: string[];
  readonly tokens: string[];
  readonly numbers: number[];
  readonly entities: string[];
  readonly cashtags: string[];
  readonly content: string | null;
  readonly embedding: number[] | null;
  readonly referencedEntryId: string | null;
  readonly createdAt: Date;
}

/**
 * DedupRecord aggregate (moved from backend shared/deduplication, todo 4).
 *
 * One row per fingerprint (storage decision: plain table
 * `dedup_fingerprints`, NO pgvector — vetoable in review). The content-kind
 * row carries the embedding + extracted signals used by the semantic stage;
 * url-kind rows carry one normalized URL each.
 */
export class DedupRecord extends AggregateRoot<string> {
  private state: DedupRecordProps;

  protected constructor(id: string, props: DedupRecordProps) {
    super(id);
    this.state = props;
  }

  public static create(input: {
    id?: string;
    fingerprint: Fingerprint;
    source: string;
    channelId: string;
    messageId: number;
    contentHash?: string | null;
    urlHashes?: string[];
    tokens?: string[];
    numbers?: number[];
    entities?: string[];
    cashtags?: string[];
    content?: string | null;
    embedding?: number[] | null;
    referencedEntryId?: string | null;
    createdAt?: Date;
  }): DedupRecord {
    if (!(input.fingerprint instanceof Fingerprint)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'DedupRecord requires a Fingerprint instance',
      );
    }
    if (typeof input.source !== 'string' || input.source.length === 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'DedupRecord requires a non-empty source',
      );
    }
    if (typeof input.channelId !== 'string' || input.channelId.length === 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'DedupRecord requires a non-empty channelId',
      );
    }
    if (!Number.isInteger(input.messageId) || input.messageId < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'DedupRecord requires an integer messageId >= 0',
        { messageId: input.messageId },
      );
    }
    const id =
      input.id ??
      `${input.fingerprint.type}:${input.fingerprint.value}:${input.source}`;
    return new DedupRecord(id, {
      fingerprintType: input.fingerprint.type,
      fingerprintValue: input.fingerprint.value,
      source: input.source,
      channelId: input.channelId,
      messageId: input.messageId,
      contentHash: input.contentHash ?? null,
      urlHashes: [...(input.urlHashes ?? [])],
      tokens: [...(input.tokens ?? [])],
      numbers: [...(input.numbers ?? [])],
      entities: [...(input.entities ?? [])],
      cashtags: [...(input.cashtags ?? [])],
      content: input.content ?? null,
      embedding: input.embedding ? [...input.embedding] : null,
      referencedEntryId: input.referencedEntryId ?? null,
      createdAt: input.createdAt ?? new Date(),
    });
  }

  public static reconstitute(input: {
    id: string;
    fingerprintType: FingerprintType;
    fingerprintValue: string;
    source: string;
    channelId: string;
    messageId: number;
    contentHash?: string | null;
    urlHashes?: string[];
    tokens?: string[];
    numbers?: number[];
    entities?: string[];
    cashtags?: string[];
    content?: string | null;
    embedding?: number[] | null;
    referencedEntryId?: string | null;
    createdAt?: Date;
  }): DedupRecord {
    return new DedupRecord(input.id, {
      fingerprintType: input.fingerprintType,
      fingerprintValue: input.fingerprintValue,
      source: input.source,
      channelId: input.channelId,
      messageId: input.messageId,
      contentHash: input.contentHash ?? null,
      urlHashes: [...(input.urlHashes ?? [])],
      tokens: [...(input.tokens ?? [])],
      numbers: [...(input.numbers ?? [])],
      entities: [...(input.entities ?? [])],
      cashtags: [...(input.cashtags ?? [])],
      content: input.content ?? null,
      embedding: input.embedding ? [...input.embedding] : null,
      referencedEntryId: input.referencedEntryId ?? null,
      createdAt: input.createdAt ?? new Date(),
    });
  }

  public get fingerprintType(): FingerprintType {
    return this.state.fingerprintType;
  }

  public get fingerprintValue(): string {
    return this.state.fingerprintValue;
  }

  public get source(): string {
    return this.state.source;
  }

  public get channelId(): string {
    return this.state.channelId;
  }

  public get messageId(): number {
    return this.state.messageId;
  }

  public get contentHash(): string | null {
    return this.state.contentHash;
  }

  public get urlHashes(): ReadonlyArray<string> {
    return [...this.state.urlHashes];
  }

  public get tokens(): ReadonlyArray<string> {
    return [...this.state.tokens];
  }

  public get numbers(): ReadonlyArray<number> {
    return [...this.state.numbers];
  }

  public get entities(): ReadonlyArray<string> {
    return [...this.state.entities];
  }

  public get cashtags(): ReadonlyArray<string> {
    return [...this.state.cashtags];
  }

  public get content(): string | null {
    return this.state.content;
  }

  public get embedding(): ReadonlyArray<number> | null {
    return this.state.embedding ? [...this.state.embedding] : null;
  }

  public get referencedEntryId(): string | null {
    return this.state.referencedEntryId;
  }

  public get createdAt(): Date {
    return this.state.createdAt;
  }

  public fingerprint(): Fingerprint {
    return Fingerprint.of(
      this.state.fingerprintType,
      this.state.fingerprintValue,
    );
  }
}
