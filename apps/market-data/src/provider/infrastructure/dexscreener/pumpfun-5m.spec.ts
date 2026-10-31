import {
  isUsdOrSolQuoteSide,
  PUMPFUN_DEX_ID,
  readPumpfun5m,
  type PumpfunPairLike,
} from './pumpfun-5m';

/**
 * pump.fun 5-minute bucket, pure (`rick-compact-card` §10.16 / dexter
 * `5M` row). ONE implementation shared by the `dexscreener` quote
 * fetcher (fan-out) and the direct fast path — the class gate is the
 * honesty contract, so it is pinned here once.
 *
 * Fixtures are the REAL shapes measured on DexScreener 2026-10-30 for
 * the two live references: a SOL-quoted curve (`FXRorC4…pump`, pair
 * `7VEVhA6Y…w7gi`) and a ZEC-quoted one (`3tnDcNa…pump`) whose numbers
 * exist upstream but must stay silent.
 */
const MINT = 'FXRorC4nBg7emCPCcrKqvqNuBAw4Bo6hPL9S5JxPpump';
const WSOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const ZEC = 'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS';

const pumpPair = (patch: Partial<PumpfunPairLike> = {}): PumpfunPairLike => ({
  dexId: PUMPFUN_DEX_ID,
  baseToken: { address: MINT, symbol: 'PUMP' },
  quoteToken: { address: WSOL, symbol: 'SOL' },
  volume5mUsd: 23.93,
  priceChange5m: -1.58,
  txns5mBuys: 0,
  txns5mSells: 1,
  ...patch,
});

describe('isUsdOrSolQuoteSide', () => {
  it('accepts WSOL by mint address even when the symbol is missing', () => {
    expect(isUsdOrSolQuoteSide({ address: WSOL, symbol: null })).toBe(true);
  });

  it('accepts the stable/SOL symbol class case-insensitively', () => {
    for (const symbol of ['SOL', 'wsol', 'usdc', 'Usdt']) {
      expect(isUsdOrSolQuoteSide({ address: null, symbol })).toBe(true);
    }
  });

  it('rejects every other quote asset (Bitcoin/ZEC memecoins)', () => {
    for (const symbol of ['ZEC', 'Bitcoin', 'F7931A', '', null]) {
      expect(isUsdOrSolQuoteSide({ address: null, symbol })).toBe(false);
    }
  });
});

describe('readPumpfun5m', () => {
  it('returns the four live values verbatim for a SOL-quoted pumpfun pair', () => {
    expect(readPumpfun5m(pumpPair(), MINT)).toEqual({
      volume5mUsd: 23.93,
      priceChange5m: -1.58,
      txns5mBuys: 0,
      txns5mSells: 1,
    });
  });

  it('keeps a real 0 (never collapses to null)', () => {
    const fields = readPumpfun5m(
      pumpPair({ volume5mUsd: 0, priceChange5m: 0 }),
      MINT,
    );
    expect(fields?.volume5mUsd).toBe(0);
    expect(fields?.priceChange5m).toBe(0);
  });

  it('accepts a USD-stable quote and the mint on the QUOTE side', () => {
    const fields = readPumpfun5m(
      pumpPair({
        baseToken: { address: USDC, symbol: 'USDC' },
        quoteToken: { address: MINT, symbol: 'PUMP' },
      }),
      MINT,
    );
    expect(fields?.priceChange5m).toBe(-1.58);
  });

  it('is case-insensitive on the mint side', () => {
    expect(readPumpfun5m(pumpPair(), MINT.toLowerCase())).not.toBeNull();
  });

  it('silences a non-USD/SOL quote even when upstream publishes numbers', () => {
    // Live shape of `3tnDcNa…pump`: m5 -8.93, vol 154.7, txns 1/4.
    const fields = readPumpfun5m(
      pumpPair({
        quoteToken: { address: ZEC, symbol: 'ZEC' },
        volume5mUsd: 154.7,
        priceChange5m: -8.93,
        txns5mBuys: 1,
        txns5mSells: 4,
      }),
      MINT,
    );
    expect(fields).toBeNull();
  });

  it('ignores a pair that is not the pumpfun dex', () => {
    expect(readPumpfun5m(pumpPair({ dexId: 'meteora' }), MINT)).toBeNull();
  });

  it('ignores a pumpfun pair that does not carry our mint on either side', () => {
    expect(
      readPumpfun5m(
        pumpPair({
          baseToken: { address: 'other111', symbol: 'OTHER' },
          quoteToken: { address: WSOL, symbol: 'SOL' },
        }),
        MINT,
      ),
    ).toBeNull();
  });

  it('handles a null/absent quote side without throwing', () => {
    expect(readPumpfun5m(pumpPair({ quoteToken: null }), MINT)).toBeNull();
    expect(readPumpfun5m(pumpPair({ baseToken: null }), MINT)).toBeNull();
  });

  it('drops BOTH txns counts when the pair is partial (never half a row)', () => {
    const fields = readPumpfun5m(
      pumpPair({ txns5mBuys: 3, txns5mSells: null }),
      MINT,
    );
    expect(fields).toEqual({
      volume5mUsd: 23.93,
      priceChange5m: -1.58,
      txns5mBuys: null,
      txns5mSells: null,
    });
  });

  it('nulls absent/non-finite fields instead of inventing 0', () => {
    const fields = readPumpfun5m(
      pumpPair({
        volume5mUsd: null,
        priceChange5m: Number.NaN,
        txns5mBuys: Number.POSITIVE_INFINITY,
        txns5mSells: 2,
      }),
      MINT,
    );
    expect(fields).toEqual({
      volume5mUsd: null,
      priceChange5m: null,
      txns5mBuys: null,
      txns5mSells: null,
    });
  });
});
