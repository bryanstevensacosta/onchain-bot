import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { ChannelId } from 'discovery/ingestion/telegram/domain/value-objects/channel-id.vo';
import { ChannelUsername } from 'discovery/ingestion/telegram/domain/value-objects/channel-username.vo';
import { MessageIngestedEvent } from 'discovery/ingestion/telegram/domain/events/message-ingested.event';

/**
 * Telegram channel being monitored for alpha signals.
 *
 * Aggregate root. Owns the channel's monitoring state.
 */
export class TelegramChannel extends AggregateRoot<string> {
  private readonly state: {
    id: ChannelId;
    username: ChannelUsername | null;
    title: string;
    isActive: boolean;
    lastIngestedAt: Date | null;
    readonly addedAt: Date;
  };

  protected constructor(
    id: ChannelId,
    props: {
      id: ChannelId;
      username: ChannelUsername | null;
      title: string;
      isActive: boolean;
      lastIngestedAt: Date | null;
      readonly addedAt: Date;
    },
  ) {
    super(id.value);
    this.state = props;
  }

  public static create(input: {
    id: ChannelId;
    username: ChannelUsername | null;
    title: string;
  }): TelegramChannel {
    if (!input.title?.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'Channel title cannot be empty',
      );
    }
    return new TelegramChannel(input.id, {
      id: input.id,
      username: input.username,
      title: input.title.trim(),
      isActive: false,
      lastIngestedAt: null,
      addedAt: new Date(),
    });
  }

  /**
   * Rehydrate an existing TelegramChannel from persistence without
   * re-running invariant checks (they already passed when the row was
   * written). Skips the title-non-empty guard because the row already
   * has a non-empty title in the DB — adding a redundant guard here
   * would force persistence mappers to fake-input.
   *
   * For hydration use ONLY. Prefer `create()` for new aggregates.
   */
  public static reconstitute(input: {
    id: ChannelId;
    username: ChannelUsername | null;
    title: string;
    isActive: boolean;
    lastIngestedAt: Date | null;
    addedAt: Date;
  }): TelegramChannel {
    return new TelegramChannel(input.id, {
      id: input.id,
      username: input.username,
      title: input.title,
      isActive: input.isActive,
      lastIngestedAt: input.lastIngestedAt,
      addedAt: input.addedAt,
    });
  }

  public get channelId(): ChannelId {
    return ChannelId.fromString(this._id);
  }

  public get username(): ChannelUsername | null {
    return this.state.username;
  }

  public get title(): string {
    return this.state.title;
  }

  public get isActive(): boolean {
    return this.state.isActive;
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
      new MessageIngestedEvent({
        channelId: this.state.id.value,
        username: this.state.username?.value ?? null,
        messageId: 0,
        occurredAt: new Date(),
      }),
    );
  }

  public stopListening(): void {
    this.state.isActive = false;
  }

  /**
   * Backfill the resolved display title from Telegram (or any external
   * source) without re-creating the aggregate.
   *
   * Only updates when the incoming title is non-empty and different from
   * the current one. Used by the channel seeder + post-connect backfill
   * to replace the "Telegram channel <peerId>" fallback once the MTProto
   * session is available.
   */
  public updateTitle(newTitle: string): void {
    if (!newTitle?.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'Channel title cannot be empty',
      );
    }
    const trimmed = newTitle.trim();
    if (trimmed === this.state.title) {
      return;
    }
    this.state.title = trimmed;
  }

  public recordMessageIngested(
    messageId: number,
    occurredAt: Date,
    text?: string,
  ): void {
    this.state.lastIngestedAt = occurredAt;
    this.apply(
      new MessageIngestedEvent({
        channelId: this.state.id.value,
        username: this.state.username?.value ?? null,
        messageId,
        occurredAt,
        text,
      }),
    );
  }

  protected mutate(event: DomainEvent): void {
    if (event instanceof MessageIngestedEvent) {
      this.state.lastIngestedAt = event.payload.occurredAt;
    }
  }
}
