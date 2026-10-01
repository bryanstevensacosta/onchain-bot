import * as crypto from 'node:crypto';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

/**
 * ScheduledAd (Tramo 2, todo 6).
 *
 * Domain aggregate for a publishable scheduling post, moved from the
 * backend ads catalog (`crypto-news-ads`) and renamed to the scheduling
 * ubiquitous language (P36: ads -> scheduling).
 *
 * Immutable: every command returns a new instance so the aggregate can
 * never be mutated in place and diverge from what was persisted.
 */
export type ScheduledAdFormat = 'text' | 'photo' | 'video' | 'album';

const SCHEDULED_AD_FORMATS: ReadonlyArray<ScheduledAdFormat> = [
  'text',
  'photo',
  'video',
  'album',
];

export interface ScheduledAdButton {
  readonly text: string;
  readonly url: string;
}

export interface ScheduledAdProps {
  readonly id: string;
  readonly name: string;
  readonly body: string;
  readonly imageMediaId: string | null;
  readonly format: ScheduledAdFormat;
  readonly videoMediaId: string | null;
  readonly albumMediaIds: ReadonlyArray<string> | null;
  readonly buttons: ReadonlyArray<ScheduledAdButton> | null;
  readonly enabled: boolean;
  readonly order: number;
  readonly timesPublished: number;
  readonly consecutiveFailures: number;
  readonly lastPublishedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly expirationAction: 'disable' | 'delete';
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type ScheduledAdSnapshotInput = Omit<
  ScheduledAdProps,
  'format' | 'videoMediaId' | 'albumMediaIds' | 'buttons'
> & {
  format?: ScheduledAdFormat;
  videoMediaId?: string | null;
  albumMediaIds?: ReadonlyArray<string> | null;
  buttons?: ReadonlyArray<ScheduledAdButton> | null;
};

export class ScheduledAd {
  private constructor(private readonly props: ScheduledAdProps) {}

  public static create(input: {
    id?: string;
    name: string;
    body: string;
    imageMediaId?: string | null;
    format?: ScheduledAdFormat;
    videoMediaId?: string | null;
    albumMediaIds?: ReadonlyArray<string> | null;
    buttons?: ReadonlyArray<ScheduledAdButton> | null;
    order?: number;
    expiresAt?: Date | null;
    expirationAction?: 'disable' | 'delete';
  }): ScheduledAd {
    const now = new Date();
    const format = input.format ?? 'text';
    if (!SCHEDULED_AD_FORMATS.includes(format)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `scheduled ad format must be one of: text, photo, video, album (got ${String(format)})`,
      );
    }
    const ad = new ScheduledAd({
      id: input.id ?? crypto.randomUUID(),
      name: input.name,
      body: input.body,
      imageMediaId: input.imageMediaId ?? null,
      format,
      videoMediaId: input.videoMediaId ?? null,
      albumMediaIds: input.albumMediaIds ?? null,
      buttons: input.buttons ?? null,
      enabled: true,
      order: input.order ?? 0,
      timesPublished: 0,
      consecutiveFailures: 0,
      lastPublishedAt: null,
      expiresAt: input.expiresAt ?? null,
      expirationAction: input.expirationAction ?? 'disable',
      createdAt: now,
      updatedAt: now,
    });
    ad.validateInvariants();
    return ad;
  }

  public static fromSnapshot(props: ScheduledAdSnapshotInput): ScheduledAd {
    return new ScheduledAd({
      ...props,
      format: props.format ?? 'text',
      videoMediaId: props.videoMediaId ?? null,
      albumMediaIds: props.albumMediaIds ?? null,
      buttons: props.buttons ?? null,
    });
  }

  public get id(): string {
    return this.props.id;
  }

  public get name(): string {
    return this.props.name;
  }

  public get body(): string {
    return this.props.body;
  }

  public get imageMediaId(): string | null {
    return this.props.imageMediaId;
  }

  public get format(): ScheduledAdFormat {
    return this.props.format;
  }

  public get videoMediaId(): string | null {
    return this.props.videoMediaId;
  }

  public get albumMediaIds(): ReadonlyArray<string> | null {
    return this.props.albumMediaIds;
  }

  public get buttons(): ReadonlyArray<ScheduledAdButton> | null {
    return this.props.buttons;
  }

  public get enabled(): boolean {
    return this.props.enabled;
  }

  public get order(): number {
    return this.props.order;
  }

  public get timesPublished(): number {
    return this.props.timesPublished;
  }

  public get consecutiveFailures(): number {
    return this.props.consecutiveFailures;
  }

  public get lastPublishedAt(): Date | null {
    return this.props.lastPublishedAt;
  }

  public get expiresAt(): Date | null {
    return this.props.expiresAt;
  }

  public get expirationAction(): 'disable' | 'delete' {
    return this.props.expirationAction;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /**
   * Expired when an expiry is configured and reached (inclusive:
   * expiresAt === now counts as expired).
   */
  public isExpired(now: Date): boolean {
    return (
      this.props.expiresAt !== null &&
      this.props.expiresAt.getTime() <= now.getTime()
    );
  }

  public enable(now?: Date): ScheduledAd {
    const reference = now ?? new Date();
    if (this.isExpired(reference)) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `scheduled ad ${this.props.name} is expired — set a future expiry or clear it to re-enable`,
      );
    }
    return this.with({ enabled: true });
  }

  public disable(): ScheduledAd {
    return this.with({ enabled: false });
  }

  public clearExpiry(): ScheduledAd {
    return this.with({ expiresAt: null });
  }

  public markPublished(now: Date): ScheduledAd {
    return this.with({
      timesPublished: this.props.timesPublished + 1,
      consecutiveFailures: 0,
      lastPublishedAt: now,
    });
  }

  public incrementFailure(): ScheduledAd {
    return this.with({
      consecutiveFailures: this.props.consecutiveFailures + 1,
    });
  }

  /**
   * Per-format media invariants: photo needs an image, video needs a
   * video, album needs at least one entry. Called from `create()` and
   * from the PATCH path so a format change without its media 400s.
   */
  public validateInvariants(): void {
    if (this.props.format === 'photo' && this.props.imageMediaId === null) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `scheduled ad ${this.props.name} format 'photo' requires imageMediaId`,
      );
    }
    if (this.props.format === 'video' && this.props.videoMediaId === null) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `scheduled ad ${this.props.name} format 'video' requires videoMediaId`,
      );
    }
    if (
      this.props.format === 'album' &&
      (this.props.albumMediaIds === null ||
        this.props.albumMediaIds.length === 0)
    ) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `scheduled ad ${this.props.name} format 'album' requires at least one albumMediaId`,
      );
    }
  }

  private with(patch: Partial<ScheduledAdProps>): ScheduledAd {
    return new ScheduledAd({ ...this.props, ...patch, updatedAt: new Date() });
  }
}
