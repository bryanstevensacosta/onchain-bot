/**
 * Pinned measurement fixtures (dexter plan todo 28).
 *
 * These are the EXACT addresses from `.omo/evidence/task-p95-measure.log`
 * (2026-10-07, 14 first-touch probes) — transcribed, never from memory.
 * The re-measurement table in `.omo/evidence/task-fe-p95-quickwins.log`
 * re-probes this set with the same protocol (distinct address/probe,
 * `x-cache: MISS`, spacing ≥8s, end-to-end `time_total`).
 *
 * Pump rows age fast (bonding curves graduate in minutes): if a pump
 * row ever reports `pending`, that is honest staleness of the PINNED
 * row, not a wrong address — re-derive fresh rows by method (pump.fun
 * board latest, `complete=False`, DexScreener token-pairs non-empty)
 * instead of editing these pins.
 *
 * Robinhood has exactly ONE pinned row (NYMA): report n=1 WITHOUT
 * statistics (no p50/p95 on a single sample).
 */

export interface PinnedFixture {
  readonly route:
    | 'sol-pump'
    | 'sol-raydium'
    | 'sol-extra'
    | 'evm'
    | 'robinhood';
  readonly chain: string;
  readonly address: string;
  readonly label: string;
}

export const PINNED_FIXTURES: ReadonlyArray<PinnedFixture> = [
  {
    route: 'sol-pump',
    chain: 'solana',
    address: '3zPwFb3itjD7UnM5sEbEz45FDAmdJvFcif7P39ABpump',
    label: 'PUMPVILLE',
  },
  {
    route: 'sol-pump',
    chain: 'solana',
    address: 'DfCT3KNGqSvy8BkQP6j7kny232D1mVGjRe76Bd9bpump',
    label: 'darwin',
  },
  {
    route: 'sol-pump',
    chain: 'solana',
    address: 'E5TFxLQjJfqy9qMiwDGt37hQnL1dHWxLqV4t4R2Epump',
    label: 'MCH',
  },
  {
    route: 'sol-raydium',
    chain: 'solana',
    address: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    label: 'RAY',
  },
  {
    route: 'sol-raydium',
    chain: 'solana',
    address: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
    label: 'POPCAT',
  },
  {
    route: 'sol-raydium',
    chain: 'solana',
    address: 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof',
    label: 'RENDER',
  },
  {
    route: 'sol-raydium',
    chain: 'solana',
    address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    label: 'BONK',
  },
  {
    route: 'sol-extra',
    chain: 'solana',
    address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    label: 'JUP',
  },
  {
    route: 'evm',
    chain: 'ethereum',
    address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    label: 'LINK',
  },
  {
    route: 'evm',
    chain: 'ethereum',
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    label: 'USDC',
  },
  {
    route: 'evm',
    chain: 'ethereum',
    address: '0x6982508145454ce325ddbe47a25d4ec3d2311933',
    label: 'PEPE',
  },
  {
    route: 'evm',
    chain: 'ethereum',
    address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    label: 'UNI',
  },
  {
    route: 'evm',
    chain: 'ethereum',
    address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
    label: 'SHIB',
  },
  {
    route: 'robinhood',
    chain: 'robinhood',
    address: '0x968Be0c1A394Bf1cE239E3b40909eC0F9d4f5583',
    label: 'NYMA',
  },
];

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

describe('Pinned measurement fixtures (todo 28)', () => {
  it('pins 14 rows: 3 pump + 4 raydium + 1 extra + 5 evm + 1 robinhood', () => {
    expect(PINNED_FIXTURES).toHaveLength(14);
    const byRoute = (r: PinnedFixture['route']) =>
      PINNED_FIXTURES.filter((f) => f.route === r);
    expect(byRoute('sol-pump')).toHaveLength(3);
    expect(byRoute('sol-raydium')).toHaveLength(4);
    expect(byRoute('sol-extra')).toHaveLength(1);
    expect(byRoute('evm')).toHaveLength(5);
    expect(byRoute('robinhood')).toHaveLength(1);
  });

  it('every address matches its chain format (no memory-drifted rows)', () => {
    for (const f of PINNED_FIXTURES) {
      if (f.chain === 'solana') expect(f.address).toMatch(SOL_RE);
      else expect(f.address).toMatch(EVM_RE);
    }
  });

  it('all 14 addresses are distinct (cold-protocol requirement)', () => {
    const addrs = PINNED_FIXTURES.map((f) => f.address.toLowerCase());
    expect(new Set(addrs).size).toBe(PINNED_FIXTURES.length);
  });

  it('robinhood stays n=1 — reported without statistics', () => {
    const rh = PINNED_FIXTURES.filter((f) => f.route === 'robinhood');
    expect(rh).toHaveLength(1);
  });
});
