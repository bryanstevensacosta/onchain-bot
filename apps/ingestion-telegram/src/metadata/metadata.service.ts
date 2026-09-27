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
import { MetadataPhotoPort } from './metadata-photo.port';
import { MetadataRepository } from './metadata.repository';
import type { TelegramChannelMetadataEntity } from './channel-metadata.entity';
import {
  METADATA_AVATAR_DIR_NAME,
  METADATA_AVATAR_FILE_EXTENSION,
  avatarFileNameFor,
  metadataAvatarUrlFor,
  sanitizeAvatarChannelId,
  sourceUrlFor,
} from './metadata.constants';
import {
  isSubscribableMetadataKind,
  peerTypeForKind,
  type MetadataKind,
} from './metadata-kind';
import { TelegramListenerPort } from 'core/ports/telegram-listener.port';
import { TelegramFeedSourceRepository } from 'registry/infrastructure/persistence/typeorm/repositories/typeorm-feed-source.repository';

export type MetadataAvatarStatus = 'fetched' | 'cached' | 'placeholder';

export interface RegistryMirrorFields {
  readonly handle?: string | null;
  readonly title?: string | null;
  readonly kind?: MetadataKind | null;
  readonly isBot?: boolean | null;
  /** User rows only — STORED, NEVER EXPOSED (write-only at rest). */
  readonly phone?: string | null;
}

/**
 * Public identity view (P58). Carries kind/handle/photo-url/url/type per
 * id. NEVER carries `phone`, `avatar_path`, or photo refs — those stay at
 * rest (schema §2 privacy). Read-only consumers (feed/stream/media/core)
 * project through here; they hold no local copies.
 */
export interface ChannelMetadataView {
  readonly channelId: string;
  readonly peerType: string | null;
  readonly kind: string | null;
  readonly title: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly handle: string | null;
  readonly usernames: ReadonlyArray<string> | null;
  readonly about: string | null;
  readonly isBot: boolean;
  readonly verified: boolean;
  readonly isScam: boolean;
  readonly isFake: boolean;
  readonly participantsCount: number | null;
  readonly url: string | null;
  readonly avatarUrl: string;
  readonly fetchStatus: string;
  readonly updatedAt: string | null;
}

export interface MetadataBackfillResult {
  readonly checked: number;
  readonly fetched: number;
  readonly cached: number;
  readonly placeholder: number;
}

/**
 * Central channel-metadata store (P58, `metadata/` BC absorbing `avatar/`).
 *
 * Owns identity per Telegram id: the `getEntity` taxonomy
 * (kind/handle/phone-if-present/photo/url/type) persisted in
 * `telegram_channel_metadata`, plus the permanent avatar files under
 * `{uploadsRoot}/avatar/` (absorbed fetch-serve logic — same fetch-once +
 * promise-tail serialize + legacy/handle-qualified filenames + single-file
 * dedupe as the old `KolAvatarService`).
 *
 * Split of responsibilities (schema §4):
 * - identity (kind/handle/photo/url/type) lives HERE, referenced by id;
 * - `registry/` keeps subscription state (active/type) and mirrors display
 *   columns during dual-write (`adoptRegistryRow` is the mirror entry).
 *
 * Fetch budget (schema §1): 1 `getEntity` per refresh + at most 1 photo
 * fetch, all inside the existing flood guard (P29, no new limiter). No
 * periodic loop — fetch-once at registration + explicit refresh/backfill.
 * Never throws for Telegram/DB trouble: misses resolve to placeholder
 * views (fail-open), retries go through explicit refresh.
 */
@Injectable()
export class MetadataService {
  private readonly logger = new Logger(MetadataService.name);
  private tail: Promise<void> = Promise.resolve();

  public constructor(
    private readonly config: ConfigService,
    private readonly photos: MetadataPhotoPort,
    private readonly metadata: MetadataRepository,
    @Optional() private readonly listener?: TelegramListenerPort,
    @Optional() private readonly sources?: TelegramFeedSourceRepository,
  ) {}

  public avatarUrlFor(channelId: string): string {
    return metadataAvatarUrlFor(channelId);
  }

