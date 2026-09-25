import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KolAvatarPhotoPort } from './kol-avatar-photo.port';
import {
  KOL_AVATAR_DIR_NAME,
  KOL_AVATAR_FILE_EXTENSION,
  kolAvatarUrlFor,
  sanitizeAvatarChannelId,
} from './avatar.constants';
import { TelegramFeedSourceRepository } from 'registry/infrastructure/persistence/typeorm/repositories/typeorm-feed-source.repository';

export type KolAvatarFetchStatus = 'fetched' | 'cached' | 'placeholder';

/**
 * KOL avatar store (Tramo 1, todo 13, P19 + P29).
 *
 * Fetch-ONCE at source registration: a stored file means "already fetched"
 * and is never re-downloaded except through the explicit manual refresh
 * (`refresh()`, also the deferred retry after an MTProto failure). No
 * periodic loop — channel photos change rarely by design.
 *
 * P29: every Telegram hit is funneled through one promise tail (serialized,
 * no bursts) and the existing flood-wait guard (see the photo adapter).
 * Permanent storage: `{uploadsRoot}/avatar/{channelId}.jpg` — outside the
 * janitor's `feed/media` tree, excluded from the 72h retention by
 * construction (`kol-avatar.janitor.spec.ts` pins it).
 *
 * Never throws for Telegram/DB trouble: MTProto failure → `placeholder`
 * (warn + retry later via refresh); source-row bookkeeping is best-effort.
 */
@Injectable()
export class KolAvatarService {
  private readonly logger = new Logger(KolAvatarService.name);
  private tail: Promise<void> = Promise.resolve();

  public constructor(
    private readonly config: ConfigService,
    private readonly photos: KolAvatarPhotoPort,
    @Optional() private readonly sources?: TelegramFeedSourceRepository,
  ) {}

  public avatarUrlFor(channelId: string): string {
    return kolAvatarUrlFor(channelId);
  }

  public avatarDir(): string {
    const app = this.readAppConfig();
    const root: string =
      typeof app?.uploads?.root === 'string' && app.uploads.root.length > 0
        ? app.uploads.root
        : join(process.cwd(), 'uploads');
    return join(root, KOL_AVATAR_DIR_NAME);
  }

  public avatarFilePath(channelId: string): string {
    return join(
      this.avatarDir(),
      `${sanitizeAvatarChannelId(channelId)}${KOL_AVATAR_FILE_EXTENSION}`,
    );
  }

  public hasAvatar(channelId: string): boolean {
    const clean = sanitizeAvatarChannelId(channelId);
    if (clean.length === 0) {
      return false;
    }
    return existsSync(this.avatarFilePath(channelId));
  }

  /**
   * Fetch-ONCE: no-op (`cached`) when a file already exists; otherwise one
   * guarded MTProto download. MTProto miss/error → `placeholder` (no throw;
   * retry explicitly via `refresh()`).
   */
  public async fetchOnce(channelId: string): Promise<KolAvatarFetchStatus> {
    return this.enqueue(() => this.fetchAndStore(channelId, false));
  }

  /**
   * Explicit manual refresh (P19: the ONLY re-fetch path). Re-downloads
   * even when a file exists; MTProto miss/error keeps the old file (when
   * any) and reports `placeholder`.
   */
  public async refresh(channelId: string): Promise<KolAvatarFetchStatus> {
    return this.enqueue(() => this.fetchAndStore(channelId, true));
  }

  private enqueue(
    work: () => Promise<KolAvatarFetchStatus>,
  ): Promise<KolAvatarFetchStatus> {
    const run: Promise<KolAvatarFetchStatus> = this.tail.then(work, work);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async fetchAndStore(
    channelId: string,
    force: boolean,
  ): Promise<KolAvatarFetchStatus> {
    if (!force && this.hasAvatar(channelId)) {
      return 'cached';
    }
    let photo: Buffer | null = null;
    try {
      photo = await this.photos.fetchChannelPhoto(channelId);
    } catch (error) {
      this.logger.warn(
        `Avatar photo port threw for ${channelId} (${error instanceof Error ? error.message : String(error)}) — serving placeholder`,
      );
      photo = null;
    }
    if (!photo || photo.length === 0) {
      return 'placeholder';
    }
    mkdirSync(this.avatarDir(), { recursive: true });
    const filePath = this.avatarFilePath(channelId);
    writeFileSync(filePath, photo);
    await this.recordAvatar(channelId, filePath);
    return 'fetched';
  }

  private async recordAvatar(
    channelId: string,
    filePath: string,
  ): Promise<void> {
    if (!this.sources) {
      return;
    }
    try {
      const row = await this.sources.findByChannelId(channelId);
      if (!row) {
        return;
      }
      (row as { avatarPath?: string | null }).avatarPath = filePath;
      (row as { avatarUpdatedAt?: Date | null }).avatarUpdatedAt = new Date();
      await this.sources.save(row);
    } catch (error) {
      this.logger.warn(
        `Avatar bookkeeping failed for ${channelId} (${error instanceof Error ? error.message : String(error)}) — file kept, row untouched`,
      );
    }
  }

  private readAppConfig(): {
    uploads?: { root?: unknown };
  } | null {
    try {
      const app: { uploads?: { root?: unknown } } | null =
        this.config.get('app') ?? null;
      return app;
    } catch {
      return null;
    }
  }
}
