import { Injectable } from '@nestjs/common';
import { CryptoNewsSource } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity';
import {
  CryptoNewsSourceRepository,
  FilterRule,
} from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';

/**
 * In-memory implementation of CryptoNewsSourceRepository.
 * Used for tests and dev mode (when DATABASE_ENABLED=false).
 */
@Injectable()
export class InMemoryCryptoNewsSourceRepository extends CryptoNewsSourceRepository {
  private readonly store = new Map<string, CryptoNewsSource>();

  /**
   * @deprecated Backend no longer writes crypto-news sources. Use ingestion-service.
   */
  public async save(source: CryptoNewsSource): Promise<void> {
    throw new Error(
      '[DEPRECATED] InMemoryCryptoNewsSourceRepository.save() is deprecated. ' +
        'Backend no longer writes crypto-news sources. ' +
        'Use ingestion-service POST /api/crypto-news/sources instead.',
    );

    /* ────────────────────────────────────────────────────────────────────
     * OLD CODE (DISCONNECTED - DO NOT RE-ENABLE)
     * ────────────────────────────────────────────────────────────────────
     
    this.store.set(source.channelId, source);
    
     * ──────────────────────────────────────────────────────────────────── */
  }

  public async findByChannelId(
    channelId: string,
  ): Promise<CryptoNewsSource | null> {
    return this.store.get(channelId) ?? null;
  }

  public async findAll(): Promise<ReadonlyArray<CryptoNewsSource>> {
    return Array.from(this.store.values());
  }

  public async findActive(): Promise<ReadonlyArray<CryptoNewsSource>> {
    return Array.from(this.store.values()).filter((s) => s.isActive);
  }

  /**
   * @deprecated Backend no longer deletes crypto-news sources. Use ingestion-service.
   */
  public async delete(channelId: string): Promise<void> {
    throw new Error(
      '[DEPRECATED] InMemoryCryptoNewsSourceRepository.delete() is deprecated. ' +
        'Backend no longer deletes crypto-news sources. ' +
        'Use ingestion-service DELETE /api/crypto-news/sources/{channelId} if such endpoint exists.',
    );

    /* ────────────────────────────────────────────────────────────────────
     * OLD CODE (DISCONNECTED - DO NOT RE-ENABLE)
     * ────────────────────────────────────────────────────────────────────
     
    this.store.delete(channelId);
    
     * ──────────────────────────────────────────────────────────────────── */
  }

  public async findFiltersByChannelId(
    _channelId: string,
  ): Promise<ReadonlyArray<FilterRule>> {
    // In-memory: filters stored via save() on source aggregate
    // For now, return empty (no filters) for stub implementation
    return [];
  }
}
