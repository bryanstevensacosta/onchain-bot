import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { PUBLISH_TARGETS, type PublishTarget } from '../template-target';

export type TemplateScheduleMode = 'off' | 'one-shot' | 'recurring';

export interface TemplateContentFilter {
  readonly id: string;
  readonly pattern: string;
  readonly replacement: string;
  readonly flags: string;
  readonly priority: number;
  readonly isActive: boolean;
}

export interface TemplateBotBinding {
  readonly botId: string;
  readonly target: PublishTarget;
  readonly chatId: string;
}

export interface TemplatePerTargetLimits {
  readonly publishDelayMs: number;
  readonly dailyCap: number;
}

export interface TemplateSchedule {
  readonly mode: TemplateScheduleMode;
  readonly oneShotAt: Date | null;
  readonly intervalMinutes: number | null;
  readonly telegram: TemplatePerTargetLimits | null;
  readonly threads: TemplatePerTargetLimits | null;
}

export interface CreateContentTemplateInput {
  readonly id?: string;
  readonly name: string;
  readonly sourceIds?: ReadonlyArray<string>;
  readonly keywordIds?: ReadonlyArray<string>;
  readonly contentFilters?: ReadonlyArray<TemplateContentFilter>;
  readonly promptTemplateId?: string | null;
  readonly targets: ReadonlyArray<PublishTarget>;
  readonly botBindings?: ReadonlyArray<TemplateBotBinding>;
  readonly matchingEnabled?: boolean;
  readonly llmEnabled?: boolean;
  readonly publishingEnabled?: boolean;
  readonly schedule?: Partial<TemplateSchedule>;
  readonly active?: boolean;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function defaultSchedule(): TemplateSchedule {
  return {
    mode: 'off',
    oneShotAt: null,
    intervalMinutes: null,
    telegram: null,
    threads: null,
  };
}

function normalizeSchedule(
  patch: Partial<TemplateSchedule> | undefined,
): TemplateSchedule {
  const base = defaultSchedule();
  if (!patch) return base;
  const mode = patch.mode ?? base.mode;
  if (mode !== 'off' && mode !== 'one-shot' && mode !== 'recurring') {
    throw new DomainError(
      ErrorCode.VALIDATION,
      `unknown schedule mode: ${mode}`,
    );
  }
  if (mode === 'one-shot' && !(patch.oneShotAt instanceof Date)) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      'one-shot scheduling posts require oneShotAt',
    );
  }
  if (
    mode === 'recurring' &&
    (patch.intervalMinutes === undefined ||
      patch.intervalMinutes === null ||
      !Number.isInteger(patch.intervalMinutes) ||
      patch.intervalMinutes <= 0)
  ) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      'recurring scheduling posts require a positive intervalMinutes',
    );
  }
  return {
    mode,
    oneShotAt: patch.oneShotAt ?? null,
    intervalMinutes: patch.intervalMinutes ?? null,
    telegram: patch.telegram ?? null,
    threads: patch.threads ?? null,
  };
}

/**
 * Publishing content template (Tramo 2, todo 12, P33).
 *
 * Mirrors the sibling extraction service template pattern: a reusable,
 * frontend-configurable publishing profile. Per template: eligible
 * sources (source filter, empty = all), eligible keywords (empty = all
 * global keywords), OWN content filters (regex transforms applied
 * on-read, fail-open), a reusable ref to the GLOBAL LLM
 * prompt-template catalog (any template may reference any global prompt
 * template; sessions inherit the ref), delivery targets
 * (telegram / threads / both), OWN queue+matching+scheduling toggles,
 * per-target delay/cap overrides (P38, null = fall back to the global
 * scheduling config), and DB-backed bot bindings (P23-like catalog in
 * this BC — see TemplateBot; null bindings = dashboard-only).
 *
 * Scheduling posts speak two dialects: one-shot (a single future post)
 * and recurring (an interval cadence, migrated from the ads rotation
 * language). `mode: 'off'` disables scheduled posts without touching
 * the matched-message flow.
 */
