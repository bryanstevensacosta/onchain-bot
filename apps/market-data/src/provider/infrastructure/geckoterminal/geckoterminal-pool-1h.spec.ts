import type { GeckoTerminalPoolResource } from './geckoterminal.types';
import { selectPoolQuote } from './geckoterminal.service';

/**
 * GeckoTerminal pool 1-hour bucket (dexter `1H` row) — `selectPoolQuote`
 * contract.
 *
 * The pick is the SAME pool the OHLC-derivation leg already fetches, so
 * harvesting this bucket pays ZERO extra HTTP calls. Pair-level only —
 * `volume_usd.h1` / `price_change_percentage.h1` are never summed with
 * other buckets. Honesty rules pinned here: absent/non-finite → `null`
 * (never `0`), a real `0` survives, `priceChange1h` is BASE-SIDE only
 * (a pool quoting our mint cannot attribute its own change), and txns
 * are a WHOLE-PAIR rule — a partial/non-finite `transactions.h1` nulls
 * BOTH sides (no `{buys:0,sells:0}` default).
 */
const MINT = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const OTHER = '0x0000000000000000000000000000000000000001';
const POOL = '0x926900000000000000000000000000000000ef60';

type PoolAttrs = GeckoTerminalPoolResource['attributes'];

function pool(
  attributes: Partial<PoolAttrs> = {},
  relationships: GeckoTerminalPoolResource['relationships'] = {
    base_token: { data: { id: `solana_${MINT}` } },
    quote_token: { data: { id: `solana_${OTHER}` } },
    dex: { data: { id: 'pumpswap', type: 'dex' } },
  },
): GeckoTerminalPoolResource {
  return {
    id: `solana_${POOL}`,
    type: 'pool',
    attributes: {
      address: POOL,
      base_token_price_usd: '0.000002325209423',
      quote_token_price_usd: '2692.72',
      fdv_usd: '2183.4567813695317',
      reserve_in_usd: '2365.4217',
      ...attributes,
    },
    relationships,
  };
}

describe('GeckoPoolQuote 1h bucket (pool pick, zero extra calls)', () => {
  it('carries real 0 for all four 1h readings', () => {
    const pick = selectPoolQuote(
      [
        pool({
          volume_usd: { h24: '1000', h1: '0' },
          price_change_percentage: { h24: '5', h1: '0' },
          transactions: { h1: { buys: 0, sells: 0 } },
        }),
      ],
      MINT,
    );

    expect(pick?.volume1hUsd).toBe(0);
    expect(pick?.priceChange1h).toBe(0);
    expect(pick?.txns1hBuys).toBe(0);
    expect(pick?.txns1hSells).toBe(0);
  });

  it('keeps the pair-level bucket verbatim (never summed with h24)', () => {
    const pick = selectPoolQuote(
      [
        pool({
          volume_usd: { h24: '1000', h1: '12.5' },
          price_change_percentage: { h24: '5', h1: '-0.25' },
          transactions: { h1: { buys: 7, sells: 3 } },
        }),
      ],
      MINT,
    );

    expect(pick?.volume24hUsd).toBe(1000);
    expect(pick?.volume1hUsd).toBe(12.5);
    expect(pick?.priceChange24h).toBe(5);
    expect(pick?.priceChange1h).toBe(-0.25);
    expect(pick?.txns1hBuys).toBe(7);
    expect(pick?.txns1hSells).toBe(3);
  });

  it('nulls every 1h field when the buckets are absent', () => {
    const pick = selectPoolQuote(
      [
        pool({
          volume_usd: { h24: '1000' },
          price_change_percentage: { h24: '5' },
        }),
      ],
      MINT,
    );

    expect(pick?.volume1hUsd).toBeNull();
    expect(pick?.priceChange1h).toBeNull();
    expect(pick?.txns1hBuys).toBeNull();
    expect(pick?.txns1hSells).toBeNull();
  });

  it('nulls non-finite h1 values (never 0)', () => {
    const pick = selectPoolQuote(
      [
        pool({
          volume_usd: { h24: '1000', h1: 'garbage' },
          price_change_percentage: { h24: '5', h1: Number.NaN },
          transactions: { h1: { buys: 'nope', sells: -3 } },
        }),
      ],
      MINT,
    );

    expect(pick?.volume1hUsd).toBeNull();
    expect(pick?.priceChange1h).toBeNull();
    // One non-finite side nulls the WHOLE pair (no partial reading).
    expect(pick?.txns1hBuys).toBeNull();
    expect(pick?.txns1hSells).toBeNull();
  });

  it('base-side pick maps priceChange1h', () => {
    const pick = selectPoolQuote(
      [
        pool({
          price_change_percentage: { h24: '5', h1: '3.25' },
        }),
      ],
      MINT,
    );

    expect(pick?.side).toBe('base');
    expect(pick?.priceChange1h).toBe(3.25);
  });

  it('quote-side pick maps volume + txns but never the pool change', () => {
    const pick = selectPoolQuote(
      [
        pool(
          {
            volume_usd: { h24: '1000', h1: '12.5' },
            price_change_percentage: { h24: '5', h1: '3.25' },
            transactions: { h1: { buys: 7, sells: 3 } },
          },
          {
            base_token: { data: { id: `solana_${OTHER}` } },
            quote_token: { data: { id: `solana_${MINT}` } },
            dex: { data: { id: 'pumpswap', type: 'dex' } },
          },
        ),
      ],
      MINT,
    );

    expect(pick?.side).toBe('quote');
    // The change belongs to the OTHER (base) token — never attributed.
    expect(pick?.priceChange1h).toBeNull();
    // Volume/txns are pair-level numbers: they map on either side.
    expect(pick?.volume1hUsd).toBe(12.5);
    expect(pick?.txns1hBuys).toBe(7);
    expect(pick?.txns1hSells).toBe(3);
  });

  it('nulls BOTH txn sides when transactions.h1 is partial', () => {
    const missingSells = selectPoolQuote(
      [
        pool({
          transactions: { h1: { buys: 7 } as unknown as { buys: number } },
        }),
      ],
      MINT,
    );
    expect(missingSells?.txns1hBuys).toBeNull();
    expect(missingSells?.txns1hSells).toBeNull();

    const missingBuys = selectPoolQuote(
      [pool({ transactions: { h1: { sells: 3 } } })],
      MINT,
    );
    expect(missingBuys?.txns1hBuys).toBeNull();
    expect(missingBuys?.txns1hSells).toBeNull();
  });

  it('nulls BOTH txn sides when transactions is absent entirely', () => {
    const absent = selectPoolQuote([pool()], MINT);
    expect(absent?.txns1hBuys).toBeNull();
    expect(absent?.txns1hSells).toBeNull();

    const emptyH1 = selectPoolQuote(
      [pool({ transactions: { h1: null } })],
      MINT,
    );
    expect(emptyH1?.txns1hBuys).toBeNull();
    expect(emptyH1?.txns1hSells).toBeNull();
  });
});
