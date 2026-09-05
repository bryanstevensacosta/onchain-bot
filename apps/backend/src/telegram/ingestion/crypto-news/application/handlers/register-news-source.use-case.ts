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
 * Throws CONFLICT if the channelId is already registered.
 * Publishes CryptoNewsSourceSeededEvent on success.
 */
@Injectable()
export class RegisterNewsSourceUseCase {
  constructor(
    private readonly sourceRepo: CryptoNewsSourceRepository,
    private readonly eventPublisher: CryptoNewsEventPublisher,
  ) {}

  public async execute(
    input: RegisterNewsSourceInput,
  ): Promise<CryptoNewsSource> {
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
