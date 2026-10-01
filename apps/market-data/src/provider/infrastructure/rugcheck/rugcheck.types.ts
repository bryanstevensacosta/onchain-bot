export interface RugCheckSummary {
  readonly tokenProgram: string;
  readonly tokenType: string;
  readonly risks: ReadonlyArray<unknown>;
  readonly lockedLiquidity: ReadonlyArray<{
    readonly amount: number;
    readonly percent: number;
    readonly tokenAddress: string;
  }>;
  readonly totalMarketLiquidity: number | null;
  readonly totalLPProviders: number | null;
  readonly totalSupply: number | null;
  readonly burnedPercent: number | null;
}
