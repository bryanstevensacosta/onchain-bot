import type { ProbeResult } from 'chain/detection/domain/ports/chain-prober.port';

/**
 * Pure function: takes a probe result and returns points + reasons.
 *
 * No side effects. No I/O. No async. Easy to unit test.
 *
 * Each chain family has its own implementation:
 * - EVM: `scoreEvmProbe` (+20 if responded, +10 if has_code)
 * - SVM: `scoreSolanaProbe` (+30 if responded, +30 if account_exists)
 */
export type ScoreProbeFn = (result: PromiseSettledResult<ProbeResult>) => {
  points: number;
  reasons: ReadonlyArray<string>;
};

/**
 * Default scorer for unknown chains: 0 points, only notes.
 * Used as fallback when no family-specific scorer matches.
 */
export function scoreGenericProbe(
  result: PromiseSettledResult<ProbeResult>,
  chainName: string,
): { points: number; reasons: ReadonlyArray<string> } {
  if (result.status === 'rejected') {
    return { points: 0, reasons: [`probe:${chainName}:error`] };
  }
  return {
    points: 0,
    reasons: result.value.notes.map((n) => `note:${n}`),
  };
}
