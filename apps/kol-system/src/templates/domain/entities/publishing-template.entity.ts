import { AggregateRoot } from '../../../shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import type { DomainEvent } from '../../../shared/kernel/domain-event';
import { TemplateClassificationConfig } from '../template-classification.config';
import {
  DEFAULT_SCORING_CONFIG,
  mergeScoringConfig,
  validateScoringConfig,
  type ScoringConfigPatch,
  type TemplateScoringConfig,
} from '../../../scoring/domain/scoring-config';
import {
  TemplateActivatedEvent,
  TemplateCreatedEvent,
  TemplateSourceConfigUpdatedEvent,
} from '../events/template-events';

export type RankingStrategy = 'score' | 'engagement' | 'recency' | 'weighted';

export const RANKING_STRATEGIES: ReadonlyArray<RankingStrategy> = [
  'score',
  'engagement',
  'recency',
  'weighted',
];

export interface RankingWeights {
  readonly score: number;
  readonly engagement: number;
  readonly recency: number;
}

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = Object.freeze({
  score: 0.5,
  engagement: 0.2,
  recency: 0.3,
});

export interface CreatePublishingTemplateInput {
  readonly id?: string;
  readonly name: string;
  readonly kolSourceIds?: ReadonlyArray<string>;
  readonly minVisibleScore?: number;
  readonly gemMinScore?: number;
  readonly gemPatterns?: ReadonlyArray<string>;
  readonly rankingStrategy?: RankingStrategy;
  readonly rankingLimit?: number;
  readonly rankingWeights?: RankingWeights;
  readonly scoringConfig?: ScoringConfigPatch;
  readonly botId?: string | null;
  readonly channelTarget?: string | null;
  readonly active?: boolean;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Publishing template aggregate (Tramo 1, todo 10, Ph9 CORE + P6/P14/P16).
 *
 * Owns the per-template classification config (visible channels + score
 * display + gem filters, moved unchanged from todo 9), the ranking config
 * (strategy + limit + weights), the source selector (`kolSourceIds`, empty
 * = all sources, P16 single dashboard), and the optional publishing target
 * (`botId` + `channelTarget` into the `telegram_bots` catalog, P23 — null
 * = dashboard-only).
 *
 * `threadConfig` is ALWAYS null: thread support is deferred to Tramo 2
 * (C1) — every `.../threads/*` route answers 501 (see threads-stub
 * controller + pinning spec). Publishing additionally requires an
 * admin-verified channel (`adminVerifiedAt`, P23-bis); without it the
 * template stays dashboard-only and the orchestrator skips publishing for
 * that template while the rest continue (adversarial: missing token never
 * kills the batch).
 */
export class PublishingTemplate extends AggregateRoot<string> {
  private activeState: boolean;
  private classificationState: TemplateClassificationConfig;
  private strategyState: RankingStrategy;
  private limitState: number;
  private weightsState: RankingWeights;
  private scoringConfigState: TemplateScoringConfig;
  private assignedBotId: string | null;
  private assignedChannel: string | null;
  private verifiedAtState: Date | null;
  private readonly createdAt: Date;
  private updatedAt: Date;
  private readonly displayName: string;

