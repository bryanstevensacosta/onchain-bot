/**
 * Outbound port: market data + historical performance for evaluating
 * whether a token call turned out well.
 *
 * Implemented by adapters that combine:
 * - Current snapshot from enrichment (MC now)
 * - Historical ATH from DexScreener/GeckoTerminal
 * - Honeypot/rug detection (future)
 */
export interface PerformanceEvaluation {
  readonly athMultiple: number | null; // ATH / MC at call time
  readonly mcAtCall: number | null;
  readonly mcNow: number | null;
  readonly isHoneypot: boolean | null;
  readonly isRugged: boolean | null;
  readonly outcome: 'STRONG' | 'GOOD' | 'NEUTRAL' | 'POOR' | 'FAILED';
}

export interface EvaluateCallInput {
  readonly chain: string;
  readonly address: string;
  readonly channelId: string;
  readonly mcAtCall: number | null;
  readonly callTimestamp: Date;
}

export abstract class PerformanceEvaluatorPort {
  public abstract evaluateCall(
    input: EvaluateCallInput,
  ): Promise<PerformanceEvaluation>;
}
