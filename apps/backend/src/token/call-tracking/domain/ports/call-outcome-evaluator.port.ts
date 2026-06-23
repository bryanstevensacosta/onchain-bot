/**
 * Outbound port: market data + historical performance for evaluating
 * whether a token call turned out well.
 *
 * v1 implementation: `DexscreenerCallOutcomeEvaluatorAdapter`.
 *
 * v2: GoPlusSecurityAdapter, ForkSimulationAdapter (Tenderly), etc.
 *
 * Renamed from `PerformanceEvaluatorPort` (N1 in name-refactor.md) —
 * "Performance" sounded like system optimization; "CallOutcome" makes
 * the purpose explicit ("did this call turn out well?").
 */
export interface CallOutcomeEvaluation {
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
  readonly kolId: string;
  readonly mcAtCall: number | null;
  readonly callTimestamp: Date;
}

export abstract class CallOutcomeEvaluatorPort {
  public abstract evaluateCall(
    input: EvaluateCallInput,
  ): Promise<CallOutcomeEvaluation>;
}
