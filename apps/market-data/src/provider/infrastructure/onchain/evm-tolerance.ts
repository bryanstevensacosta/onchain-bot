import { Logger } from '@nestjs/common';
import type { SnapshotQuote } from 'snapshot/domain/snapshot-quote.types';

/**
 * Direct-vs-aggregator tolerance at the snapshot seam (Lane E, todo 22).
 *
 * HOME CHOICE (worker decision, documented why): this file lives in
 * `provider/infrastructure/onchain/` — NOT in `snapshot/` — for three
 * reasons. (1) Constraint: no snapshot-core rewrite this lane, so
 * `AddressSnapshotService`/aggregator stay byte-identical; a pure
 * comparator beside the readers needs ZERO pipeline edits to land.
 * (2) Shape: the check needs only two quote-shaped inputs (direct
 * view + aggregator quote) and no pipeline state (no cache, no
 * history, no policy), so it belongs with the direct-read code it
 * judges. (3) Adoption is one line when the seam owner is ready:
 * `selectPreferredQuote(direct, quote)` inside `getSnapshot` AFTER
 * the fan-out merge, BEFORE `history.save` — the fan-out itself stays
 * untouched (fail-open fallback = today's fan-out, verbatim).
 *
 * CONTRACT (tolerance stays OUT of the critical path):
 * - Direct fields that are defined WIN (prefer fresh-direct); every
 *   `undefined`/`null` direct field falls back to the aggregator
 *   value — a partial direct view can never blank a good field.
 * - Direct `null` (unavailable/uninitialized/unsupported) returns the
 *   aggregator quote VERBATIM (`diverged: false`, `divergeBps: null`).
 * - Divergence is a LOG line only (`Logger.warn`, no new metric
 *   infra, no counters, no gates): `priceUsd` bps beyond tolerance.
 *   It NEVER blocks the render and NEVER retries — the merged quote
 *   is returned either way.
 */

export const TOLERANCE_DEFAULT_BPS = 100;

/** Basis: 10_000 bps = 100%. */
const BPS_BASIS = 10_000;

export interface ToleranceOutcome {
  readonly quote: SnapshotQuote;
  /** True only when BOTH prices exist and differ beyond tolerance. */
  readonly diverged: boolean;
  /** Signed bps ((direct - aggregator) / aggregator), null when unmeasurable. */
  readonly divergeBps: number | null;
}

/** Signed bps between two prices; `null` when either is missing/non-positive. */
export function priceDivergeBps(
  directPrice: number | null | undefined,
  aggregatorPrice: number | null | undefined,
): number | null {
  try {
    if (
      directPrice === null ||
      directPrice === undefined ||
      aggregatorPrice === null ||
      aggregatorPrice === undefined
    ) {
      return null;
    }
    if (
      !Number.isFinite(directPrice) ||
      !Number.isFinite(aggregatorPrice) ||
      aggregatorPrice <= 0 ||
      directPrice < 0
    ) {
      return null;
    }
    return ((directPrice - aggregatorPrice) / aggregatorPrice) * BPS_BASIS;
  } catch {
    return null;
  }
}

const pickDefined = <T>(direct: T | null | undefined, fallback: T): T =>
  direct === null || direct === undefined ? fallback : direct;

/**
 * Merge a fresh-direct partial quote over today's aggregator quote.
 * `logger` defaults to a module logger; pass a test double in specs.
 */
export function selectPreferredQuote(
  direct: Partial<SnapshotQuote> | null | undefined,
  aggregator: SnapshotQuote,
  options?: {
    readonly toleranceBps?: number;
    readonly logger?: Pick<Logger, 'warn'>;
  },
): ToleranceOutcome {
  const toleranceBps = options?.toleranceBps ?? TOLERANCE_DEFAULT_BPS;
  const logger = options?.logger ?? new Logger('evm-tolerance');
  if (direct === null || direct === undefined) {
    return { quote: aggregator, diverged: false, divergeBps: null };
  }
  const quote: SnapshotQuote = {
    priceUsd: pickDefined(direct.priceUsd, aggregator.priceUsd),
    marketCapUsd: pickDefined(direct.marketCapUsd, aggregator.marketCapUsd),
    fdvUsd: pickDefined(direct.fdvUsd, aggregator.fdvUsd),
    liquidityUsd: pickDefined(direct.liquidityUsd, aggregator.liquidityUsd),
    volume24hUsd: pickDefined(direct.volume24hUsd, aggregator.volume24hUsd),
    priceChange24h: pickDefined(
      direct.priceChange24h,
      aggregator.priceChange24h,
    ),
    holders: pickDefined(direct.holders, aggregator.holders),
    top10HolderPercent: pickDefined(
      direct.top10HolderPercent,
      aggregator.top10HolderPercent,
    ),
    symbol: pickDefined(direct.symbol, aggregator.symbol),
    name: pickDefined(direct.name, aggregator.name),
    lockedLiquidityPercent: pickDefined(
      direct.lockedLiquidityPercent,
      aggregator.lockedLiquidityPercent,
    ),
    burnedPercent: pickDefined(direct.burnedPercent, aggregator.burnedPercent),
    totalSupply: pickDefined(direct.totalSupply, aggregator.totalSupply),
    circulatingSupply: pickDefined(
      direct.circulatingSupply,
      aggregator.circulatingSupply,
    ),
    maxSupply: pickDefined(direct.maxSupply, aggregator.maxSupply),
    devWallets: pickDefined(direct.devWallets, aggregator.devWallets),
    devPctSupply: pickDefined(direct.devPctSupply, aggregator.devPctSupply),
  };
  const divergeBps = priceDivergeBps(quote.priceUsd, aggregator.priceUsd);
  const diverged = divergeBps !== null && Math.abs(divergeBps) > toleranceBps;
  if (diverged) {
    logger.warn(
      `onchain-evm tolerance: direct-vs-aggregator price diverged ` +
        `${divergeBps?.toFixed(1)}bps beyond ${toleranceBps}bps ` +
        `(direct=${quote.priceUsd}, aggregator=${aggregator.priceUsd}) — ` +
        `preferring fresh-direct, render unblocked`,
    );
  }
  return { quote, diverged, divergeBps };
}
