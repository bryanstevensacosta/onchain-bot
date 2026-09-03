import { Injectable } from '@nestjs/common';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';

/**
 * ListActiveSourceIdsUseCase - Returns only the channelId values of active crypto-news sources
 *
 * Used by ingestion-service to fetch the list of crypto-news channels to subscribe to.
 * Returns only the IDs (not full aggregates) for lightweight transport.
 */
@Injectable()
export class ListActiveSourceIdsUseCase {
  constructor(private readonly sourceRepo: CryptoNewsSourceRepository) {}

  public async execute(): Promise<ReadonlyArray<string>> {
    const activeSources = await this.sourceRepo.findActive();
    return activeSources.map((source) => source.channelId);
  }
}
