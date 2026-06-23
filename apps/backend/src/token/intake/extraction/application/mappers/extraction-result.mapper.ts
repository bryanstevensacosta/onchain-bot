import type { ExtractionResult } from 'token/intake/extraction/domain/entities/extraction-result.entity';

/**
 * Outbound view model: extraction result summary for API consumers.
 */
export interface ExtractionResultView {
  readonly id: string;
  readonly kolId: string;
  readonly messageId: number;
  readonly occurredAt: string;
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
      kolId: result.kolId,
      messageId: result.messageId,
      occurredAt: result.occurredAt.toISOString(),
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
