import type {
  BatchAccountsClient,
  SolanaAccountInfoValue,
} from 'provider/infrastructure/solana-rpc/solana-rpc.types';
import { TOKEN_2022_PROGRAM, WSOL_MINT } from './solana-program-ids';
import { PumpQuoteResolver, readToken2022Symbol } from './pump-quote.resolver';

/**
 * Live wiring proof for the pump.fun quote-symbol resolver
 * (rick-compact-card §10.16 points 2-3).
 *
 * The account below is the REAL `quote_mint` of the reference mint
 * `2dNdT2gD8x2BkmffjAyQe3o6hES33jg1tAgTJCRkvBTC`'s bonding curve,
 * captured 2026-10-30 via keyless `getAccountInfo` (slot 463427716,
 * owner `Tokenz…` = Token-2022, 411 bytes):
 *
 *   [165] accountType = 1
 *   [166] ext type 18, len 64   (TransferFeeConfig)
 *   [234] ext type 19, len 173  (TokenMetadata: name `F7931A`,
 *                                symbol `Bitcoin`, IPFS uri)
 *
 * This is the ONLY path to a display symbol for that mint (no Metaplex
 * metadata account exists), so the fixture is the acceptance proof for
 * `quoteSymbol: 'Bitcoin'`.
 */
const LIVE_QUOTE_MINT = 'HytpiyuR3sVXGB5UqoqrnThCPH2X1tWVm5neep3Dpump';
/**
 * The quote mint's REAL on-chain owner, read 2026-10-30 with
 * `getMultipleAccounts` against the staging keyed RPC (411-byte account,
 * `TokenzQd…` program). Pinned as a literal so the `TOKEN_2022_PROGRAM`
 * constant can never drift back into a self-consistent fixture.
 */
const LIVE_QUOTE_MINT_OWNER = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const LIVE_QUOTE_MINT_ACCOUNT_B64 =
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfSvvjRxcAwAGAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAARIAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPxOHMU062Hc/IFZU/1WFl4JHq0zCrS9' +
  '81WKriC6BpwPEwCtAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/E4cxTTrYdz8gVlT/VYWXgkerTMKtL3zVYquILoG' +
  'nA8GAAAARjc5MzFBBwAAAEJpdGNvaW5QAAAAaHR0cHM6Ly9pcGZzLmlvL2lwZnMvYmFma3JlaWNjbGttcTZ4azZlcnJhd2R0cTZ0' +
  'dWlvanI3dmZ6ZmFjY2p4N3JtNXVzYWdyMmd6cXdveHUAAAAA';

const accountOf = (
  owner: string,
  data: Uint8Array,
): SolanaAccountInfoValue => ({
  data: [Buffer.from(data).toString('base64'), 'base64'],
  executable: false,
  lamports: 2_738_120,
  owner,
  rentEpoch: 0,
});

const liveQuoteMintAccount = (): SolanaAccountInfoValue =>
  accountOf(
    // LITERAL on purpose: the fixture owner is the account's REAL owner
    // read on-chain 2026-10-30 (`getMultipleAccounts` → 411 B mint). Using
    // the `TOKEN_2022_PROGRAM` constant here would make the resolver's
    // owner gate self-consistent with a typo — exactly the blind spot that
    // let a wrong constant (`...PHnAAvKmd1qT6M`) ship and blank
    // `quoteSymbol` on staging. The pin test below fails on any drift.
    LIVE_QUOTE_MINT_OWNER,
    Buffer.from(LIVE_QUOTE_MINT_ACCOUNT_B64, 'base64'),
  );

interface Stub extends BatchAccountsClient {
  calls: string[][];
}

/**
 * Answers from a fixed address→account map. Any address missing from the
 * map reads as `null` (an ABSENT account, not a transport failure).
 */
const stubAccounts = (
  byAddress: Readonly<Record<string, SolanaAccountInfoValue | null>>,
  onRead?: (addresses: ReadonlyArray<string>) => void,
): Stub => {
  const calls: string[][] = [];
  return {
    calls,
    getMultiple: async (addresses) => {
      calls.push([...addresses]);
      onRead?.(addresses);
      return addresses.map((address) => byAddress[address] ?? null);
    },
  };
};

const throwingStub = (): Stub => {
  const calls: string[][] = [];
  return {
    calls,
    getMultiple: async (addresses) => {
      calls.push([...addresses]);
      throw new Error('429 rate limited');
    },
  };
};

describe('TOKEN_2022_PROGRAM pin', () => {
  it('matches the owner observed on the live quote mint (43 chars)', () => {
    expect(TOKEN_2022_PROGRAM).toBe(LIVE_QUOTE_MINT_OWNER);
    expect(TOKEN_2022_PROGRAM).toHaveLength(43);
  });
});

