import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { KolId } from 'kol/identity/domain/value-objects/kol-id.vo';
import { KolHandle } from 'kol/identity/domain/value-objects/kol-handle.vo';
import { KolMessageIngestedEvent } from 'kol/ingestion/domain/events/kol-message-ingested.event';

/**
 * Lifecycle status of a tracked Telegram KOL.
 *
 * - `ACTIVE`: ingestion is enabled; the listener is consuming messages.
 * - `DORMANT`: registered but ingestion is paused (e.g. low recent ROI).
 * - `BLACKLISTED`: hard-skipped; the seeder / listener will not re-attach.
 */
export type KolLifecycleStatus = 'ACTIVE' | 'DORMANT' | 'BLACKLISTED';

interface KolProps {
  readonly id: KolId;
  readonly handle: KolHandle | null;
  title: string;
  isActive: boolean;
  lifecycleStatus: KolLifecycleStatus;
  lastIngestedAt: Date | null;
  readonly addedAt: Date;
}

/**
 * Telegram KOL being monitored for alpha signals.
 *
 * Aggregate root. Owns the KOL's monitoring state and lifecycle.
 */
export class Kol extends AggregateRoot<string> {
  private readonly state: KolProps;

  protected constructor(id: KolId, props: KolProps) {
    super(id.value);
    this.state = props;
  }

  public static create(input: {
    id: KolId;
    handle: KolHandle | null;
    title: string;
  }): Kol {
    if (!input.title?.trim()) {
      throw new DomainError(ErrorCode.VALIDATION, 'Kol title cannot be empty');
    }
    return new Kol(input.id, {
      id: input.id,
      handle: input.handle,
      title: input.title.trim(),
      isActive: false,
      lifecycleStatus: 'ACTIVE',
      lastIngestedAt: null,
      addedAt: new Date(),
    });
  }

  /**
   * Rehydrate an existing Kol from persistence without re-running
   * invariant checks (they already passed when the row was written).
   *
   * For hydration use ONLY. Prefer `create()` for new aggregates.
   */
  public static reconstitute(input: KolProps): Kol {
    return new Kol(input.id, input);
  }

  public get kolId(): KolId {
    return KolId.fromString(this._id);
  }

  public get handle(): KolHandle | null {
    return this.state.handle;
  }

  public get title(): string {
    return this.state.title;
  }

  public get isActive(): boolean {
    return this.state.isActive;
  }

  public get lifecycleStatus(): KolLifecycleStatus {
    return this.state.lifecycleStatus;
  }

  public get lastIngestedAt(): Date | null {
    return this.state.lastIngestedAt;
  }

  public startListening(): void {
    if (this.state.isActive) {
      return;
    }
    this.state.isActive = true;
    this.apply(
      new KolMessageIngestedEvent({
        kolId: this.state.id.value,
        handle: this.state.handle?.value ?? null,
        messageId: 0,
        occurredAt: new Date(),
      }),
    );
  }

  public stopListening(): void {
    this.state.isActive = false;
  }

  public activate(): void {
    this.state.lifecycleStatus = 'ACTIVE';
    this.state.isActive = true;
  }

  public dormant(): void {
    this.state.lifecycleStatus = 'DORMANT';
    this.state.isActive = false;
  }

  public blacklist(): void {
    this.state.lifecycleStatus = 'BLACKLISTED';
    this.state.isActive = false;
  }

  /**
   * Backfill the resolved display title from Telegram (or any external
   * source) without re-creating the aggregate.
   */
  public updateTitle(newTitle: string): void {
    if (!newTitle?.trim()) {
      throw new DomainError(ErrorCode.VALIDATION, 'Kol title cannot be empty');
    }
    const trimmed = newTitle.trim();
    if (trimmed === this.state.title) {
      return;
    }
    this.state.title = trimmed;
  }

  public recordMessageIngested(messageId: number, occurredAt: Date): void {
    this.state.lastIngestedAt = occurredAt;
    this.apply(
      new KolMessageIngestedEvent({
        kolId: this.state.id.value,
        handle: this.state.handle?.value ?? null,
        messageId,
        occurredAt,
      }),
    );
  }

  protected mutate(event: DomainEvent): void {
    if (event instanceof KolMessageIngestedEvent) {
      this.state.lastIngestedAt = event.payload.occurredAt;
    }
  }
}
