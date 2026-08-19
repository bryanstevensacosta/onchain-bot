import * as crypto from 'node:crypto';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

/**
 * Domain aggregate for a publishable crypto-news ad.
 *
 * Not an ORM entity. Owns no persistence annotations — the TypeORM
 * shape lives at
 * `infrastructure/persistence/typeorm/entities/ad.entity.ts` and the
 * mapper translates between the two.
 *
 * Immutable: every command returns a new instance (matching the
 * `SharedThrottleState.withLastPublishAt` style) so the aggregate can
 * never be mutated in place and accidentally diverge from what was
 * persisted.
 */
export type AdFormat = 'text' | 'photo' | 'video' | 'album';

const AD_FORMATS: readonly AdFormat[] = ['text', 'photo', 'video', 'album'];

export type AdButton = { readonly text: string; readonly url: string };

export interface AdProps {
  readonly id: string;
  readonly name: string;
  readonly body: string;
  readonly imageMediaId: string | null;
  readonly format: AdFormat;
  readonly videoMediaId: string | null;
  readonly albumMediaIds: string[] | null;
  readonly buttons: AdButton[] | null;
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

/**
 * Snapshot input for `fromSnapshot` — the three format fields and
 * `buttons` are optional so pre-format call sites (and legacy rows)
 * hydrate with defaults instead of breaking.
 */
export type AdSnapshotInput = Omit<
  AdProps,
  'format' | 'videoMediaId' | 'albumMediaIds' | 'buttons'
> & {
  format?: AdFormat;
  videoMediaId?: string | null;
  albumMediaIds?: string[] | null;
  buttons?: AdButton[] | null;
};

export class Ad {
  private constructor(private readonly props: AdProps) {}

  public static create(input: {
    id?: string;
    name: string;
    body: string;
    imageMediaId?: string | null;
    format?: AdFormat;
    videoMediaId?: string | null;
    albumMediaIds?: string[] | null;
    buttons?: AdButton[] | null;
    order?: number;
    expiresAt?: Date | null;
    expirationAction?: 'disable' | 'delete';
  }): Ad {
    const now = new Date();
    const format = input.format ?? 'text';
    if (!AD_FORMATS.includes(format)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `ad format must be one of: text, photo, video, album (got ${String(format)})`,
      );
    }
    const ad = new Ad({
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

  public static fromSnapshot(props: AdSnapshotInput): Ad {
    return new Ad({
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

  public get format(): AdFormat {
    return this.props.format;
  }

  public get videoMediaId(): string | null {
    return this.props.videoMediaId;
  }

  public get albumMediaIds(): string[] | null {
    return this.props.albumMediaIds;
  }

  public get buttons(): AdButton[] | null {
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
   * An ad is expired when an expiry is configured and it has been
   * reached (inclusive boundary: expiresAt === now counts as expired).
   */
  public isExpired(now: Date): boolean {
    return (
      this.props.expiresAt !== null &&
      this.props.expiresAt.getTime() <= now.getTime()
    );
  }

  public enable(now?: Date): Ad {
    const reference = now ?? new Date();
    if (this.isExpired(reference)) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `ad ${this.props.name} is expired — set a future expiry or clear it to re-enable`,
      );
    }
    return this.with({ enabled: true });
  }

  public disable(): Ad {
    return this.with({ enabled: false });
  }

  public clearExpiry(): Ad {
    return this.with({ expiresAt: null });
  }

  public markPublished(now: Date): Ad {
    return this.with({
      timesPublished: this.props.timesPublished + 1,
      consecutiveFailures: 0,
      lastPublishedAt: now,
    });
  }

  public incrementFailure(): Ad {
    return this.with({
      consecutiveFailures: this.props.consecutiveFailures + 1,
    });
  }

  public bumpOrder(n: number): Ad {
    return this.with({ order: this.props.order + n });
  }

  /**
   * Enforces per-format media invariants:
   *  - `photo` requires `imageMediaId`
   *  - `video` requires `videoMediaId`
   *  - `album` requires at least one `albumMediaId`
   * Throws DomainError(VALIDATION) when violated. Called from `create()`
   * and from the application-layer patch path (`applyAdPatch`).
   */
  public validateInvariants(): void {
    if (this.props.format === 'photo' && this.props.imageMediaId === null) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `ad ${this.props.name} format 'photo' requires imageMediaId`,
      );
    }
    if (this.props.format === 'video' && this.props.videoMediaId === null) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `ad ${this.props.name} format 'video' requires videoMediaId`,
      );
    }
    if (
      this.props.format === 'album' &&
      (this.props.albumMediaIds === null ||
        this.props.albumMediaIds.length === 0)
    ) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `ad ${this.props.name} format 'album' requires at least one albumMediaId`,
      );
    }
  }

  private with(patch: Partial<AdProps>): Ad {
    return new Ad({ ...this.props, ...patch, updatedAt: new Date() });
  }
}
