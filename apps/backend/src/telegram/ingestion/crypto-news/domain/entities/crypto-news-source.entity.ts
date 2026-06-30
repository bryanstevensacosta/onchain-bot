import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { CryptoNewsSourceSeededEvent } from 'telegram/ingestion/crypto-news/domain/events/crypto-news-source-seeded.event';

/**
 * Lifecycle status of a tracked crypto-news Telegram source.
 *
 * - `ACTIVE`: ingestion is enabled; the listener is consuming messages.
 * - `INACTIVE`: registered but ingestion is paused.
 */
export type CryptoNewsSourceLifecycleStatus = 'ACTIVE' | 'INACTIVE';

interface CryptoNewsSourceProps {
  readonly channelId: string;
  readonly handle: string | null;
  title: string;
  isActive: boolean;
  lifecycleStatus: CryptoNewsSourceLifecycleStatus;
  readonly addedAt: Date;
}

/**
 * Telegram channel registered as a crypto-news ingestion source.
 *
 * Aggregate root. Distinct from `Kol` (Key Opinion Leader) — news sources
 * produce content that is persisted as-is to `crypto_news_messages` and
 * served via the /crypto-news API. They do NOT flow through the token
 * alpha pipeline (extraction → parsing → ...).
 *
 * Created in `telegram/ingestion/crypto-news/` as part of the
 * crypto-news-ingestion refactor.
 */
export class CryptoNewsSource extends AggregateRoot<string> {
  private readonly state: CryptoNewsSourceProps;

  protected constructor(id: string, props: CryptoNewsSourceProps) {
    super(id);
    this.state = props;
  }

  public static create(input: {
    channelId: string;
    handle: string | null;
    title: string;
  }): CryptoNewsSource {
    if (!/^-?\d+$/.test(input.channelId)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid crypto-news channelId: ${input.channelId}`,
        { channelId: input.channelId },
      );
    }
    if (!input.title?.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'CryptoNewsSource title cannot be empty',
      );
    }
    const source = new CryptoNewsSource(input.channelId, {
      channelId: input.channelId,
      handle: input.handle,
      title: input.title.trim(),
      isActive: false,
      lifecycleStatus: 'ACTIVE',
      addedAt: new Date(),
    });
    source.apply(
      new CryptoNewsSourceSeededEvent({
        channelId: input.channelId,
        title: input.title.trim(),
        handle: input.handle,
      }),
    );
    return source;
  }

  /**
   * Rehydrate an existing source from persistence without re-running
   * invariant checks. For hydration use ONLY — prefer `create()` for new
   * aggregates.
   */
  public static reconstitute(input: CryptoNewsSourceProps): CryptoNewsSource {
    return new CryptoNewsSource(input.channelId, input);
  }

  public get channelId(): string {
    return this.state.channelId;
  }

  public get handle(): string | null {
    return this.state.handle;
  }

  public get title(): string {
    return this.state.title;
  }

  public get isActive(): boolean {
    return this.state.isActive;
  }

  public get lifecycleStatus(): CryptoNewsSourceLifecycleStatus {
    return this.state.lifecycleStatus;
  }

  public get addedAt(): Date {
    return this.state.addedAt;
  }

  public activate(): void {
    this.state.lifecycleStatus = 'ACTIVE';
    this.state.isActive = true;
  }

  public deactivate(): void {
    this.state.lifecycleStatus = 'INACTIVE';
    this.state.isActive = false;
  }

  public updateTitle(newTitle: string): void {
    if (!newTitle?.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'CryptoNewsSource title cannot be empty',
      );
    }
    const trimmed = newTitle.trim();
    if (trimmed === this.state.title) {
      return;
    }
    this.state.title = trimmed;
  }

  protected mutate(event: DomainEvent): void {
    // CryptoNewsSourceSeededEvent does not mutate state — it records
    // the fact of registration. The aggregate state is already set in
    // create() before apply() is called.
    if (event instanceof CryptoNewsSourceSeededEvent) {
      // no-op: state is set in create()
    }
  }
}
