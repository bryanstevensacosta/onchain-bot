import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { TelegramFeedSourceRepository } from '../../infrastructure/persistence/typeorm/repositories/typeorm-feed-source.repository';
import type { TelegramFeedSourceType } from '../../infrastructure/persistence/typeorm/entities/telegram-feed-source.entity';
import { TelegramListenerPort } from 'core/ports/telegram-listener.port';
import { kolAvatarUrlFor } from '../../../avatar/avatar.constants';
import { KolAvatarService } from '../../../avatar/kol-avatar.service';

export interface RegisterNewsSourceInput {
  readonly channelId: string;
  readonly handle?: string | null;
  readonly title?: string | null;
  readonly type?: TelegramFeedSourceType;
}

export interface RegisterNewsSourceOutput {
  readonly channelId: string;
  readonly handle: string | null;
  readonly title: string;
  readonly type: TelegramFeedSourceType;
  readonly isActive: boolean;
  readonly lifecycleStatus: string;
  readonly addedAt: string;
  /** P19: permanent avatar URL (file-or-placeholder, always servable). */
  readonly avatarUrl: string;
}

export interface BatchSourceItem {
  readonly channelId: string;
  readonly handle?: string | null;
  readonly title?: string | null;
  readonly type?: TelegramFeedSourceType;
  readonly isActive?: boolean;
  readonly lifecycleStatus?: 'ACTIVE' | 'INACTIVE';
}

export interface RegisterFeedSourceBatchInput {
  readonly sources: ReadonlyArray<BatchSourceItem>;
}

export interface RegisterFeedSourceBatchOutput {
  readonly created: number;
  readonly updated: number;
  readonly total: number;
  readonly results: ReadonlyArray<RegisterNewsSourceOutput>;
}

const VALID_TYPES: ReadonlyArray<TelegramFeedSourceType> = [
  'kol',
  'crypto-news',
];
const VALID_LIFECYCLES = ['ACTIVE', 'INACTIVE'] as const;
const BATCH_MAX_ITEMS = 500;

/**
 * Use case: Register a new Telegram channel as a feed source.
 *
 * Ingestion-service is the SOLE OWNER of feed sources
 * (`telegram_feed_sources`, unified catalog for `kol` + `crypto-news`).
 *
 * This use case:
 * 1. Validates the input (channelId format) — 400 on invalid
 * 2. Normalizes channelId (ensures -100 prefix for channels)
 * 3. Auto-resolves title and handle from Telegram if not provided
 * 4. Checks for duplicates (throws ConflictException → 409 if exists)
 * 5. Creates and persists the new source (type defaults to 'crypto-news')
 * 6. Returns the created source
 *
 * Batch variant (`executeBatch`, required by backfill): idempotent upsert
 * by channel_id — existing rows are updated in place (no duplicate),
 * new rows are created. The whole batch is validated BEFORE any write,
 * so a 400 leaves the table untouched.
 */
@Injectable()
export class RegisterNewsSourceUseCase {
  private readonly logger = new Logger(RegisterNewsSourceUseCase.name);

  constructor(
    private readonly sourceRepo: TelegramFeedSourceRepository,
    private readonly telegramListener: TelegramListenerPort,
    @Optional() private readonly avatars?: KolAvatarService,
  ) {}