  private constructor(id: string, name: string) {
    super(id);
    this.displayName = name;
    this.activeState = true;
    this.classificationState = TemplateClassificationConfig.create({
      templateId: id,
      kolSourceIds: [],
      minVisibleScore: 0,
      gemMinScore: 70,
      gemPatterns: [],
    });
    this.strategyState = 'score';
    this.limitState = 50;
    this.weightsState = DEFAULT_RANKING_WEIGHTS;
    this.scoringConfigState = DEFAULT_SCORING_CONFIG;
    this.assignedBotId = null;
    this.assignedChannel = null;
    this.verifiedAtState = null;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  public static create(
    input: CreatePublishingTemplateInput,
  ): PublishingTemplate {
    const name = (input.name ?? '').trim();
    if (!name) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'template name must not be empty',
      );
    }
    const id = (input.id ?? slugify(name)).trim();
    if (!id) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'template id must not be empty',
        { name },
      );
    }
    const template = new PublishingTemplate(id, name);
    template.applyConfig({
      kolSourceIds: input.kolSourceIds,
      minVisibleScore: input.minVisibleScore,
      gemMinScore: input.gemMinScore,
      gemPatterns: input.gemPatterns,
      rankingStrategy: input.rankingStrategy,
      rankingLimit: input.rankingLimit,
      rankingWeights: input.rankingWeights,
      scoringConfig: input.scoringConfig,
    });
    if (input.active !== undefined) template.activeState = input.active;
    if (input.botId !== undefined) template.assignedBotId = input.botId;
    if (input.channelTarget !== undefined)
      template.assignedChannel = input.channelTarget;
    template.apply(new TemplateCreatedEvent({ templateId: id, name }));
    return template;
  }

  public get name(): string {
    return this.displayName;
  }

  public get active(): boolean {
    return this.activeState;
  }

  public get kolSourceIds(): ReadonlyArray<string> {
    return this.classificationState.kolSourceIds;
  }

  public get minVisibleScore(): number {
    return this.classificationState.minVisibleScore;
  }

  public get gemMinScore(): number {
    return this.classificationState.gemMinScore;
  }

  public get gemPatterns(): ReadonlyArray<string> {
    return this.classificationState.gemPatterns;
  }

  public get rankingStrategy(): RankingStrategy {
    return this.strategyState;
  }

  public get rankingLimit(): number {
    return this.limitState;
  }

  public get weights(): RankingWeights {
    return this.weightsState;
  }

  /** Per-template scoring rules (P28) — v1 defaults until customized. */
  public get scoringConfig(): TemplateScoringConfig {
    return this.scoringConfigState;
  }

  /** C1: threads are deferred to Tramo 2 — always null, never configured. */
  public get threadConfig(): null {
    return null;
  }

  public get botId(): string | null {
    return this.assignedBotId;
  }

  public get channelTarget(): string | null {
    return this.assignedChannel;
  }

  public get adminVerifiedAt(): Date | null {
    return this.verifiedAtState;
  }

  public get createdAtDate(): Date {
    return this.createdAt;
  }

  public get updatedAtDate(): Date {
    return this.updatedAt;
  }

  public get classification(): TemplateClassificationConfig {
    return this.classificationState;
  }

  public activate(): void {
    this.activeState = true;
    this.touch();
    this.apply(
      new TemplateActivatedEvent({ templateId: this.id, active: true }),
    );
  }

  public deactivate(): void {
    this.activeState = false;
    this.touch();
    this.apply(
      new TemplateActivatedEvent({ templateId: this.id, active: false }),
    );
  }

  public updateConfig(patch: {
    kolSourceIds?: ReadonlyArray<string>;
    minVisibleScore?: number;
    gemMinScore?: number;
    gemPatterns?: ReadonlyArray<string>;
    rankingStrategy?: RankingStrategy;
    rankingLimit?: number;
    rankingWeights?: RankingWeights;
    scoringConfig?: ScoringConfigPatch;
  }): void {
    this.applyConfig(patch);
    this.touch();
  }

  /**
   * Replaces scoring rules with the merged patch (PATCH semantics: merges
   * over the CURRENT config, validates the effective result, throws
   * VALIDATION → 400 on out-of-range values).
   */
  public setScoringConfig(patch: ScoringConfigPatch): void {
    const merged = mergeScoringConfig(this.scoringConfigState, patch);
    validateScoringConfig(merged);
    this.scoringConfigState = merged;
    this.touch();
  }

  public setSources(kolSourceIds: ReadonlyArray<string>): void {
    this.applyConfig({ kolSourceIds });
    this.touch();
    this.apply(
      new TemplateSourceConfigUpdatedEvent({
        templateId: this.id,
        kolSourceIds: [...kolSourceIds],
      }),
    );
  }

  /**
   * Assigns a publishing target. Verification is ALWAYS cleared here —
   * the caller must re-verify via `markChannelVerified` (P23-bis).
   */
  public assignChannel(botId: string, channelTarget: string): void {
    if (!botId.trim() || !channelTarget.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'botId and channelTarget must not be empty',
        {
          templateId: this.id,
        },
      );
    }
    this.assignedBotId = botId;
    this.assignedChannel = channelTarget;
    this.verifiedAtState = null;
    this.touch();
  }

  public markChannelVerified(at: Date = new Date()): void {
    if (!this.assignedBotId || !this.assignedChannel) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'cannot verify a template without botId + channelTarget',
        { templateId: this.id },
      );
    }
    this.verifiedAtState = at;
    this.touch();
  }

  /** Publishing requires active + bot + channel + admin verification. */
  public canPublish(): boolean {
    return (
      this.activeState &&
      this.assignedBotId !== null &&
      this.assignedChannel !== null &&
      this.verifiedAtState !== null
    );
  }

  private applyConfig(patch: {
    kolSourceIds?: ReadonlyArray<string>;
    minVisibleScore?: number;
    gemMinScore?: number;
    gemPatterns?: ReadonlyArray<string>;
    rankingStrategy?: RankingStrategy;
    rankingLimit?: number;
    rankingWeights?: RankingWeights;
    scoringConfig?: ScoringConfigPatch;
  }): void {
    if (patch.rankingStrategy !== undefined) {
      if (!RANKING_STRATEGIES.includes(patch.rankingStrategy)) {
        throw new DomainError(
          ErrorCode.VALIDATION,
          `unknown ranking strategy: ${patch.rankingStrategy}`,
          { templateId: this.id },
        );
      }
      this.strategyState = patch.rankingStrategy;
    }
    if (patch.rankingLimit !== undefined) {
      if (!Number.isInteger(patch.rankingLimit) || patch.rankingLimit <= 0) {
        throw new DomainError(
          ErrorCode.VALIDATION,
          `rankingLimit must be a positive integer, got ${patch.rankingLimit}`,
          { templateId: this.id },
        );
      }
      this.limitState = patch.rankingLimit;
    }
    if (patch.rankingWeights !== undefined) {
      this.weightsState = Object.freeze({ ...patch.rankingWeights });
    }
    if (patch.scoringConfig !== undefined) {
      const merged = mergeScoringConfig(
        this.scoringConfigState,
        patch.scoringConfig,
      );
      validateScoringConfig(merged);
      this.scoringConfigState = merged;
    }
    const needsRebuild =
      patch.kolSourceIds !== undefined ||
      patch.minVisibleScore !== undefined ||
      patch.gemMinScore !== undefined ||
      patch.gemPatterns !== undefined;
    if (needsRebuild) {
      this.classificationState = TemplateClassificationConfig.create({
        templateId: this.id,
        kolSourceIds: patch.kolSourceIds ?? [
          ...this.classificationState.kolSourceIds,
        ],
        minVisibleScore:
          patch.minVisibleScore ?? this.classificationState.minVisibleScore,
        gemMinScore: patch.gemMinScore ?? this.classificationState.gemMinScore,
        gemPatterns: patch.gemPatterns ?? [
          ...this.classificationState.gemPatterns,
        ],
      });
    }
  }

  private touch(): void {
    this.updatedAt = new Date();
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
