import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import type { PublishTarget } from '../../../template/domain/template-target';
import { PUBLISH_TARGETS } from '../../../template/domain/template-target';

export interface SessionBotTarget {
  readonly botId: string;
  readonly chatId: string;
}

export interface SessionPerTargetLimits {
  readonly publishDelayMs: number;
  readonly dailyCap: number;
}

export interface SessionSchedule {
  readonly enabled: boolean;
  readonly oneShotAt: Date | null;
  readonly intervalMinutes: number | null;
  readonly telegram: SessionPerTargetLimits | null;
  readonly threads: SessionPerTargetLimits | null;
}

export interface CreatePublishingSessionInput {
  readonly id?: string;
  readonly name: string;
  readonly templateId?: string | null;
  readonly sourceToggles?: Record<string, boolean>;
  readonly keywordIds?: ReadonlyArray<string>;
  readonly matchingEnabled?: boolean;
  readonly publishingEnabled?: boolean;
  readonly llmEnabled?: boolean;
  readonly schedule?: Partial<SessionSchedule>;
  readonly telegramTargets?: ReadonlyArray<SessionBotTarget>;
  readonly threadsTargets?: ReadonlyArray<SessionBotTarget>;
  readonly active?: boolean;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeSchedule(
  patch: Partial<SessionSchedule> | undefined,
): SessionSchedule {
  const enabled = patch?.enabled ?? true;
  const oneShotAt = patch?.oneShotAt ?? null;
  const intervalMinutes = patch?.intervalMinutes ?? null;
  if (oneShotAt !== null && !(oneShotAt instanceof Date)) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      'session oneShotAt must be a Date',
    );
  }
  if (
    intervalMinutes !== null &&
    (!Number.isInteger(intervalMinutes) || intervalMinutes <= 0)
  ) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      'session intervalMinutes must be a positive integer',
    );
  }
  return {
    enabled,
    oneShotAt,
    intervalMinutes,
    telegram: patch?.telegram ?? null,
    threads: patch?.threads ?? null,
  };
}

/**
 * Publishing session = one frontend tab (Tramo 2, todo 12, P34).
 *
 * Loads a content template (`templateId`) or runs ad-hoc (null). Per
 * session: source on/off toggles (toggles ONLY — sessions never create
 * ingestion sources), own keywords, matching/publishing/llm switches,
 * OWN scheduling (one-shot + recurring scheduling posts), N telegram +
 * N threads bot targets, active/inactive. Dedup + prompt templates stay
 * GLOBAL and shared (the planner probes the shared `DeduplicationService`
 * once per message; the prompt ref lives on the template).
 *
 * Inactive sessions consume nothing and publish nothing (adversarial).
 */
export class PublishingSession extends AggregateRoot<string> {
  private readonly displayName: string;
  private templateIdState: string | null;
  private sourceTogglesState: Record<string, boolean>;
  private keywordIdsState: ReadonlyArray<string>;
  private matchingEnabledState: boolean;
  private publishingEnabledState: boolean;
  private llmEnabledState: boolean;
  private scheduleState: SessionSchedule;
  private telegramTargetsState: ReadonlyArray<SessionBotTarget>;
  private threadsTargetsState: ReadonlyArray<SessionBotTarget>;
  private activeState: boolean;
  private readonly createdAt: Date;
  private updatedAt: Date;

