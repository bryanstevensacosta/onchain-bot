import type { TokenCall } from 'discovery/parsing/domain/entities/token-call.entity';

/**
 * Outbound view model: parsed token call summary for API consumers.
 */
export interface TokenCallView {
  readonly id: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly occurredAt: string;
  readonly rawText: string;
  readonly contractAddress: string;
  readonly contractChainHint: string;
  readonly ticker: string | null;
  readonly name: string | null;
  readonly chart: string | null;
  readonly metrics: {
    readonly marketCapUsd: number | null;
    readonly liquidityUsd: number | null;
    readonly fdvUsd: number | null;
    readonly holders: number | null;
  };
  readonly confidence: number;
}

export class TokenCallMapper {
  public static toView(call: TokenCall): TokenCallView {
    return {
      id: call.id,
      channelId: call.channelId,
      messageId: call.messageId,
      occurredAt: call.occurredAt.toISOString(),
      rawText: call.rawText,
      contractAddress: call.contract.address.value,
      contractChainHint: call.contract.address.chainHint.value,
      ticker: call.ticker,
      name: call.name,
      chart: call.chart,
      metrics: {
        marketCapUsd: call.metrics.marketCapUsd,
        liquidityUsd: call.metrics.liquidityUsd,
        fdvUsd: call.metrics.fdvUsd,
        holders: call.metrics.holders,
      },
      confidence: call.confidence,
    };
  }
}
