import { ChainId } from 'chain/identity/chain-id.vo';
import type { ScoreProbeFn } from 'chain/detection/infrastructure/probers/score-probe';
import { scoreEvmProbe } from 'chain/detection/infrastructure/probers/score-evm-probe';
import { scoreSolanaProbe } from 'chain/detection/infrastructure/probers/score-solana-probe';

/**
 * Resolve the scorer for a given chain based on its family.
 *
 * Replaces the previous hardcoded `if/else` on chainName in
 * `detect-chain.use-case.ts`. Adding a new family (Sui, Aptos) is now
 * a one-line addition here + a new scorer file.
 */
export function scorerForChain(chain: ChainId): ScoreProbeFn {
  if (chain.isEvm) return scoreEvmProbe;
  if (chain.isSolana) return scoreSolanaProbe;
  // Fallback for unknown families — returns 0 points, only notes.
  return (result) => {
    if (result.status === 'rejected') {
      return { points: 0, reasons: [`probe:${chain.value}:error`] };
    }
    return {
      points: 0,
      reasons: result.value.notes.map((n) => `note:${n}`),
    };
  };
}
