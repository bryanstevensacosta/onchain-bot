import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';

const MIN_PHRASE_LENGTH = 1;
const MAX_PHRASE_LENGTH = 200;

interface BlacklistPhraseProps {
  readonly phrase: string;
  readonly caseSensitive: boolean;
  sourceChannelIds: string[];
  enabled: boolean;
  readonly createdAt: Date;
}

/**
 * Aggregate root: a single user-defined blacklist phrase used by the
 * crypto-news-publisher BC to block incoming crypto-news messages.
 *
 * The blacklist phrase owns no invariants beyond phrase shape; it acts
 * as a value-bearing aggregate that participates in the match-and-block
 * pipeline. Domain events on this aggregate are intentionally minimal.
 */
export class BlacklistPhrase extends AggregateRoot<string> {
  private state: BlacklistPhraseProps;

  protected constructor(id: string, props: BlacklistPhraseProps) {
    super(id);
    this.state = props;
  }

  /**
   * Factory: validate the input shape and build a fresh blacklist phrase
   * aggregate. Phrase is trimmed and length-bounded.
   */
  public static create(input: {
    id?: string;
    phrase: string;
    caseSensitive?: boolean;
    sourceChannelIds?: string[];
    enabled?: boolean;
    createdAt?: Date;
  }): BlacklistPhrase {
    if (input.phrase === null || input.phrase === undefined) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'BlacklistPhrase phrase cannot be null/undefined',
      );
    }
    if (typeof input.phrase !== 'string') {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'BlacklistPhrase phrase must be a string',
      );
    }
    const trimmed = input.phrase.trim();
    if (trimmed.length < MIN_PHRASE_LENGTH) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'BlacklistPhrase phrase cannot be empty',
        { phrase: input.phrase },
      );
    }
    if (trimmed.length > MAX_PHRASE_LENGTH) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `BlacklistPhrase phrase exceeds max length ${MAX_PHRASE_LENGTH}`,
        { length: trimmed.length, max: MAX_PHRASE_LENGTH },
      );
    }
    return new BlacklistPhrase(input.id ?? crypto.randomUUID(), {
      phrase: trimmed,
      caseSensitive: input.caseSensitive ?? false,
      sourceChannelIds: input.sourceChannelIds ?? [],
      enabled: input.enabled ?? true,
      createdAt: input.createdAt ?? new Date(),
    });
  }

  /**
   * Rehydrate a blacklist phrase from persistence without re-running the
   * phrase-shape validations (use the persisted values as-is).
   */
  public static reconstitute(input: {
    id: string;
    phrase: string;
    caseSensitive: boolean;
    sourceChannelIds: string[];
    enabled: boolean;
    createdAt: Date;
  }): BlacklistPhrase {
    return new BlacklistPhrase(input.id, {
      phrase: input.phrase,
      caseSensitive: input.caseSensitive,
      sourceChannelIds: input.sourceChannelIds,
      enabled: input.enabled,
      createdAt: input.createdAt,
    });
  }

  public get phrase(): string {
    return this.state.phrase;
  }

  public get caseSensitive(): boolean {
    return this.state.caseSensitive;
  }

  public get sourceChannelIds(): string[] {
    return this.state.sourceChannelIds;
  }

  public get enabled(): boolean {
    return this.state.enabled;
  }

  public get createdAt(): Date {
    return this.state.createdAt;
  }

  /**
   * Test whether the supplied content contains the blacklist phrase.
   *
   * - Case-insensitive phrases lower-case both sides.
   * - Substring match: `phrase in content` (NOT word-bounded).
   *
   * Returns `false` for empty content.
   */
  public matches(content: string): boolean {
    if (!content || content.length === 0) {
      return false;
    }
    if (this.state.caseSensitive) {
      return content.includes(this.state.phrase);
    }
    return content.toLowerCase().includes(this.state.phrase.toLowerCase());
  }

  /**
   * Test whether this blacklist phrase is applicable to the given channel.
   * Returns true if sourceChannelIds is empty (applies to all channels)
   * or if the channelId is in the sourceChannelIds list.
   */
  public isApplicableTo(channelId: string): boolean {
    if (this.state.sourceChannelIds.length === 0) {
      return true;
    }
    return this.state.sourceChannelIds.includes(channelId);
  }

  public enable(): void {
    this.state.enabled = true;
  }

  public disable(): void {
    this.state.enabled = false;
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
