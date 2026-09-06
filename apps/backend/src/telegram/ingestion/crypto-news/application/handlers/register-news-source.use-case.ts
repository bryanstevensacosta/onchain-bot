import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { CryptoNewsSource } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';
import { CryptoNewsEventPublisher } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-event.publisher';

export interface RegisterNewsSourceInput {
  readonly channelId: string;
  readonly handle: string | null;
  readonly title: string;
}

/**
 * Use case: register a new Telegram channel as a crypto-news source.
 *
 * ⚠️ **DEPRECATED (2026-09-05)** ⚠️
 *
 * This use case is NO LONGER USED.
 * Ingestion-service is now the sole owner of crypto-news sources.
 *
 * **Migration:**
 * Ingestion-service has its own RegisterNewsSourceUseCase.
 * Backend POST /crypto-news/sources is disconnected and returns 501.
 *
 * **This code is kept for reference only and will be removed in future cleanup.**
 *
 * @deprecated Use ingestion-service RegisterNewsSourceUseCase instead
 *
 * Throws CONFLICT if the channelId is already registered.
 * Publishes CryptoNewsSourceSeededEvent on success.
 */
@Injectable()
export class RegisterNewsSourceUseCase {
  constructor(
    private readonly sourceRepo: CryptoNewsSourceRepository,
    private readonly eventPublisher: CryptoNewsEventPublisher,
  ) {}

  /**
   * @deprecated This method is no longer called by any active code path.
   */
  public async execute(
    input: RegisterNewsSourceInput,
  ): Promise<CryptoNewsSource> {
    throw new Error(
      '[DEPRECATED] RegisterNewsSourceUseCase.execute() is deprecated. ' +
        'Backend no longer creates crypto-news sources. ' +
        'Use ingestion-service POST /api/crypto-news/sources instead.',
    );

    /* ────────────────────────────────────────────────────────────────────
     * OLD CODE (DISCONNECTED - DO NOT RE-ENABLE)
     * ────────────────────────────────────────────────────────────────────
     
    // Normalize channelId: ensure it has the -100 prefix for Telegram channels
    const normalizedChannelId = this.normalizeChannelId(input.channelId);

    const existing = await this.sourceRepo.findByChannelId(normalizedChannelId);
    if (existing) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `CryptoNewsSource already registered: ${normalizedChannelId}`,
        { channelId: normalizedChannelId },
      );
    }

    const source = CryptoNewsSource.create({
      channelId: normalizedChannelId,
      handle: input.handle,
      title: input.title,
    });

    await this.sourceRepo.save(source);
    await this.eventPublisher.publishAll(source.commit());
    return source;
    
     * ──────────────────────────────────────────────────────────────────── */
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