  public async execute(
    input: RegisterNewsSourceInput,
  ): Promise<RegisterNewsSourceOutput> {
    // Validate input
    this.validateInput(input);

    // Normalize channelId: ensure it has the -100 prefix for Telegram channels
    const normalizedChannelId = this.normalizeChannelId(input.channelId);

    // Check for duplicates
    const existing = await this.sourceRepo.findByChannelId(normalizedChannelId);
    if (existing) {
      const handleInfo = existing.handle ? `@${existing.handle}` : 'no handle';
      throw new ConflictException(
        `Feed source "${existing.title}" (${handleInfo}) with channel ID "${normalizedChannelId}" already exists in the database.`,
      );
    }

    // Auto-resolve title and handle from Telegram if not provided
    let title = input.title?.trim();
    let handle = input.handle?.trim() || undefined;

    if (!title || !handle) {
      try {
        this.logger.log(
          `Auto-resolving metadata for channel ${normalizedChannelId}...`,
        );
        const metadata =
          await this.telegramListener.resolveChannelMetadata(
            normalizedChannelId,
          );
        title = title || metadata.title;
        handle = handle || metadata.handle || undefined;
        this.logger.log(
          `Resolved metadata: title="${title}", handle="${handle || 'none'}"`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to auto-resolve metadata for ${normalizedChannelId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        // If title still not available, fail
        if (!title) {
          throw new BadRequestException(
            `Cannot register source: title not provided and auto-resolution failed for channel ${normalizedChannelId}. ` +
              `Either provide a title explicitly or ensure the bot has joined the channel.`,
          );
        }
        // Handle can remain undefined
      }
    }

    // Create new source
    const source = this.sourceRepo.create(
      normalizedChannelId,
      title, // guaranteed non-empty at this point
      handle,
      input.type ?? 'crypto-news',
    );

    // Persist to database
    const saved = await this.sourceRepo.save(source);

    this.logger.log(
      `Registered new feed source: ${saved.channelId} (${saved.title})`,
    );

    // P19 fetch-ONCE: KOL sources resolve their avatar at registration
    // (best-effort — MTProto miss keeps the placeholder, registration wins).
    this.kickAvatarFetch(saved.channelId, saved.type);

    // Return output
    return {
      channelId: saved.channelId,
      handle: saved.handle,
      title: saved.title,
      type: saved.type,
      isActive: saved.isActive,
      lifecycleStatus: saved.lifecycleStatus,
      addedAt: saved.addedAt?.toISOString() ?? new Date().toISOString(),
      avatarUrl: kolAvatarUrlFor(saved.channelId),
    };
  }

  /**
   * Idempotent batch upsert of feed sources by channel_id.
   *
   * Used by the kols→feed backfill: existing rows are updated with the
   * provided fields (handle/title/type/lifecycle/isActive), missing rows
   * are created. Re-running the same payload changes nothing (updated
   * counts as an update only when a field actually differs — re-runs
   * report updated: 0 when values are identical).
   */
  public async executeBatch(
    input: RegisterFeedSourceBatchInput,
  ): Promise<RegisterFeedSourceBatchOutput> {
    const items = input?.sources;
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException(
        'sources must be a non-empty array of feed source entries',
      );
    }
    if (items.length > BATCH_MAX_ITEMS) {
      throw new BadRequestException(
        `sources exceeds the batch cap of ${BATCH_MAX_ITEMS} entries`,
      );
    }

    // Validate everything BEFORE writing anything (all-or-nothing on 400).
    const normalized = items.map((item, index) =>
      this.validateBatchItem(item, index),
    );

    let created = 0;
    let updated = 0;
    const results: RegisterNewsSourceOutput[] = [];

    for (const entry of normalized) {
      const existing = await this.sourceRepo.findByChannelId(entry.channelId);
      if (!existing) {
        let title = entry.title?.trim();
        if (!title) {
          title = await this.resolveTitle(entry.channelId);
        }
        const createdEntity = this.sourceRepo.create(
          entry.channelId,
          title,
          entry.handle?.trim() || undefined,
          entry.type,
        );
        if (entry.isActive !== undefined) {
          createdEntity.isActive = entry.isActive;
        }
        if (entry.lifecycleStatus !== undefined) {
          createdEntity.lifecycleStatus = entry.lifecycleStatus;
        }
        const saved = await this.sourceRepo.save(createdEntity);
        created += 1;
        results.push(this.toOutput(saved));
        this.kickAvatarFetch(saved.channelId, saved.type);
        continue;
      }

      let touched = false;
      const nextTitle = entry.title?.trim();
      if (
        nextTitle !== undefined &&
        nextTitle !== '' &&
        nextTitle !== existing.title
      ) {
        existing.title = nextTitle;
        touched = true;
      }
      if (entry.handle !== undefined) {
        const nextHandle = entry.handle?.trim() || null;
        if (nextHandle !== existing.handle) {
          existing.handle = nextHandle;
          touched = true;
        }
      }
      if (entry.type !== undefined && entry.type !== existing.type) {
        existing.type = entry.type;
        touched = true;
      }
      if (
        entry.lifecycleStatus !== undefined &&
        entry.lifecycleStatus !== existing.lifecycleStatus
      ) {
        existing.lifecycleStatus = entry.lifecycleStatus;
        touched = true;
      }
      if (
        entry.isActive !== undefined &&
        entry.isActive !== existing.isActive
      ) {
        existing.isActive = entry.isActive;
        touched = true;
      }
      const saved = touched ? await this.sourceRepo.save(existing) : existing;
      if (touched) {
        updated += 1;
      }
      results.push(this.toOutput(saved));
    }

    return { created, updated, total: results.length, results };
  }

  private validateBatchItem(
    item: BatchSourceItem,
    index: number,
  ): {
    channelId: string;
    handle?: string | null;
    title?: string | null;
    type: TelegramFeedSourceType;
    isActive?: boolean;
    lifecycleStatus?: 'ACTIVE' | 'INACTIVE';
  } {
    const at = `sources[${index}]`;
    if (!item || typeof item !== 'object') {
      throw new BadRequestException(`${at} must be an object`);
    }
    if (!item.channelId || item.channelId.trim().length === 0) {
      throw new BadRequestException(`${at}.channelId cannot be empty`);
    }
    const numeric = item.channelId
      .trim()
      .replace(/^-100/, '')
      .replace(/^[+-]/, '');
    if (!/^\d+$/.test(numeric)) {
      throw new BadRequestException(
        `${at}.channelId has an invalid format: ${item.channelId}. Must be numeric (e.g., -1001234567890 or 1234567890)`,
      );
    }
    if (item.type !== undefined && !VALID_TYPES.includes(item.type)) {
      throw new BadRequestException(
        `${at}.type must be one of ${VALID_TYPES.join(', ')}`,
      );
    }
    if (
      item.lifecycleStatus !== undefined &&
      !(VALID_LIFECYCLES as ReadonlyArray<string>).includes(
        item.lifecycleStatus,
      )
    ) {
      throw new BadRequestException(
        `${at}.lifecycleStatus must be one of ${VALID_LIFECYCLES.join(', ')}`,
      );
    }
    if (item.isActive !== undefined && typeof item.isActive !== 'boolean') {
      throw new BadRequestException(`${at}.isActive must be a boolean`);
    }
    return {
      channelId: this.normalizeChannelId(item.channelId),
      handle: item.handle,
      title: item.title,
      type: item.type ?? 'crypto-news',
      isActive: item.isActive,
      lifecycleStatus: item.lifecycleStatus,
    };
  }

  private async resolveTitle(channelId: string): Promise<string> {
    try {
      const metadata =
        await this.telegramListener.resolveChannelMetadata(channelId);
      if (metadata?.title) {
        return metadata.title;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to auto-resolve title for ${channelId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    throw new BadRequestException(
      `Cannot register source: title not provided and auto-resolution failed for channel ${channelId}. ` +
        `Either provide a title explicitly or ensure the bot has joined the channel.`,
    );
  }

  private toOutput(saved: {
    channelId: string;
    handle: string | null;
    title: string;
    type: TelegramFeedSourceType;
    isActive: boolean;
    lifecycleStatus: string;
    addedAt?: Date;
  }): RegisterNewsSourceOutput {
    return {
      channelId: saved.channelId,
      handle: saved.handle,
      title: saved.title,
      type: saved.type,
      isActive: saved.isActive,
      lifecycleStatus: saved.lifecycleStatus,
      addedAt: saved.addedAt?.toISOString() ?? new Date().toISOString(),
      avatarUrl: kolAvatarUrlFor(saved.channelId),
    };
  }

  /**
   * P19 fetch-ONCE hook: fire-and-forget avatar fetch for newly registered
   * KOL sources. Never fails registration — `fetchOnce` resolves to
   * `placeholder` on MTProto trouble (deferred retry via explicit refresh).
   */
  private kickAvatarFetch(
    channelId: string,
    type: TelegramFeedSourceType,
  ): void {
    if (type !== 'kol' || !this.avatars) {
      return;
    }
    void this.avatars
      .fetchOnce(channelId)
      .then((status) =>
        this.logger.log(`Avatar fetch-once for ${channelId}: ${status}`),
      )
      .catch((error: unknown) =>
        this.logger.warn(
          `Avatar fetch-once failed for ${channelId} (${error instanceof Error ? error.message : String(error)})`,
        ),
      );
  }

  /**
   * Validate input parameters.
   *
   * @throws BadRequestException if validation fails
   */
  private validateInput(input: RegisterNewsSourceInput): void {
    if (!input.channelId || input.channelId.trim().length === 0) {
      throw new BadRequestException('channelId cannot be empty');
    }

    // title is now optional (will be auto-resolved if missing)

    // Validate channelId format (must be numeric after removing prefix)
    const trimmed = input.channelId.trim();
    const numeric = trimmed.replace(/^-100/, '').replace(/^[+-]/, '');

    if (!/^\d+$/.test(numeric)) {
      throw new BadRequestException(
        `Invalid channelId format: ${input.channelId}. Must be numeric (e.g., -1001234567890 or 1234567890)`,
      );
    }

    if (input.type !== undefined && !VALID_TYPES.includes(input.type)) {
      throw new BadRequestException(
        `type must be one of ${VALID_TYPES.join(', ')}`,
      );
    }
  }

  /**
   * Normalize Telegram channel ID to always have the -100 prefix.
   *
   * Telegram supergroup/channel IDs are 13-digit numbers prefixed with -100.
   * This ensures consistency across seeds, API inputs, and database entries.
   *
   * Examples:
   * - '1234567890123' → '-1001234567890123'
   * - '-1001234567890123' → '-1001234567890123' (already normalized)
   * - '-1234567890123' → '-1001234567890123' (adds 100)
   *
   * @param channelId - Raw channel ID (may or may not have -100 prefix)
   * @returns Normalized channel ID with -100 prefix
   */
  private normalizeChannelId(channelId: string): string {
    const trimmed = channelId.trim();

    // Already has -100 prefix
    if (trimmed.startsWith('-100')) {
      return trimmed;
    }

    // Remove any leading - or +
    const numeric = trimmed.replace(/^[+-]/, '');

    // Add -100 prefix
    return `-100${numeric}`;
  }
}
