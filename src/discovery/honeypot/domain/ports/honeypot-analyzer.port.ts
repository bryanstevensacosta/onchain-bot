import { HoneypotSignal } from 'discovery/honeypot/domain/value-objects/honeypot-signal.vo';

export interface HoneypotAnalysisResult {
  readonly signals: ReadonlyArray<HoneypotSignal>;
  readonly buyTax: number | null;
  readonly sellTax: number | null;
  readonly transferTax: number | null;
  readonly canSell: boolean | null;
  readonly canBuy: boolean | null;
  readonly ownerCanDrain: boolean | null;
  readonly ownerRenounced: boolean | null;
  readonly isProxy: boolean | null;
  readonly analysisSource: 'SIMULATION' | 'STATIC' | 'HEURISTIC';
}

/**
 * Outbound port: perform (or simulate) honeypot analysis on a contract.
 *
 * Implemented by:
 * - v1: HeuristicHoneypotAnalyzerAdapter (no on-chain calls — uses market
 *   data and the BC's existing knowledge as a proxy for honeypot status)
 * - v2: GoPlusSecurityAnalyzerAdapter / ChainabuseAdapter (real on-chain
 *   simulation via fork or static bytecode analysis)
 *
 * Always returns SOMETHING — even if just `SAFE` from heuristic analysis.
 */
export abstract class HoneypotAnalyzerPort {
  public abstract analyze(
    chain: string,
    address: string,
  ): Promise<HoneypotAnalysisResult>;
}
