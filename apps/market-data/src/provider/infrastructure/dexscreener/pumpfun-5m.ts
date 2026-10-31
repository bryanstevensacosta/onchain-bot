import { WSOL_MINT } from 'provider/infrastructure/onchain/solana-program-ids';

/**
 * pump.fun 5-minute bucket, pure (`rick-compact-card` §10.16, dexter
 * `5M` row).
 *
 * ONE implementation of the class rule + field extraction, shared by
 * the two producers that can reach it:
 *
 * 1. the `dexscreener` quote fetcher (slow fan-out) — it selects the
 *    pumpfun pair out of the token's pair LIST, because the strict
 *    discovery pick is best-liquidity and a migrated/dual-venue pump
 *    token prices from another pool (Meteora for the reference mint);
 * 2. the direct fast path — the summary it already fetched for
 *    discovery IS the pumpfun pair whenever the token's only pool is
 *    the curve (every SOL-quoted token still on the curve), so the
 *    harvest is ZERO extra calls there.
 *
 * Why the fast path needs it at all (measured on staging 2026-10-30):
 * the fast path serves exactly the class whose 5m bucket exists
 * (SOL-quoted curves price → `priced !== null` → fast serve), and it
 * runs NO fetchers, so before this helper the four fields were null on
 * every card that could have rendered the row. The fetcher only ever
 * ran for non-USD/SOL-quoted curves, which this rule silences by
 * class — i.e. the positive branch was unreachable in production.
 *
 * Honesty is by CLASS, never by value (same rule as the fetcher):
 * `volume.m5` / `txns.m5` are denominated in the pair's QUOTE asset, so
 * they are only USD-measurable when that asset is a stablecoin or SOL.
 * A `Bitcoin`- or `ZEC`-quoted curve stays silent even though upstream
 * publishes numbers. A real `0` survives; absent/non-finite stays null.
 */

/** DexScreener `dexId` of the pump.fun curve pairs. */
export const PUMPFUN_DEX_ID = 'pumpfun';

export interface Pumpfun5mFields {
  readonly volume5mUsd: number | null;
  readonly priceChange5m: number | null;
  readonly txns5mBuys: number | null;
  readonly txns5mSells: number | null;
}

/**
 * Structural shape shared by `DexScreenerPair` and
 * `DexScreenerPairSummary` (both sides optional/nullable on purpose —
 * the upstream payload's `quoteToken` is optional and its fields may be
 * null).
 */
export interface PumpfunPairLike {
  readonly dexId?: string | null;
  readonly baseToken?: PairSideLike | null;
  readonly quoteToken?: PairSideLike | null;
  readonly volume5mUsd?: number | null;
  readonly priceChange5m?: number | null;
  readonly txns5mBuys?: number | null;
  readonly txns5mSells?: number | null;
}

export interface PairSideLike {
  readonly address?: string | null;
  readonly symbol?: string | null;
}

const finiteOrNull = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * USD/SOL quote-CLASS gate (see the header). WSOL matches by canonical
 * mint address (base58 is case-sensitive); the symbol list is the only
 * keyless fallback DexScreener gives for the same class of assets.
 */
export function isUsdOrSolQuoteSide(side: PairSideLike): boolean {
  if (side.address === WSOL_MINT) return true;
  const symbol = (side.symbol ?? '').trim().toUpperCase();
  return (
    symbol === 'SOL' ||
    symbol === 'WSOL' ||
    symbol === 'USDC' ||
    symbol === 'USDT'
  );
}

/**
 * The four 5m fields from a pumpfun pair, or `null` when the pair is not
 * a pumpfun pair, does not carry `mint` on either side, or quotes
 * something that is not USD/SOL. Never throws.
 *
 * Whole-pair txns rule: a partial `txns.m5` yields BOTH counts `null`
 * (never half a reading, never a `{0,0}` default).
 */
export function readPumpfun5m(
  pair: PumpfunPairLike,
  mint: string,
): Pumpfun5mFields | null {
  if ((pair.dexId ?? '') !== PUMPFUN_DEX_ID) return null;
  const wanted = mint.toLowerCase();
  const base = pair.baseToken ?? null;
  const quote = pair.quoteToken ?? null;
  const baseIsMint =
    typeof base?.address === 'string' && base.address.toLowerCase() === wanted;
  const quoteIsMint =
    typeof quote?.address === 'string' &&
    quote.address.toLowerCase() === wanted;
  if (!baseIsMint && !quoteIsMint) return null;
  const opposite = baseIsMint ? quote : base;
  if (opposite === null || !isUsdOrSolQuoteSide(opposite)) return null;
  const buys = finiteOrNull(pair.txns5mBuys);
  const sells = finiteOrNull(pair.txns5mSells);
  const hasTxns = buys !== null && sells !== null;
  return {
    volume5mUsd: finiteOrNull(pair.volume5mUsd),
    priceChange5m: finiteOrNull(pair.priceChange5m),
    txns5mBuys: hasTxns ? buys : null,
    txns5mSells: hasTxns ? sells : null,
  };
}
