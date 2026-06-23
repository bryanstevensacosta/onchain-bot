import { ExtractionResult } from 'token/intake/extraction/domain/entities/extraction-result.entity';

/**
 * Outbound port: persistence for extraction results.
 *
 * Implemented in infrastructure/repositories.
 */
export abstract class ExtractionResultRepository {
  public abstract save(result: ExtractionResult): Promise<void>;
  public abstract findByChannelAndMessage(
    kolId: string,
    messageId: number,
  ): Promise<ExtractionResult | null>;
  public abstract findRecent(
    limit: number,
  ): Promise<ReadonlyArray<ExtractionResult>>;
}
