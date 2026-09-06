import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { CryptoNewsSourceRepository } from '../../infrastructure/persistence/typeorm/repositories/crypto-news-source.repository';

export interface RegisterNewsSourceInput {
  readonly channelId: string;
  readonly handle?: string | null;
  readonly title: string;
}

export interface RegisterNewsSourceOutput {
  readonly channelId: string;
  readonly handle: string | null;
  readonly title: string;
  readonly isActive: boolean;
  readonly lifecycleStatus: string;
  readonly addedAt: string;
}

/**
 * Use case: Register a new Telegram channel as a crypto-news source.
 *
 * **Ingestion-service is now the SOLE OWNER of crypto-news sources.**
 *
 * This use case:
 * 1. Validates the input (channelId format, non-empty title)
 * 2. Normalizes channelId (ensures -100 prefix for channels)
 * 3. Checks for duplicates (throws ConflictException if exists)
 * 4. Creates and persists the new source
 * 5. Returns the created source
 *
 * Migration notes:
 * - Ported from backend RegisterNewsSourceUseCase
 * - Simplified: no DomainEvents, no AggregateRoot (ingestion-service uses TypeORM entities directly)
 * - Backend POST /crypto-news/sources now deprecated (writes nothing)
 *
 * Architecture:
 * - Ingestion-service: OWNS crypto_news_sources table (write + read)
 * - Backend: NO LONGER writes sources (deprecated endpoint kept for backward compat only)
 *
 * @throws ConflictException if channelId already registered
 * @throws BadRequestException if validation fails
 */
@Injectable()
export class RegisterNewsSourceUseCase {
  private readonly logger = new Logger(RegisterNewsSourceUseCase.name);

  constructor(private readonly sourceRepo: CryptoNewsSourceRepository) {}

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
        `Crypto-news source "${existing.title}" (${handleInfo}) with channel ID "${normalizedChannelId}" already exists in the database.`,
      );
    }

    // Create new source
    const source = this.sourceRepo.create(
      normalizedChannelId,
      input.title.trim(),
      input.handle ?? undefined,
    );

    // Persist to database
    const saved = await this.sourceRepo.save(source);

    this.logger.log(
      `Registered new crypto-news source: ${saved.channelId} (${saved.title})`,
    );

    // Return output
    return {
      channelId: saved.channelId,
      handle: saved.handle,
      title: saved.title,
      isActive: saved.isActive,
      lifecycleStatus: saved.lifecycleStatus,
      addedAt: saved.addedAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  /**
   * Validate input parameters.
   *
   * @throws BadRequestException if validation fails
   */
  private validateInput(input: RegisterNewsSourceInput): void {
    if (!input.channelId || input.channelId.trim().length === 0) {
      throw new Error('channelId cannot be empty');
    }

    if (!input.title || input.title.trim().length === 0) {
      throw new Error('title cannot be empty');
    }

    // Validate channelId format (must be numeric after removing prefix)
    const trimmed = input.channelId.trim();
    const numeric = trimmed.replace(/^-100/, '').replace(/^[+-]/, '');

    if (!/^\d+$/.test(numeric)) {
      throw new Error(
        `Invalid channelId format: ${input.channelId}. Must be numeric (e.g., -1001234567890 or 1234567890)`,
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
