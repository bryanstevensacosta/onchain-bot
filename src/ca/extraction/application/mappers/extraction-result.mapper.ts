import type { ExtractionResult } from 'ca/extraction/domain/entities/extraction-result.entity';

/**
 * Outbound view model: extraction result summary for API consumers.
 */
export interface ExtractionResultView {
  readonly id: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly occurredAt: string;
  readonly rawText: string;
  readonly contractAddresses: ReadonlyArray<{
    readonly value: string;
    readonly chainHint: string;
  }>;
  readonly tickers: ReadonlyArray<string>;
  readonly urls: ReadonlyArray<{
    readonly value: string;
    readonly scheme: string;
  }>;
}

/**
 * Maps ExtractionResult aggregates to outbound view models.
 */
export class ExtractionResultMapper {
  public static toView(result: ExtractionResult): ExtractionResultView {
    return {
      id: result.id,
      channelId: result.channelId,
      messageId: result.messageId,
      occurredAt: result.occurredAt.toISOString(),
      rawText: result.rawText,
      contractAddresses: result.contractAddresses.map((c) => ({
        value: c.value,
        chainHint: c.chainHint.value,
      })),
      tickers: result.tickers.map((t) => t.value),
      urls: result.urls.map((u) => ({
        value: u.value,
        scheme: u.scheme,
      })),
    };
  }
}