  public avatarDir(): string {
    const app = this.readAppConfig();
    const root: string =
      typeof app?.uploads?.root === 'string' && app.uploads.root.length > 0
        ? app.uploads.root
        : join(process.cwd(), 'uploads');
    return join(root, METADATA_AVATAR_DIR_NAME);
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
          name.startsWith(clean) &&
          name.endsWith(METADATA_AVATAR_FILE_EXTENSION),
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
        name.startsWith(clean) && name.endsWith(METADATA_AVATAR_FILE_EXTENSION),
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
        `Metadata avatar filename migration failed for ${channelId} (${error instanceof Error ? error.message : String(error)}) — legacy file kept serving`,
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
  ): Promise<MetadataAvatarStatus> {
    return this.enqueue(() => this.fetchAndStore(channelId, false, handle));
  }

  /**
   * Explicit manual refresh (P58: the ONLY re-fetch path alongside the
   * metadata refresh). Re-downloads even when a file exists; MTProto
   * miss/error keeps the old file (when any) and reports `placeholder`.
   */
  public async refresh(
    channelId: string,
    handle?: string | null,
  ): Promise<MetadataAvatarStatus> {
    return this.enqueue(() => this.fetchAndStore(channelId, true, handle));
  }

  /**
   * Backfill avatars + identity for pre-metadata rows (P58 catch-up).
   *
   * Walks every registry row (the subscription catalog) and adopts each
   * into metadata + fetches ONLY the ones with no file on disk
   * (fetch-once respected — cached rows never hit MTProto). Each fetch
   * runs through the serialized tail (P29, no bursts); per-row MTProto
   * misses count as `placeholder` and never throw. Without a registry
   * (unit scope) falls back to the metadata rows themselves.
   */
  public async backfillMissing(): Promise<MetadataBackfillResult> {
    const rows = await this.backfillCandidates();
    let fetched = 0;
    let cached = 0;
    let placeholder = 0;
    for (const row of rows) {
      await this.adoptRegistryRow(row.channelId, {
        handle: row.handle,
        title: row.title,
        kind: row.kind,
        isBot: row.isBot,
      });
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
      `Metadata backfill complete: checked=${result.checked} fetched=${result.fetched} cached=${result.cached} placeholder=${result.placeholder}`,
    );
    return result;
  }

  /**
   * Public identity view for one id (read-only consumers use this).
   *
   * Fail-open: unknown ids and DB trouble resolve to `null` (callers fall
   * back to their mirrors). NEVER carries `phone`.
   */
  public async getView(channelId: string): Promise<ChannelMetadataView | null> {
    const row = await this.safeFind(channelId);
    if (!row) {
      return null;
    }
    return this.toView(row);
  }

  /**
   * Resolve identity for one id (metadata-first read path).
   *
   * Returns the stored row when present; otherwise one best-effort
   * `getEntity` via the listener port (single call, flood-guarded),
   * persisted fail-open (MTProto trouble → `miss` row keeps the id known
   * without blocking registration). Rejects user/bot/unknown with an
   * explicit error (callers map to 400); NULL-kind rows stay fail-open.
   */
  public async resolve(channelId: string): Promise<ChannelMetadataView> {
    const stored = await this.safeFind(channelId);
    if (stored) {
      return this.toView(stored);
    }
    const probed = await this.probeListener(channelId);
    const kind: MetadataKind | null = probed?.kind ?? null;
    if (kind && !isSubscribableMetadataKind(kind)) {
      throw new Error(
        `Cannot subscribe to ${kind} '${channelId}': only Telegram channels and groups can be registered as feed sources (bots and users are rejected).`,
      );
    }
    const row = this.metadata.create(channelId, {
      peerType: kind ? peerTypeForKind(kind) : null,
      kind,
      title: probed?.title ?? channelId,
      handle: probed?.handle ?? null,
      isBot: probed?.isBot ?? false,
      fetchStatus: probed ? 'ok' : 'miss',
    });
    try {
      const saved = await this.metadata.save(row);
      return this.toView(saved);
    } catch (error) {
      this.logger.warn(
        `Metadata resolve persist failed for ${channelId} (${error instanceof Error ? error.message : String(error)}) — serving transient view`,
      );
      return this.toView(row);
    }
  }

