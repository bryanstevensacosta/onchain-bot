import { DomainError, ErrorCode } from '../../shared/kernel/domain-error';

export interface TemplateClassificationConfigProps {
  /** Template id (e.g. the `vip-calls` seed name, P14 — a datum, not a module). */
  readonly templateId: string;
  /** KOL source channel ids in scope; empty = all sources (P16 single dashboard). */
  readonly kolSourceIds: ReadonlyArray<string>;
  /** Score display floor: mentions below this are hidden from the template view. */
  readonly minVisibleScore: number;
  /** Gem filter: score floor for gem highlighting. */
  readonly gemMinScore: number;
  /** Gem filter: regexes matched (case-insensitive) over enrichment text. */
  readonly gemPatterns: ReadonlyArray<string>;
}

/**
 * Classification AS per-template config (Tramo 1, todo 9, P6 + G-08).
 *
 * There is NO classification table and NO standalone classification BC:
 * classification is pure configuration owned by the template (full module
 * lands in todo 10 — this value object moves there unchanged). It covers
 * the three P6 faces: visible channels (`kolSourceIds`), score display
 * (`minVisibleScore`), and gem filters (score threshold + regex over
 * enrichment text: symbol/name/market snapshot rendered as text).
 *
 * Gem semantics: score >= `gemMinScore` AND every pattern matches
 * (AND-groups, same as the backend keyword AND-groups). Patterns compile
 * fail-fast at creation — an invalid regex is a config bug, never a
 * per-mention runtime surprise.
 */
export class TemplateClassificationConfig {
  private readonly compiledPatterns: ReadonlyArray<RegExp>;

  private constructor(
    private readonly props: TemplateClassificationConfigProps,
    compiled: ReadonlyArray<RegExp>,
  ) {
    this.compiledPatterns = compiled;
  }

  public static create(input: TemplateClassificationConfigProps): TemplateClassificationConfig {
    if (!input.templateId) {
      throw new DomainError(ErrorCode.VALIDATION, 'templateId must not be empty');
    }
    for (const [name, value] of [
      ['minVisibleScore', input.minVisibleScore],
      ['gemMinScore', input.gemMinScore],
    ] as const) {
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new DomainError(
          ErrorCode.VALIDATION,
          `${name} must be 0..100, got ${value}`,
          { templateId: input.templateId },
        );
      }
    }
    const compiled = input.gemPatterns.map((pattern) => {
      try {
        return new RegExp(pattern, 'i');
      } catch {
        throw new DomainError(
          ErrorCode.VALIDATION,
          `Invalid gem pattern: ${pattern}`,
          { templateId: input.templateId, pattern },
        );
      }
    });
    return new TemplateClassificationConfig(
      {
        ...input,
        kolSourceIds: Object.freeze([...input.kolSourceIds]),
        gemPatterns: Object.freeze([...input.gemPatterns]),
      },
      Object.freeze(compiled),
    );
  }

  public get templateId(): string {
    return this.props.templateId;
  }

  public get kolSourceIds(): ReadonlyArray<string> {
    return this.props.kolSourceIds;
  }

  public get minVisibleScore(): number {
    return this.props.minVisibleScore;
  }

  public get gemMinScore(): number {
    return this.props.gemMinScore;
  }

  public get gemPatterns(): ReadonlyArray<string> {
    return this.props.gemPatterns;
  }

  /** Visible channels: empty scope = all sources (P16 seed default). */
  public isSourceVisible(kolId: string): boolean {
    if (this.props.kolSourceIds.length === 0) return true;
    return this.props.kolSourceIds.includes(kolId);
  }

  /** Score display gate for the template view. */
  public isScoreVisible(score: number): boolean {
    return score >= this.props.minVisibleScore;
  }

  /** Gem filter: threshold AND every enrichment-text regex. */
  public matchesGem(input: { score: number; enrichmentText: string }): boolean {
    if (input.score < this.props.gemMinScore) return false;
    return this.compiledPatterns.every((re) => re.test(input.enrichmentText));
  }
}
