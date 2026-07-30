import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';

const MIN_PHRASE_LENGTH = 1;
const MAX_PHRASE_LENGTH = 200;

export type MatchMode = 'exact' | 'substring';

interface KeywordProps {
  readonly phrase: string;
  readonly caseSensitive: boolean;
  sourceChannelIds: string[];
  templateId: string | null;
  enabled: boolean;
  readonly requireMedia: boolean;
  readonly andGroupId: string | null;
  readonly matchMode: MatchMode;
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
 *
 * `templateId` is an OPTIONAL override: when set, the publisher uses
 * the `PromptTemplate` identified by this id when refining the
 * matched message. When null, the publisher falls back to the global
 * default template referenced by `LlmConfig.defaultTemplateId`. The
 * binding is stored at match time (so a keyword renumbering takes
 * effect for new ingests without replaying history).
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
    sourceChannelIds?: string[];
    templateId?: string | null;
    enabled?: boolean;
    requireMedia?: boolean;
    andGroupId?: string | null;
    matchMode?: MatchMode;
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
    if (
      input.templateId !== undefined &&
      input.templateId !== null &&
      (typeof input.templateId !== 'string' || input.templateId.length === 0)
    ) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'Keyword templateId, when provided, must be a non-empty string or null',
      );
    }
    return new Keyword(input.id ?? crypto.randomUUID(), {
      phrase: trimmed,
      caseSensitive: input.caseSensitive ?? false,
      sourceChannelIds: input.sourceChannelIds ?? [],
      templateId: input.templateId ?? null,
      enabled: input.enabled ?? true,
      requireMedia: input.requireMedia ?? false,
      andGroupId: input.andGroupId ?? null,
      matchMode: input.matchMode ?? 'exact',
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
    sourceChannelIds: string[];
    templateId: string | null;
    enabled: boolean;
    requireMedia: boolean;
    andGroupId: string | null;
    matchMode?: MatchMode;
    createdAt: Date;
  }): Keyword {
    return new Keyword(input.id, {
      phrase: input.phrase,
      caseSensitive: input.caseSensitive,
      sourceChannelIds: input.sourceChannelIds,
      templateId: input.templateId,
      enabled: input.enabled,
      requireMedia: input.requireMedia,
      andGroupId: input.andGroupId,
      matchMode: input.matchMode ?? 'substring',
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

  public get templateId(): string | null {
    return this.state.templateId;
  }

  public get enabled(): boolean {
    return this.state.enabled;
  }

  public get requireMedia(): boolean {
    return this.state.requireMedia;
  }

  public get andGroupId(): string | null {
    return this.state.andGroupId;
  }

  public get matchMode(): MatchMode {
    return this.state.matchMode;
  }

  public get createdAt(): Date {
    return this.state.createdAt;
  }

  /**
   * Test whether the supplied content contains the keyword phrase.
   *
   * Two modes controlled by `matchMode`:
   * - `exact` (default for new keywords): adaptive word-boundary regex.
   *   Uses `\b` when the phrase starts/ends with a word character (`\w`),
   *   or `(?:^|\W)` / `(?:\W|$)` when it starts/ends with a non-word
   *   character (`#`, `@`, `$`, etc.). This ensures phrases like
   *   `#Bitcoin ETFs` or `@user` match correctly while still respecting
   *   word boundaries for plain-text phrases like `"AI"`.
   *   Examples: `#Bitcoin ETFs` matches `"\n#Bitcoin ETFs:\n"` but NOT
   *   `"ab#Bitcoin ETFs"`; `AI` matches `"AI's"` but NOT `"chain"`.
   * - `substring`: simple `includes()` — `"btc"` matches `"btcusdt"`,
   *   useful for URLs like `"arkm.com/explorer"` inside a longer URL.
   *
   * Returns `false` for empty content.
   */
  public matches(content: string): boolean {
    if (!content || content.length === 0) {
      return false;
    }

    if (this.state.matchMode === 'exact') {
      const flags = this.state.caseSensitive ? '' : 'i';
      const escaped = this.state.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const firstIsWord = /^\w/.test(this.state.phrase);
      const lastIsWord = /\w$/.test(this.state.phrase);
      const lb = firstIsWord ? '\\b' : '(?:^|\\W)';
      const rb = lastIsWord ? '\\b' : '(?:$|\\W)';
      return new RegExp(`${lb}${escaped}${rb}`, flags).test(content);
    }

    // substring mode
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

  /**
   * Bind this keyword to a specific `PromptTemplate` (overriding the
   * global default). Pass `null` to clear the binding and fall back to
   * the global default again. The templateId is trimmed of surrounding
   * whitespace and must be a non-empty string when provided.
   */
  public setTemplateId(templateId: string | null): void {
    if (templateId === null) {
      this.state.templateId = null;
      return;
    }
    if (typeof templateId !== 'string' || templateId.trim().length === 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'templateId must be a non-empty string or null',
      );
    }
    this.state.templateId = templateId.trim();
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