  /**
   * Explicit manual metadata refresh (re-resolve + photo re-fetch).
   */
  public async refreshMetadata(
    channelId: string,
    handle?: string | null,
  ): Promise<ChannelMetadataView> {
    const probed = await this.probeListener(channelId);
    const existing = await this.safeFind(channelId);
    const row =
      existing ??
      this.metadata.create(channelId, {
        title: probed?.title ?? channelId,
      });
    if (probed) {
      row.peerType = peerTypeForKind(probed.kind);
      row.kind = probed.kind;
      row.title = probed.title;
      row.handle = handle ?? probed.handle ?? row.handle ?? null;
      row.isBot = probed.isBot;
      row.fetchStatus = 'ok';
    }
    const photo = await this.refresh(channelId, row.handle);
    if (photo === 'placeholder' && !probed) {
      row.fetchStatus = 'miss';
    }
    try {
      const saved = await this.metadata.save(row);
      return this.toView(saved);
    } catch (error) {
      this.logger.warn(
        `Metadata refresh persist failed for ${channelId} (${error instanceof Error ? error.message : String(error)}) — serving transient view`,
      );
      return this.toView(row);
    }
  }

  /**
   * Dual-write mirror entry (schema §4 step 1): registry calls this on
   * register/batch/PATCH so identity lands in metadata by id while the
   * catalog keeps subscription state (active/type).
   *
   * Create-or-merge: existing rows keep their stored values unless the
   * mirror carries a change. `phone` is preserved once stored (a NULL
   * mirror never clears it) and is NEVER returned. Never throws.
   */
  public async adoptRegistryRow(
    channelId: string,
    fields: RegistryMirrorFields,
  ): Promise<void> {
    try {
      const existing = await this.metadata.findByChannelId(channelId);
      if (!existing) {
        const created = this.metadata.create(channelId, {
          peerType: fields.kind ? peerTypeForKind(fields.kind) : null,
          kind: fields.kind ?? null,
          title: fields.title?.trim() || channelId,
          handle: fields.handle?.trim() || null,
          isBot: fields.isBot ?? false,
          phone: fields.phone ?? null,
          fetchStatus: fields.kind ? 'ok' : 'miss',
        });
        await this.metadata.save(created);
        return;
      }
      let touched = false;
      const nextTitle = fields.title?.trim();
      if (nextTitle && nextTitle !== existing.title) {
        existing.title = nextTitle;
        touched = true;
      }
      if (fields.handle !== undefined) {
        const nextHandle = fields.handle?.trim() || null;
        if (nextHandle !== existing.handle) {
          existing.handle = nextHandle;
          touched = true;
        }
      }
      if (fields.kind !== undefined && fields.kind !== existing.kind) {
        existing.kind = fields.kind;
        existing.peerType = fields.kind ? peerTypeForKind(fields.kind) : null;
        touched = true;
      }
      if (
        fields.isBot !== undefined &&
        fields.isBot !== null &&
        fields.isBot !== existing.isBot
      ) {
        existing.isBot = fields.isBot;
        touched = true;
      }
      if (fields.phone && !existing.phone) {
        existing.phone = fields.phone;
        touched = true;
      }
      if (touched) {
        await this.metadata.save(existing);
      }
    } catch (error) {
      this.logger.warn(
        `Metadata mirror failed for ${channelId} (${error instanceof Error ? error.message : String(error)}) — registry row kept, identity retry via refresh`,
      );
    }
  }

  /**
   * Project a row to its public view. The ONLY projection boundary:
   * `phone`, `avatar_path`, and photo refs never leave this method.
   */
  public toView(row: TelegramChannelMetadataEntity): ChannelMetadataView {
    return {
      channelId: row.channelId,
      peerType: row.peerType ?? null,
      kind: row.kind ?? null,
      title: row.title,
      firstName: row.firstName ?? null,
      lastName: row.lastName ?? null,
      handle: row.handle ?? null,
      usernames: row.usernames ? [...row.usernames] : null,
      about: row.about ?? null,
      isBot: row.isBot ?? false,
      verified: row.verified ?? false,
      isScam: row.isScam ?? false,
      isFake: row.isFake ?? false,
      participantsCount: row.participantsCount ?? null,
      url: sourceUrlFor(row.handle),
      avatarUrl: metadataAvatarUrlFor(row.channelId),
      fetchStatus: row.fetchStatus ?? 'miss',
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    };
  }

