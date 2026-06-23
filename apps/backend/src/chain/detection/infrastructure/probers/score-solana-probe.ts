import type { ScoreProbeFn } from 'chain/detection/infrastructure/probers/score-probe';

/**
 * Solana chain scoring rules.
 *
 * Points (heavier than EVM because SVM has fewer signal dimensions):
 * - +30 if the RPC responded
 * - +30 if the account exists (`isContract === true`)
 *
 * Reasons include all `notes` from the prober for observability.
 */
export const scoreSolanaProbe: ScoreProbeFn = (result) => {
  if (result.status === 'rejected') {
    return { points: 0, reasons: ['probe:solana:error'] };
  }
  const { value } = result;
  const reasons: string[] = [];
  let points = 0;

  if (value.responded) {
    points += 30;
    reasons.push('rpc:responded');
  }
  if (value.isContract === true) {
    points += 30;
    reasons.push('account:exists');
  }
  reasons.push(...value.notes.map((n) => `note:${n}`));

  return { points, reasons };
};