export class PublishingContentTemplate extends AggregateRoot<string> {
  private activeState: boolean;
  private readonly displayName: string;
  private sourceIdsState: ReadonlyArray<string>;
  private keywordIdsState: ReadonlyArray<string>;
  private contentFiltersState: ReadonlyArray<TemplateContentFilter>;
  private promptTemplateIdState: string | null;
  private targetsState: ReadonlyArray<PublishTarget>;
  private botBindingsState: ReadonlyArray<TemplateBotBinding>;
  private matchingEnabledState: boolean;
  private llmEnabledState: boolean;
  private publishingEnabledState: boolean;
  private scheduleState: TemplateSchedule;
  private readonly createdAt: Date;
  private updatedAt: Date;

  private constructor(id: string, name: string) {
    super(id);
    this.displayName = name;
    this.activeState = true;
    this.sourceIdsState = [];
    this.keywordIdsState = [];
    this.contentFiltersState = [];
    this.promptTemplateIdState = null;
    this.targetsState = ['telegram'];
    this.botBindingsState = [];
    this.matchingEnabledState = true;
    this.llmEnabledState = true;
    this.publishingEnabledState = true;
    this.scheduleState = defaultSchedule();
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  public static create(
    input: CreateContentTemplateInput,
  ): PublishingContentTemplate {
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
        {
          name,
        },
      );
    }
    if (!input.targets || input.targets.length === 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'template needs at least one target (telegram, threads, or both)',
        { templateId: id },
      );
    }
    for (const target of input.targets) {
      if (!PUBLISH_TARGETS.includes(target)) {
        throw new DomainError(
          ErrorCode.VALIDATION,
          `unknown target: ${target}`,
          {
            templateId: id,
          },
        );
      }
    }
    const template = new PublishingContentTemplate(id, name);
    template.sourceIdsState = [...(input.sourceIds ?? [])];
    template.keywordIdsState = [...(input.keywordIds ?? [])];
    template.contentFiltersState = [...(input.contentFilters ?? [])];
    template.promptTemplateIdState = input.promptTemplateId ?? null;
    template.targetsState = [...input.targets];
    template.botBindingsState = [...(input.botBindings ?? [])];
    if (input.matchingEnabled !== undefined) {
      template.matchingEnabledState = input.matchingEnabled;
    }
    if (input.llmEnabled !== undefined) {
      template.llmEnabledState = input.llmEnabled;
    }
    if (input.publishingEnabled !== undefined) {
      template.publishingEnabledState = input.publishingEnabled;
    }
    template.scheduleState = normalizeSchedule(input.schedule);
    if (input.active !== undefined) template.activeState = input.active;
    return template;
  }

  public get name(): string {
    return this.displayName;
  }

  public get active(): boolean {
    return this.activeState;
  }

  public get sourceIds(): ReadonlyArray<string> {
    return this.sourceIdsState;
  }

  public get keywordIds(): ReadonlyArray<string> {
    return this.keywordIdsState;
  }

  public get contentFilters(): ReadonlyArray<TemplateContentFilter> {
    return this.contentFiltersState;
  }

  /** Reusable ref into the GLOBAL prompt-template catalog (null = default). */
  public get promptTemplateId(): string | null {
    return this.promptTemplateIdState;
  }

  public get targets(): ReadonlyArray<PublishTarget> {
    return this.targetsState;
  }

  public get botBindings(): ReadonlyArray<TemplateBotBinding> {
    return this.botBindingsState;
  }

  public get matchingEnabled(): boolean {
    return this.matchingEnabledState;
  }

  public get llmEnabled(): boolean {
    return this.llmEnabledState;
  }

  public get publishingEnabled(): boolean {
    return this.publishingEnabledState;
  }

  public get schedule(): TemplateSchedule {
    return this.scheduleState;
  }

  public get createdAtDate(): Date {
    return this.createdAt;
  }

  public get updatedAtDate(): Date {
    return this.updatedAt;
  }

  /** Empty source list = every source is eligible. */
  public isSourceEligible(sourceId: string): boolean {
    if (this.sourceIdsState.length === 0) return true;
    return this.sourceIdsState.includes(sourceId);
  }

  /** Empty keyword list = every global keyword is eligible. */
  public isKeywordEligible(keywordId: string): boolean {
    if (this.keywordIdsState.length === 0) return true;
    return this.keywordIdsState.includes(keywordId);
  }

  public targetsInclude(target: PublishTarget): boolean {
    return this.targetsState.includes(target);
  }

  public bindingsFor(target: PublishTarget): ReadonlyArray<TemplateBotBinding> {
    return this.botBindingsState.filter((binding) => binding.target === target);
  }

  /** Publishing requires active + publishing switch + a bound bot per target. */
  public canPublish(): boolean {
    return (
      this.activeState &&
      this.publishingEnabledState &&
      this.targetsState.length > 0 &&
      this.botBindingsState.length > 0
    );
  }

  /** Scheduling-posts due check (one-shot fires once its time passes). */
  public isScheduleDue(now: Date = new Date()): boolean {
    if (this.scheduleState.mode === 'off') return false;
    if (this.scheduleState.mode === 'one-shot') {
      const at = this.scheduleState.oneShotAt;
      return at !== null && now.getTime() >= at.getTime();
    }
    return true;
  }

  /**
   * Applies the template OWN content filters on-read (priority ASC).
   * Fail-open per filter: overlong patterns and invalid regexes are
   * skipped, never thrown (mirrors the filters BC semantics).
   */
  public applyContentFilters(content: string): string {
    let out = content;
    const ordered = [...this.contentFiltersState]
      .filter((filter) => filter.isActive)
      .sort((a, b) => a.priority - b.priority);
    for (const filter of ordered) {
      if (filter.pattern.length === 0 || filter.pattern.length > 512) continue;
      try {
        const flags = /^[gimsuy]*$/.test(filter.flags) ? filter.flags : 'gi';
        out = out.replace(
          new RegExp(filter.pattern, flags),
          filter.replacement,
        );
      } catch {
        continue;
      }
    }
    return out;
  }

  public activate(): void {
    this.activeState = true;
    this.touch();
  }

  public deactivate(): void {
    this.activeState = false;
    this.touch();
  }

  public updateConfig(patch: {
    sourceIds?: ReadonlyArray<string>;
    keywordIds?: ReadonlyArray<string>;
    contentFilters?: ReadonlyArray<TemplateContentFilter>;
    promptTemplateId?: string | null;
    targets?: ReadonlyArray<PublishTarget>;
    botBindings?: ReadonlyArray<TemplateBotBinding>;
    matchingEnabled?: boolean;
    llmEnabled?: boolean;
    publishingEnabled?: boolean;
    schedule?: Partial<TemplateSchedule>;
    active?: boolean;
  }): void {
    if (patch.targets !== undefined) {
      if (patch.targets.length === 0) {
        throw new DomainError(
          ErrorCode.VALIDATION,
          'template needs at least one target',
          { templateId: this.id },
        );
      }
      for (const target of patch.targets) {
        if (!PUBLISH_TARGETS.includes(target)) {
          throw new DomainError(
            ErrorCode.VALIDATION,
            `unknown target: ${target}`,
            {
              templateId: this.id,
            },
          );
        }
      }
      this.targetsState = [...patch.targets];
    }
    if (patch.sourceIds !== undefined)
      this.sourceIdsState = [...patch.sourceIds];
    if (patch.keywordIds !== undefined)
      this.keywordIdsState = [...patch.keywordIds];
    if (patch.contentFilters !== undefined) {
      this.contentFiltersState = [...patch.contentFilters];
    }
    if (patch.promptTemplateId !== undefined) {
      this.promptTemplateIdState = patch.promptTemplateId;
    }
    if (patch.botBindings !== undefined) {
      this.botBindingsState = [...patch.botBindings];
    }
    if (patch.matchingEnabled !== undefined) {
      this.matchingEnabledState = patch.matchingEnabled;
    }
    if (patch.llmEnabled !== undefined) this.llmEnabledState = patch.llmEnabled;
    if (patch.publishingEnabled !== undefined) {
      this.publishingEnabledState = patch.publishingEnabled;
    }
    if (patch.schedule !== undefined) {
      this.scheduleState = normalizeSchedule({
        mode: patch.schedule.mode ?? this.scheduleState.mode,
        oneShotAt:
          patch.schedule.oneShotAt ?? this.scheduleState.oneShotAt ?? undefined,
        intervalMinutes:
          patch.schedule.intervalMinutes ??
          this.scheduleState.intervalMinutes ??
          undefined,
        telegram:
          patch.schedule.telegram ?? this.scheduleState.telegram ?? undefined,
        threads:
          patch.schedule.threads ?? this.scheduleState.threads ?? undefined,
      });
    }
    if (patch.active !== undefined) this.activeState = patch.active;
    this.touch();
  }

  private touch(): void {
    this.updatedAt = new Date();
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