  private enqueue(
    work: () => Promise<MetadataAvatarStatus>,
  ): Promise<MetadataAvatarStatus> {
    const run: Promise<MetadataAvatarStatus> = this.tail.then(work, work);
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
  ): Promise<MetadataAvatarStatus> {
    if (!force && this.hasAvatar(channelId)) {
      this.migrateFilename(channelId, handle);
      return 'cached';
    }
    let photo: Buffer | null = null;
    try {
      photo = await this.photos.fetchChannelPhoto(channelId);
    } catch (error) {
      this.logger.warn(
        `Metadata photo port threw for ${channelId} (${error instanceof Error ? error.message : String(error)}) — serving placeholder`,
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
    await this.recordAvatar(channelId, filePath, handle);
    return 'fetched';
  }

  /**
   * Avatar bookkeeping (absorbed from `avatar/`, schema §2 + §3).
   *
   * Writes the metadata row (`avatar_path`/`avatar_updated_at`) and
   * mirrors the same columns to the registry row (dual-write, schema §4
   * step 1 — the registry mirror goes read-dead after cutover). The FILE
   * stays the source of truth for serving. Never throws.
   */
  private async recordAvatar(
    channelId: string,
    filePath: string,
    handle?: string | null,
  ): Promise<void> {
    try {
      let row = await this.metadata.findByChannelId(channelId);
      if (!row) {
        const seed = this.sources
          ? await this.sources.findByChannelId(channelId)
          : null;
        row = this.metadata.create(channelId, {
          title: seed?.title ?? channelId,
          handle: handle ?? seed?.handle ?? null,
          fetchStatus: 'ok',
        });
      }
      row.avatarPath = filePath;
      row.avatarUpdatedAt = new Date();
      if (handle && !row.handle) {
        row.handle = handle;
      }
      await this.metadata.save(row);
    } catch (error) {
      this.logger.warn(
        `Metadata avatar bookkeeping failed for ${channelId} (${error instanceof Error ? error.message : String(error)}) — file kept, row untouched`,
      );
    }
    if (this.sources) {
      try {
        const source = await this.sources.findByChannelId(channelId);
        if (source) {
          (source as { avatarPath?: string | null }).avatarPath = filePath;
          (source as { avatarUpdatedAt?: Date | null }).avatarUpdatedAt =
            new Date();
          await this.sources.save(source);
        }
      } catch (error) {
        this.logger.warn(
          `Registry avatar mirror failed for ${channelId} (${error instanceof Error ? error.message : String(error)}) — metadata row kept`,
        );
      }
    }
  }

  private async backfillCandidates(): Promise<
    ReadonlyArray<{
      channelId: string;
      handle: string | null;
      title?: string | null;
      kind?: MetadataKind | null;
      isBot?: boolean | null;
    }>
  > {
    if (this.sources) {
      try {
        const all = await this.sources.findAll();
        return all.map((row) => ({
          channelId: row.channelId,
          handle: (row as { handle?: string | null }).handle ?? null,
          title: (row as { title?: string }).title ?? null,
          kind:
            ((row as { entityKind?: string | null })
              .entityKind as MetadataKind | null) ?? null,
          isBot: (row as { isBot?: boolean | null }).isBot ?? null,
        }));
      } catch (error) {
        this.logger.warn(
          `Metadata backfill aborted: source list unreadable (${error instanceof Error ? error.message : String(error)})`,
        );
        return [];
      }
    }
    try {
      const all = await this.metadata.findAll();
      return all.map((row) => ({
        channelId: row.channelId,
        handle: row.handle ?? null,
      }));
    } catch {
      return [];
    }
  }

  private async safeFind(
    channelId: string,
  ): Promise<TelegramChannelMetadataEntity | null> {
    try {
      return await this.metadata.findByChannelId(channelId);
    } catch {
      return null;
    }
  }

  private async probeListener(channelId: string): Promise<{
    kind: MetadataKind;
    title: string;
    handle: string | null;
    isBot: boolean;
  } | null> {
    if (!this.listener) {
      return null;
    }
    try {
      const meta = await this.listener.resolveChannelMetadata(channelId);
      return {
        kind: meta?.kind ?? 'unknown',
        title: meta?.title ?? channelId,
        handle: meta?.handle ?? null,
        isBot: meta?.isBot ?? false,
      };
    } catch (error) {
      this.logger.warn(
        `Metadata probe failed for ${channelId} (${error instanceof Error ? error.message : String(error)}) — fail-open`,
      );
      return null;
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
