import { ExtractionResult } from 'discovery/extraction/domain/entities/extraction-result.entity';

/**
 * Outbound port: persistence for extraction results.
 *
 * Implemented in infrastructure/repositories.
 */
export abstract class ExtractionResultRepository {
  public abstract save(result: ExtractionResult): Promise<void>;
  public abstract findByChannelAndMessage(
    channelId: string,
    messageId: number,
  ): Promise<ExtractionResult | null>;
  public abstract findRecent(
    limit: number,
  ): Promise<ReadonlyArray<ExtractionResult>>;
}
