import type { ScoreProbeFn } from 'chain/detection/infrastructure/probers/score-probe';

/**
 * EVM chain scoring rules.
 *
 * Points:
 * - +20 if the RPC responded (validates the chain is reachable)
 * - +10 if the address has contract code (`isContract === true`)
 *
 * Reasons include all `notes` from the prober for observability.
 */
export const scoreEvmProbe: ScoreProbeFn = (result) => {
  if (result.status === 'rejected') {
    return { points: 0, reasons: ['probe:evm:error'] };
  }
  const { value } = result;
  const reasons: string[] = [];
  let points = 0;

  if (value.responded) {
    points += 20;
    reasons.push('rpc:responded');
  }
  if (value.isContract === true) {
    points += 10;
    reasons.push('has_code:true');
  }
  reasons.push(...value.notes.map((n) => `note:${n}`));

  return { points, reasons };
};
