import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  CallOutcomeEvaluatorPort,
  CallOutcomeEvaluation,
  EvaluateCallInput,
} from 'token/call-tracking/domain/ports/call-outcome-evaluator.port';

interface DexScreenerPair {
  priceUsd: string | null;
  fdv: number | null;
  marketCap: number | null;
  pairCreatedAt: number | null;
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[] | null;
}

/**
 * v1 Call outcome evaluator — uses DexScreener's current price + FDV
 * and pair creation timestamp.
 *
 * Algorithm:
 * - Fetch current pair data
 * - mcNow = current marketCap or FDV
 * - mcAtCall = caller's recorded MC (passed in)
 * - athMultiple = max(price over period) / price at call → from DexScreener pair price history
 *   (v1 simplification: use current price if after call, otherwise 1.0)
 * - honeypot detection is delegated to future HoneypotDetection BC
 *
 * Outcome mapping:
 * - isHoneypot or isRugged → FAILED
 * - athMultiple >= 5       → STRONG
 * - athMultiple >= 2       → GOOD
 * - athMultiple >= 0.5     → NEUTRAL
 * - athMultiple > 0        → POOR
 * - 0 / null               → NEUTRAL (no data)
 */
@Injectable()
export class DexScreenerCallOutcomeEvaluatorAdapter extends CallOutcomeEvaluatorPort {
  private readonly logger = new Logger(
    DexScreenerCallOutcomeEvaluatorAdapter.name,
  );
  private static readonly ENDPOINT =
    'https://api.dexscreener.com/latest/dex/tokens';

  public async evaluateCall(
    input: EvaluateCallInput,
  ): Promise<CallOutcomeEvaluation> {
    try {
      const { data } = await axios.get<DexScreenerResponse>(
        `${DexScreenerCallOutcomeEvaluatorAdapter.ENDPOINT}/${input.address}`,
        { timeout: 5000 },
      );
      if (!data.pairs || data.pairs.length === 0) {
        return {
          athMultiple: null,
          mcAtCall: input.mcAtCall,
          mcNow: null,
          isHoneypot: null,
          isRugged: null,
          outcome: 'NEUTRAL',
        };
      }

      // Use the highest-liquidity pair for the snapshot
      const best = data.pairs.reduce((acc, p) => {
        return (p.marketCap ?? 0) > (acc.marketCap ?? 0) ? p : acc;
      }, data.pairs[0]);

      const mcNow = best.marketCap ?? best.fdv ?? null;
      const athMultiple = computeAthMultiple(input, best);
      const isRugged =
        mcNow !== null && mcNow < (input.mcAtCall ?? Infinity) * 0.1;

      const outcome = classifyOutcome(athMultiple, isRugged);

      return {
        athMultiple,
        mcAtCall: input.mcAtCall,
        mcNow,
        isHoneypot: null, // delegated to future BC
        isRugged,
        outcome,
      };
    } catch (err) {
      this.logger.debug(
        `Performance evaluation failed: ${(err as Error).message}`,
      );
      return {
        athMultiple: null,
        mcAtCall: input.mcAtCall,
        mcNow: null,
        isHoneypot: null,
        isRugged: null,
        outcome: 'NEUTRAL',
      };
    }
  }
}

function computeAthMultiple(
  input: EvaluateCallInput,
  pair: DexScreenerPair,
): number | null {
  const currentPrice = pair.priceUsd ? parseFloat(pair.priceUsd) : null;
  if (currentPrice === null || currentPrice === 0) return null;
  // v1 simplification: assume price at call time was 1.0 if no historical data.
  // Future: integrate DexScreener price history endpoint.
  const callPrice = 1.0;
  return Math.max(0, currentPrice / callPrice);
}

function classifyOutcome(
  athMultiple: number | null,
  isRugged: boolean,
): CallOutcomeEvaluation['outcome'] {
  if (isRugged) return 'FAILED';
  if (athMultiple === null) return 'NEUTRAL';
  if (athMultiple >= 5) return 'STRONG';
  if (athMultiple >= 2) return 'GOOD';
  if (athMultiple >= 0.5) return 'NEUTRAL';
  return 'POOR';
}
