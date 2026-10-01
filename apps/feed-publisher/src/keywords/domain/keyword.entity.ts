import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import type { MatchMode } from './match-mode';

const MIN_PHRASE_LENGTH = 1;
const MAX_PHRASE_LENGTH = 200;

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
 * Keyword aggregate (moved from backend feed-publisher, todo 3).
 *
 * Allowed-list entry for the match pipeline: a message is enqueued when
 * any simple keyword matches (OR) or every member of an AND-group matches.
 * `templateId` is an optional per-keyword prompt-template override (null
 * falls back to the global default at publish time). `sourceChannelIds`
 * scopes the keyword to channels (empty = every channel).
 */
export class Keyword extends AggregateRoot<string> {
  private state: KeywordProps;

  protected constructor(id: string, props: KeywordProps) {
    super(id);
    this.state = props;
  }

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
        {
          phrase: input.phrase,
        },
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
    if (this.state.caseSensitive) {
      return content.includes(this.state.phrase);
    }
    return content.toLowerCase().includes(this.state.phrase.toLowerCase());
  }

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