describe('readToken2022Symbol (live account)', () => {
  it('decodes `Bitcoin` from the real 411-byte Token-2022 mint', () => {
    const bytes = Buffer.from(LIVE_QUOTE_MINT_ACCOUNT_B64, 'base64');
    expect(bytes).toHaveLength(411);
    expect(readToken2022Symbol(bytes, LIVE_QUOTE_MINT)).toBe('Bitcoin');
  });

  it('ignores a TokenMetadata entry whose embedded mint is someone else', () => {
    const bytes = Buffer.from(LIVE_QUOTE_MINT_ACCOUNT_B64, 'base64');
    expect(
      readToken2022Symbol(
        bytes,
        '2dNdT2gD8x2BkmffjAyQe3o6hES33jg1tAgTJCRkvBTC',
      ),
    ).toBeNull();
  });

  it('returns null on a truncated / pre-TLV account (never throws)', () => {
    const bytes = Buffer.from(LIVE_QUOTE_MINT_ACCOUNT_B64, 'base64');
    expect(
      readToken2022Symbol(bytes.subarray(0, 166), LIVE_QUOTE_MINT),
    ).toBeNull();
    expect(
      readToken2022Symbol(bytes.subarray(0, 100), LIVE_QUOTE_MINT),
    ).toBeNull();
  });
});

describe('PumpQuoteResolver', () => {
  it('short-circuits WSOL / absent quote mints with ZERO reads', async () => {
    const accounts = stubAccounts({});
    const resolver = new PumpQuoteResolver(accounts);
    await expect(resolver.resolve(WSOL_MINT)).resolves.toEqual({
      quoteMint: null,
      quoteSymbol: null,
    });
    await expect(resolver.resolve(null)).resolves.toEqual({
      quoteMint: null,
      quoteSymbol: null,
    });
    await expect(resolver.resolve('')).resolves.toEqual({
      quoteMint: null,
      quoteSymbol: null,
    });
    expect(accounts.calls).toHaveLength(0);
  });

  it('resolves the live quote mint and emits the read mint beside it', async () => {
    const accounts = stubAccounts({
      [LIVE_QUOTE_MINT]: liveQuoteMintAccount(),
    });
    const resolver = new PumpQuoteResolver(accounts);

    await expect(resolver.resolve(LIVE_QUOTE_MINT)).resolves.toEqual({
      quoteMint: LIVE_QUOTE_MINT,
      quoteSymbol: 'Bitcoin',
    });
    expect(accounts.calls).toHaveLength(1);
    expect(accounts.calls[0]).toEqual([LIVE_QUOTE_MINT]);
  });

  it('caches a definitive answer (one read per quote mint)', async () => {
    const accounts = stubAccounts({
      [LIVE_QUOTE_MINT]: liveQuoteMintAccount(),
    });
    const resolver = new PumpQuoteResolver(accounts);

    await resolver.resolve(LIVE_QUOTE_MINT);
    await resolver.resolve(LIVE_QUOTE_MINT);
    await resolver.resolve(LIVE_QUOTE_MINT);

    expect(accounts.calls).toHaveLength(1);
  });

  it('caches a definitive null after BOTH legs answered', async () => {
    // Readable mint, non-Token-2022 owner, no Metaplex metadata account:
    // two reads, null, and the null is definitive (memoized).
    const accounts = stubAccounts({
      [LIVE_QUOTE_MINT]: accountOf(
        '11111111111111111111111111111111',
        Buffer.alloc(165),
      ),
    });
    const resolver = new PumpQuoteResolver(accounts);

    await expect(resolver.resolve(LIVE_QUOTE_MINT)).resolves.toEqual({
      quoteMint: LIVE_QUOTE_MINT,
      quoteSymbol: null,
    });
    await resolver.resolve(LIVE_QUOTE_MINT);
    expect(accounts.calls).toHaveLength(2);
  });

  it('never memoizes a transport failure (next call retries)', async () => {
    const accounts = throwingStub();
    const resolver = new PumpQuoteResolver(accounts);

    await expect(resolver.resolve(LIVE_QUOTE_MINT)).resolves.toEqual({
      quoteMint: LIVE_QUOTE_MINT,
      quoteSymbol: null,
    });
    const firstRound = accounts.calls.length;
    expect(firstRound).toBeGreaterThan(0);

    await resolver.resolve(LIVE_QUOTE_MINT);
    expect(accounts.calls.length).toBe(firstRound * 2);
  });

  it('keeps the read quoteMint when the account is absent', async () => {
    const accounts = stubAccounts({});
    const resolver = new PumpQuoteResolver(accounts);

    await expect(resolver.resolve(LIVE_QUOTE_MINT)).resolves.toEqual({
      quoteMint: LIVE_QUOTE_MINT,
      quoteSymbol: null,
    });
  });
});
