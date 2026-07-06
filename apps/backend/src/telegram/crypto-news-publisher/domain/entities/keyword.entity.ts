import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';

const MIN_PHRASE_LENGTH = 1;
const MAX_PHRASE_LENGTH = 200;

interface KeywordProps {
  readonly phrase: string;
  readonly caseSensitive: boolean;
  enabled: boolean;
  readonly createdAt: Date;
}

/**
 * Aggregate root: a single user-defined keyword used by the
 * crypto-news-publisher BC to filter incoming crypto-news messages.
 *
 * The keyword itself owns no invariants beyond phrase shape; it acts
 * as a value-bearing aggregate that participates in the match-and-enqueue
 * pipeline. Domain events on this aggregate are intentionally minimal —
 * the publisher cares about the persisted state, not the lifecycle
 * history of each keyword.
 */
export class Keyword extends AggregateRoot<string> {
  private state: KeywordProps;

  protected constructor(id: string, props: KeywordProps) {
    super(id);
    this.state = props;
  }

  /**
   * Factory: validate the input shape and build a fresh keyword
   * aggregate. Phrase is trimmed and length-bounded.
   */
  public static create(input: {
    id?: string;
    phrase: string;
    caseSensitive?: boolean;
    enabled?: boolean;
    createdAt?: Date;
  }): Keyword {
    if (input.phrase === null || input.phrase === undefined) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'Keyword phrase cannot be null/undefined',
      );
    }
    if (typeof input.phrase !== 'string') {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'Keyword phrase must be a string',
      );
    }
    const trimmed = input.phrase.trim();
    if (trimmed.length < MIN_PHRASE_LENGTH) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'Keyword phrase cannot be empty',
        { phrase: input.phrase },
      );
    }
    if (trimmed.length > MAX_PHRASE_LENGTH) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Keyword phrase exceeds max length ${MAX_PHRASE_LENGTH}`,
        { length: trimmed.length, max: MAX_PHRASE_LENGTH },
      );
    }
    return new Keyword(input.id ?? crypto.randomUUID(), {
      phrase: trimmed,
      caseSensitive: input.caseSensitive ?? false,
      enabled: input.enabled ?? true,
      createdAt: input.createdAt ?? new Date(),
    });
  }

  /**
   * Rehydrate a keyword from persistence without re-running the
   * phrase-shape validations (use the persisted values as-is).
   */
  public static reconstitute(input: {
    id: string;
    phrase: string;
    caseSensitive: boolean;
    enabled: boolean;
    createdAt: Date;
  }): Keyword {
    return new Keyword(input.id, {
      phrase: input.phrase,
      caseSensitive: input.caseSensitive,
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

  public get enabled(): boolean {
    return this.state.enabled;
  }

  public get createdAt(): Date {
    return this.state.createdAt;
  }

  /**
   * Test whether the supplied content contains the keyword phrase.
   *
   * - Case-insensitive keywords lower-case both sides.
   * - Substring match: `phrase in content` (NOT word-bounded; deliberate
   *   — a phrase like "btc" must still match "btcusdt" because that is
   *   how crypto-news shorthand works).
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
