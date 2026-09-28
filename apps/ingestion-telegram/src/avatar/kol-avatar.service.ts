import {
  mkdirSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KolAvatarPhotoPort } from './kol-avatar-photo.port';
import {
  KOL_AVATAR_DIR_NAME,
  KOL_AVATAR_FILE_EXTENSION,
  avatarFileNameFor,
  kolAvatarUrlFor,
  sanitizeAvatarChannelId,
} from './avatar.constants';
import { TelegramFeedSourceRepository } from 'registry/infrastructure/persistence/typeorm/repositories/typeorm-feed-source.repository';

export type KolAvatarFetchStatus = 'fetched' | 'cached' | 'placeholder';

export interface KolAvatarBackfillResult {
  readonly checked: number;
  readonly fetched: number;
  readonly cached: number;
  readonly placeholder: number;
}

/**
 * Channel avatar store (Tramo 1, todo 13, P19 + P29; avatar-total todo 12, P57).
 *
 * @deprecated P58: fetch-serve ownership moved to `MetadataService`
 * (`src/metadata/metadata.service.ts`, same fetch-once + serialize +
 * filename + dedupe behavior, parity-pinned). This service keeps working
 * during dual-write (files shared under `uploads/avatar/`); metadata
 * mirrors bookkeeping to its own table. DELETION after staging is green
 * (schema §4 step 5).
 *
 * Fetch-ONCE at source registration FOR EVERY source type (kol-only
 * filter removed in central todo 12): a stored file means "already
 * fetched" and is never re-downloaded except through the explicit manual
 * refresh (`refresh()`, also the deferred retry after an MTProto failure
 * and the `backfillMissing()` catch-up for pre-avatar rows). No
 * periodic loop — channel photos change rarely by design.
 *
 * Filenames carry the @handle (`{channelId}__{handle}.jpg`, legacy bare
 * `{channelId}.jpg` files migrate lazily on fetch/refresh/backfill).
 * At most ONE file per channel ever exists on disk (no-dup): colliding
 * legacy + handle-named files dedupe to the handle-qualified name.
 *
 * P29: every Telegram hit is funneled through one promise tail (serialized,
 * no bursts) and the existing flood-wait guard (see the photo adapter).
 * Permanent storage: `{uploadsRoot}/avatar/` — outside the janitor's
 * `feed-media` tree, excluded from the 24h retention by construction
 * (`kol-avatar.janitor.spec.ts` pins it).
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

  public avatarFilePath(channelId: string, handle?: string | null): string {
    return join(this.avatarDir(), avatarFileNameFor(channelId, handle));
  }

  /**
   * Resolve the stored avatar file for a channel, any filename variant.
   *
   * Matches `{sanitizedChannelId}*.jpg` (legacy bare + handle-qualified)
   * so pre-migration files keep serving. Newest variant wins when both
   * exist (the migration dedupes them right after). `null` = no file
   * (placeholder served downstream). Never throws.
   */
  public findAvatarFile(channelId: string): string | null {
    const clean = sanitizeAvatarChannelId(channelId);
    if (clean.length === 0) {
      return null;
    }
    let entries: string[];
    try {
      entries = readdirSync(this.avatarDir());
    } catch {
      return null;
    }
    const matches = entries
      .filter(
        (name) =>
          name.startsWith(clean) && name.endsWith(KOL_AVATAR_FILE_EXTENSION),
      )
      .map((name) => join(this.avatarDir(), name));
    if (matches.length === 0) {
      return null;
    }
    if (matches.length === 1) {
      return matches[0];
    }
    // Collision (legacy + handle-named): prefer the handle-qualified file.
    const qualified = matches.filter((filePath) => filePath.includes('__'));
    return qualified[qualified.length - 1] ?? matches[matches.length - 1];
  }

  public hasAvatar(channelId: string): boolean {
    const clean = sanitizeAvatarChannelId(channelId);
    if (clean.length === 0) {
      return false;
    }
    return this.findAvatarFile(channelId) !== null;
  }

  /**
   * Migrate a channel's avatar filename to the handle-qualified form.
   *
   * Best-effort + idempotent: renames a lone legacy file, dedupes
   * colliding legacy + handle files to ONE (keeps the handle-qualified
   * one), no-ops when nothing is stored or no handle is known. Never
   * throws (rename races / missing files just warn).
   */
  public migrateFilename(channelId: string, handle?: string | null): void {
    const clean = sanitizeAvatarChannelId(channelId);
    if (clean.length === 0) {
      return;
    }
    let entries: string[];
    try {
      entries = readdirSync(this.avatarDir());
    } catch {
      return;
    }
    const expected = avatarFileNameFor(channelId, handle);
    const owned = entries.filter(
      (name) =>
        name.startsWith(clean) && name.endsWith(KOL_AVATAR_FILE_EXTENSION),
    );
    if (owned.length === 0) {
      return;
    }
    try {
      if (owned.length === 1 && owned[0] === expected) {
        return;
      }
      const expectedPath = join(this.avatarDir(), expected);
      if (owned.includes(expected)) {
        // Collision: drop every non-expected sibling (no-dup).
        for (const name of owned) {
          if (name !== expected) {
            unlinkSync(join(this.avatarDir(), name));
          }
        }
        return;
      }
      // Lone legacy file → rename to the handle-qualified name.
      if (owned.length === 1) {
        renameSync(join(this.avatarDir(), owned[0]), expectedPath);
      } else {
        // Several legacy-shape files (should not happen): keep one.
        renameSync(join(this.avatarDir(), owned[0]), expectedPath);
        for (const name of owned.slice(1)) {
          unlinkSync(join(this.avatarDir(), name));
        }
      }
    } catch (error) {
      this.logger.warn(
        `Avatar filename migration failed for ${channelId} (${error instanceof Error ? error.message : String(error)}) — legacy file kept serving`,
      );
    }
  }

  /**
   * Fetch-ONCE: no-op (`cached`) when a file already exists; otherwise one
   * guarded MTProto download. MTProto miss/error → `placeholder` (no throw;
   * retry explicitly via `refresh()`).
   */
  public async fetchOnce(
    channelId: string,
    handle?: string | null,
  ): Promise<KolAvatarFetchStatus> {
    return this.enqueue(() => this.fetchAndStore(channelId, false, handle));
  }

  /**
   * Explicit manual refresh (P19: the ONLY re-fetch path). Re-downloads
   * even when a file exists; MTProto miss/error keeps the old file (when
   * any) and reports `placeholder`.
   */
  public async refresh(
    channelId: string,
    handle?: string | null,
  ): Promise<KolAvatarFetchStatus> {
    return this.enqueue(() => this.fetchAndStore(channelId, true, handle));
  }

  /**
   * Backfill avatars for pre-avatar rows (central todo 12, P57).
   *
   * Walks every source row and fetches ONLY the ones with no file on
   * disk (fetch-once respected — cached rows never hit MTProto). Each
   * fetch runs through the serialized tail (P29, no bursts); per-row
   * MTProto misses count as `placeholder` and never throw. Returns
   * totals for the operator log.
   */
  public async backfillMissing(): Promise<KolAvatarBackfillResult> {
    if (!this.sources) {
      return { checked: 0, fetched: 0, cached: 0, placeholder: 0 };
    }
    let rows: ReadonlyArray<{ channelId: string; handle: string | null }>;
    try {
      const all = await this.sources.findAll();
      rows = all.map((row) => ({
        channelId: row.channelId,
        handle: (row as { handle?: string | null }).handle ?? null,
      }));
    } catch (error) {
      this.logger.warn(
        `Avatar backfill aborted: source list unreadable (${error instanceof Error ? error.message : String(error)})`,
      );
      return { checked: 0, fetched: 0, cached: 0, placeholder: 0 };
    }
    let fetched = 0;
    let cached = 0;
    let placeholder = 0;
    for (const row of rows) {
      const status = await this.fetchOnce(row.channelId, row.handle);
      if (status === 'fetched') {
        fetched += 1;
      } else if (status === 'cached') {
        cached += 1;
      } else {
        placeholder += 1;
      }
    }
    const result = {
      checked: rows.length,
      fetched,
      cached,
      placeholder,
    };
    this.logger.log(
      `Avatar backfill complete: checked=${result.checked} fetched=${result.fetched} cached=${result.cached} placeholder=${result.placeholder}`,
    );
    return result;
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
    handle?: string | null,
  ): Promise<KolAvatarFetchStatus> {
    if (!force && this.hasAvatar(channelId)) {
      this.migrateFilename(channelId, handle);
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
    this.migrateFilename(channelId, handle);
    const existing = this.findAvatarFile(channelId);
    const filePath = existing ?? this.avatarFilePath(channelId, handle);
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