  private constructor(id: string, name: string) {
    super(id);
    this.displayName = name;
    this.templateIdState = null;
    this.sourceTogglesState = {};
    this.keywordIdsState = [];
    this.matchingEnabledState = true;
    this.publishingEnabledState = true;
    this.llmEnabledState = true;
    this.scheduleState = normalizeSchedule(undefined);
    this.telegramTargetsState = [];
    this.threadsTargetsState = [];
    this.activeState = true;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  public static create(input: CreatePublishingSessionInput): PublishingSession {
    const name = (input.name ?? '').trim();
    if (!name) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'session name must not be empty',
      );
    }
    const id = (input.id ?? slugify(name)).trim();
    if (!id) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'session id must not be empty',
        {
          name,
        },
      );
    }
    const session = new PublishingSession(id, name);
    session.templateIdState = input.templateId ?? null;
    session.sourceTogglesState = { ...(input.sourceToggles ?? {}) };
    session.keywordIdsState = [...(input.keywordIds ?? [])];
    if (input.matchingEnabled !== undefined) {
      session.matchingEnabledState = input.matchingEnabled;
    }
    if (input.publishingEnabled !== undefined) {
      session.publishingEnabledState = input.publishingEnabled;
    }
    if (input.llmEnabled !== undefined)
      session.llmEnabledState = input.llmEnabled;
    session.scheduleState = normalizeSchedule(input.schedule);
    session.telegramTargetsState = [...(input.telegramTargets ?? [])];
    session.threadsTargetsState = [...(input.threadsTargets ?? [])];
    if (input.active !== undefined) session.activeState = input.active;
    return session;
  }

  public get name(): string {
    return this.displayName;
  }

  public get templateId(): string | null {
    return this.templateIdState;
  }

  public get sourceToggles(): Record<string, boolean> {
    return { ...this.sourceTogglesState };
  }

  public get keywordIds(): ReadonlyArray<string> {
    return this.keywordIdsState;
  }

  public get matchingEnabled(): boolean {
    return this.matchingEnabledState;
  }

  public get publishingEnabled(): boolean {
    return this.publishingEnabledState;
  }

  public get llmEnabled(): boolean {
    return this.llmEnabledState;
  }

  public get schedule(): SessionSchedule {
    return this.scheduleState;
  }

  public get telegramTargets(): ReadonlyArray<SessionBotTarget> {
    return this.telegramTargetsState;
  }

  public get threadsTargets(): ReadonlyArray<SessionBotTarget> {
    return this.threadsTargetsState;
  }

  public get active(): boolean {
    return this.activeState;
  }

  public get createdAtDate(): Date {
    return this.createdAt;
  }

  public get updatedAtDate(): Date {
    return this.updatedAt;
  }

  /** Consuming requires active + the matching switch on. */
  public canConsume(): boolean {
    return this.activeState && this.matchingEnabledState;
  }

  /** Publishing requires active + the publishing switch on. */
  public canPublish(): boolean {
    return this.activeState && this.publishingEnabledState;
  }

  /** Absent toggle = on. Sessions toggle sources, never create them. */
  public isSourceOn(sourceId: string): boolean {
    return this.sourceTogglesState[sourceId] ?? true;
  }

  /** Empty keyword list = every keyword passes. */
  public isKeywordEligible(keywordId: string): boolean {
    if (this.keywordIdsState.length === 0) return true;
    return this.keywordIdsState.includes(keywordId);
  }

  public targetsFor(target: PublishTarget): ReadonlyArray<SessionBotTarget> {
    return target === 'telegram'
      ? this.telegramTargetsState
      : this.threadsTargetsState;
  }

  public renderMode(): 'llm' | 'raw' {
    return this.llmEnabledState && this.publishingEnabledState ? 'llm' : 'raw';
  }

  public activate(): void {
    this.activeState = true;
    this.touch();
  }

  public deactivate(): void {
    this.activeState = false;
    this.touch();
  }

  public setSourceToggle(sourceId: string, enabled: boolean): void {
    this.sourceTogglesState[sourceId] = enabled;
    this.touch();
  }

  public attachTemplate(templateId: string | null): void {
    this.templateIdState = templateId;
    this.touch();
  }

  public updateConfig(patch: {
    templateId?: string | null;
    sourceToggles?: Record<string, boolean>;
    keywordIds?: ReadonlyArray<string>;
    matchingEnabled?: boolean;
    publishingEnabled?: boolean;
    llmEnabled?: boolean;
    schedule?: Partial<SessionSchedule>;
    telegramTargets?: ReadonlyArray<SessionBotTarget>;
    threadsTargets?: ReadonlyArray<SessionBotTarget>;
    active?: boolean;
  }): void {
    if (patch.templateId !== undefined) this.templateIdState = patch.templateId;
    if (patch.sourceToggles !== undefined) {
      this.sourceTogglesState = { ...patch.sourceToggles };
    }
    if (patch.keywordIds !== undefined)
      this.keywordIdsState = [...patch.keywordIds];
    if (patch.matchingEnabled !== undefined) {
      this.matchingEnabledState = patch.matchingEnabled;
    }
    if (patch.publishingEnabled !== undefined) {
      this.publishingEnabledState = patch.publishingEnabled;
    }
    if (patch.llmEnabled !== undefined) this.llmEnabledState = patch.llmEnabled;
    if (patch.schedule !== undefined) {
      this.scheduleState = normalizeSchedule({
        enabled: patch.schedule.enabled ?? this.scheduleState.enabled,
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
    if (patch.telegramTargets !== undefined) {
      this.telegramTargetsState = [...patch.telegramTargets];
    }
    if (patch.threadsTargets !== undefined) {
      this.threadsTargetsState = [...patch.threadsTargets];
    }
    if (patch.active !== undefined) this.activeState = patch.active;
    this.touch();
  }

  private touch(): void {
    this.updatedAt = new Date();
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
    void PUBLISH_TARGETS;
  }
}
