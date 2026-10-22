import {
  classifyTokenSecurity,
  GOPLUS_CHAIN_IDS,
  goplusChainId,
  HONEYPOT_TRANSIENT_NOTE,
  HoneypotNegativeMemo,
  parseTaxPercent,
  resolveHoneypotEnabled,
  resolveHoneypotTimeoutMs,
  resolveSimVerdictEnabled,
  SNAPSHOT_HONEYPOT_MEMO_MAX,
  SNAPSHOT_HONEYPOT_NEGATIVE_TTL_MS,
  SNAPSHOT_HONEYPOT_REQUEST_TIMEOUT_MS,
  SNAPSHOT_HONEYPOT_TIMEOUT_MS_DEFAULT,
} from './snapshot-honeypot';

/**
 * GoPlus honeypot domain (dexter plan todo 71 + `rick-compact-card`
 * D1/D3). Pure unit pins: chain scope, fraction→percent conversion
 * (taxes NEVER clamp, locks DO per D3), the envelope classification
 * table (the negative-memo contract depends on it), the bounded memo,
 * the SIM matrix, the LP-lock buckets and both kill-switches. Fixtures
 * are LIVE-verbatim witnesses (2026-10-19 + KODA 2026-10-22):
 * SAFEMOONCASH bsc `"0.04"`/`"0.02"`, PEPE eth `"0"`/`"0"`, CAKE bsc
 * entry present with both tax keys ABSENT, KODA BSC
 * `is_honeypot:"0"`/`sell_tax:"0.0297"` + PinkLock `0.9999…` and a
 * `Null Address` row at `percent:"0"`.
 */

const SAFEMOONCASH = '0xF017E2773e4ee0590C81D79ccbcF1B2De1D22877';
const PEPE = '0x6982508145454Ce325dDbE47a25d4ec3d2311933';
const CAKE = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82';
const KODA = '0xd3775c4D5C517AaCAe0CCF906DCD96713b5749cF';
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
const PINK_LOCK = '0x4079e1d1a1c6c4d3f9d8cb6a7b0b8f9e9f1a1bbe';

const lower = (address: string): string => address.toLowerCase();

/** GoPlus success envelope for ONE address entry. */
function okBody(
  entry: unknown,
  address: string = SAFEMOONCASH,
): Record<string, unknown> {
  return {
    code: 1,
    message: 'OK',
    result: { [lower(address)]: entry },
  };
}

describe('goplusChainId (probed scope only)', () => {
  it('maps exactly ethereum=1, bsc=56, base=8453', () => {
    expect(goplusChainId('ethereum')).toBe(1);
    expect(goplusChainId('bsc')).toBe(56);
    expect(goplusChainId('base')).toBe(8453);
    expect(Object.keys(GOPLUS_CHAIN_IDS).sort()).toEqual([
      'base',
      'bsc',
      'ethereum',
    ]);
  });

  it('normalizes case/whitespace', () => {
    expect(goplusChainId(' BSC ')).toBe(56);
    expect(goplusChainId('Ethereum')).toBe(1);
  });

  it('stays silent (null) on every out-of-scope chain', () => {
    for (const chain of [
      'solana',
      'robinhood',
      'arbitrum',
      'polygon',
      'optimism',
      'unichain',
      '',
      '   ',
    ]) {
      expect(goplusChainId(chain)).toBeNull();
    }
    expect(goplusChainId(undefined as unknown as string)).toBeNull();
    expect(goplusChainId(1 as unknown as string)).toBeNull();
  });
});

describe('parseTaxPercent (fraction -> percent, 4-decimal rounded)', () => {
  it('converts live fraction strings to percent (SAFEMOONCASH witnesses)', () => {
    expect(parseTaxPercent('0.04')).toBe(4);
    expect(parseTaxPercent('0.02')).toBe(2);
    expect(parseTaxPercent('0.004')).toBe(0.4);
  });

  it('treats explicit zero as a measured zero (PEPE witness)', () => {
    expect(parseTaxPercent('0')).toBe(0);
    expect(parseTaxPercent(0)).toBe(0);
  });

  it('accepts the boundary and numeric shapes', () => {
    expect(parseTaxPercent('1')).toBe(100);
    expect(parseTaxPercent(1)).toBe(100);
    expect(parseTaxPercent(0.04)).toBe(4);
    expect(parseTaxPercent('0.333333')).toBe(33.3333);
    expect(parseTaxPercent('0.000123')).toBe(0.0123);
  });

  it('resolves absent/blank/non-numeric to null — NEVER 0 (CAKE witness)', () => {
    expect(parseTaxPercent(undefined)).toBeNull();
    expect(parseTaxPercent(null)).toBeNull();
    expect(parseTaxPercent('')).toBeNull();
    expect(parseTaxPercent('   ')).toBeNull();
    expect(parseTaxPercent('abc')).toBeNull();
    expect(parseTaxPercent('NaN')).toBeNull();
    expect(parseTaxPercent({})).toBeNull();
    expect(parseTaxPercent([])).toBeNull();
    expect(parseTaxPercent(Number.NaN)).toBeNull();
    expect(parseTaxPercent(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('resolves out-of-range percents to null — NEVER clamps', () => {
    expect(parseTaxPercent('1.01')).toBeNull();
    expect(parseTaxPercent('-0.01')).toBeNull();
    expect(parseTaxPercent('-1')).toBeNull();
    expect(parseTaxPercent(1.5)).toBeNull();
  });
});

describe('classifyTokenSecurity (pinned classification table)', () => {
  it('SAFEMOONCASH: "0.04"/"0.02" -> {buy:4,sell:2,sim:null}', () => {
    const probe = classifyTokenSecurity(
      okBody({ buy_tax: '0.04', sell_tax: '0.02' }),
      SAFEMOONCASH,
    );
    expect(probe).toEqual({
      kind: 'reading',
      reading: { buy: 4, sell: 2, sim: null },
      lpLock: null,
    });
  });

  it('PEPE: "0"/"0" -> measured zeroes, not nulls', () => {
    const probe = classifyTokenSecurity(
      okBody({ buy_tax: '0', sell_tax: '0' }),
      SAFEMOONCASH,
    );
    expect(probe).toEqual({
      kind: 'reading',
      reading: { buy: 0, sell: 0, sim: null },
      lpLock: null,
    });
  });

  it('CAKE: entry present, tax keys ABSENT -> both nulls (probed, no data)', () => {
    const probe = classifyTokenSecurity(okBody({}), SAFEMOONCASH);
    expect(probe).toEqual({
      kind: 'reading',
      reading: { buy: null, sell: null, sim: null },
      lpLock: null,
    });
  });

  it('sim: is_honeypot present and "0" -> ok (KODA witness), taxes untouched', () => {
    const probe = classifyTokenSecurity(
      okBody({ buy_tax: '0', sell_tax: '0.0297', is_honeypot: '0' }, KODA),
      KODA,
    );
    expect(probe).toEqual({
      kind: 'reading',
      reading: { buy: 0, sell: 2.97, sim: 'ok' },
      lpLock: null,
    });
  });

  it('sim: numeric 0 is the same ok verdict', () => {
    const probe = classifyTokenSecurity(
      okBody({ is_honeypot: 0, cannot_buy: 0, cannot_sell_all: '0' }),
      SAFEMOONCASH,
    );
    expect(probe.kind).toBe('reading');
    if (probe.kind === 'reading') expect(probe.reading.sim).toBe('ok');
  });

  it('sim: fail when is_honeypot is 1 (string OR number)', () => {
    for (const value of ['1', 1]) {
      const probe = classifyTokenSecurity(
        okBody({ is_honeypot: value }),
        SAFEMOONCASH,
      );
      expect(probe.kind).toBe('reading');
      if (probe.kind === 'reading') expect(probe.reading.sim).toBe('fail');
    }
  });

  it('sim: cannot_buy / cannot_sell_all alone force fail (is_honeypot absent or 0)', () => {
    const cases = [
      { cannot_buy: '1' },
      { cannot_sell_all: 1 },
      { is_honeypot: '0', cannot_buy: '1' },
      { is_honeypot: '0', cannot_sell_all: '1' },
    ];
    for (const entry of cases) {
      const probe = classifyTokenSecurity(okBody(entry), SAFEMOONCASH);
      expect(probe.kind).toBe('reading');
      if (probe.kind === 'reading') expect(probe.reading.sim).toBe('fail');
    }
  });

  it('sim: is_honeypot ABSENT -> null (other flags only force fail, never ok)', () => {
    const cases = [
      {},
      { cannot_buy: '0', cannot_sell_all: '0' },
      { is_honeypot: 'true' },
      { is_honeypot: 2 },
      { is_honeypot: '' },
      { is_honeypot: null },
    ];
    for (const entry of cases) {
      const probe = classifyTokenSecurity(okBody(entry), SAFEMOONCASH);
      expect(probe.kind).toBe('reading');
      if (probe.kind === 'reading') expect(probe.reading.sim).toBeNull();
    }
  });

  it('matches the entry by LOWERCASE address', () => {
    const probe = classifyTokenSecurity(
      okBody({ buy_tax: '0.04', sell_tax: '0.02' }),
      SAFEMOONCASH.toUpperCase().replace('0X', '0x'),
    );
    expect(probe).toEqual({
      kind: 'reading',
      reading: { buy: 4, sell: 2, sim: null },
      lpLock: null,
    });
  });

  it('body code 2022 = definitive absence (the verdict rides the BODY at HTTP 200)', () => {
    expect(
      classifyTokenSecurity(
        {
          code: 2022,
          message: 'The main chain is not supported',
          result: null,
        },
        SAFEMOONCASH,
      ),
    ).toEqual({ kind: 'definitive-absence' });
  });

  it('code 2022 as a STRING is envelope damage (transient, never memoized)', () => {
    expect(
      classifyTokenSecurity({ code: '2022', result: null }, SAFEMOONCASH),
    ).toEqual({ kind: 'transient' });
  });

  it('non-record bodies are transient', () => {
    for (const body of [null, undefined, 'oops', 42, [], [okBody({})]]) {
      expect(classifyTokenSecurity(body, SAFEMOONCASH)).toEqual({
        kind: 'transient',
      });
    }
  });

  it('any other non-1 code is transient (odd codes are damage, not verdicts)', () => {
    for (const code of [5000, 0, -1, '1', null, undefined, true]) {
      expect(classifyTokenSecurity({ code, result: {} }, SAFEMOONCASH)).toEqual(
        { kind: 'transient' },
      );
    }
  });

  it('code 1 with a non-record result is definitive absence', () => {
    for (const result of [null, undefined, [], 'x', 42]) {
      expect(classifyTokenSecurity({ code: 1, result }, SAFEMOONCASH)).toEqual({
        kind: 'definitive-absence',
      });
    }
  });

  it('code 1 with the address ABSENT from result is definitive absence', () => {
    expect(
      classifyTokenSecurity(
        { code: 1, result: { [lower(PEPE)]: { buy_tax: '0' } } },
        SAFEMOONCASH,
      ),
    ).toEqual({ kind: 'definitive-absence' });
  });

  it('entry present but NOT a record is transient (broken envelope, never memoized)', () => {
    for (const entry of [null, 'x', 42, []]) {
      expect(classifyTokenSecurity(okBody(entry), SAFEMOONCASH)).toEqual({
        kind: 'transient',
      });
    }
  });

  it('pins the live CAKE envelope shape (bare entry object)', () => {
    const body = {
      code: 1,
      message: 'OK',
      result: { [lower(CAKE)]: {} },
    };
    expect(classifyTokenSecurity(body, CAKE)).toEqual({
      kind: 'reading',
      reading: { buy: null, sell: null, sim: null },
      lpLock: null,
    });
  });

  it('KODA lp_holders: PinkLock fraction + Null Address zero -> {locked:100,burned:0}', () => {
    const probe = classifyTokenSecurity(
      okBody(
        {
          is_honeypot: '0',
          buy_tax: '0',
          sell_tax: '0.0297',
          lp_holders: [
            {
              address: PINK_LOCK,
              percent: '0.999999999999999999',
              is_locked: 1,
              tag: 'PinkLock02',
            },
            { address: NULL_ADDRESS, percent: '0', is_locked: 1 },
          ],
        },
        KODA,
      ),
      KODA,
    );
    expect(probe).toEqual({
      kind: 'reading',
      reading: { buy: 0, sell: 2.97, sim: 'ok' },
      lpLock: { lockedPercent: 100, burnedPercent: 0 },
    });
  });

  it('lp_holders: null-address rows are BURNED regardless of is_locked (case-insensitive)', () => {
    const probe = classifyTokenSecurity(
      okBody({
        lp_holders: [
          {
            address: '0X0000000000000000000000000000000000000000',
            percent: '1',
          },
          {
            address: '0x0000000000000000000000000000000000000000',
            percent: '0.25',
          },
        ],
      }),
      SAFEMOONCASH,
    );
    expect(probe.kind).toBe('reading');
    if (probe.kind === 'reading') {
      expect(probe.lpLock).toEqual({ lockedPercent: 0, burnedPercent: 100 });
    }
  });

  it('lp_holders: strict is_locked (1|"1" only) — 0/absent/other stay unlocked', () => {
    const probe = classifyTokenSecurity(
      okBody({
        lp_holders: [
          { address: PINK_LOCK, percent: '0.2', is_locked: 1 },
          {
            address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            percent: '0.2',
            is_locked: '1',
          },
          {
            address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            percent: '0.2',
            is_locked: 0,
          },
          {
            address: '0xcccccccccccccccccccccccccccccccccccccccc',
            percent: '0.2',
          },
          {
            address: '0xdddddddddddddddddddddddddddddddddddddddd',
            percent: '0.2',
            is_locked: 'true',
          },
        ],
      }),
      SAFEMOONCASH,
    );
    expect(probe.kind).toBe('reading');
    if (probe.kind === 'reading') {
      expect(probe.lpLock).toEqual({ lockedPercent: 40, burnedPercent: 0 });
    }
  });

  it('lp_holders: null when absent / empty (no data — never 0%)', () => {
    for (const lp_holders of [undefined, null, [], 'x', {}]) {
      const probe = classifyTokenSecurity(
        okBody(lp_holders === undefined ? {} : { lp_holders }),
        SAFEMOONCASH,
      );
      expect(probe.kind).toBe('reading');
      if (probe.kind === 'reading') expect(probe.lpLock).toBeNull();
    }
  });

  it('lp_holders: empty with lp_holder_count > 0 is STILL null (API returned no rows)', () => {
    const probe = classifyTokenSecurity(
      okBody({ lp_holders: [], lp_holder_count: 3 }),
      SAFEMOONCASH,
    );
    expect(probe.kind).toBe('reading');
    if (probe.kind === 'reading') expect(probe.lpLock).toBeNull();
  });

  it('lp_holders: no row carries a parseable percent -> null (rows omitted)', () => {
    const probe = classifyTokenSecurity(
      okBody({
        lp_holders: [
          { address: PINK_LOCK, percent: 'n/a', is_locked: 1 },
          { address: PINK_LOCK, percent: null, is_locked: 1 },
          { address: PINK_LOCK, is_locked: 1 },
          { address: PINK_LOCK, percent: {}, is_locked: 1 },
          null,
          'garbage',
        ],
      }),
      SAFEMOONCASH,
    );
    expect(probe.kind).toBe('reading');
    if (probe.kind === 'reading') expect(probe.lpLock).toBeNull();
  });

  it('lp_holders: at least one parseable row -> object with BOTH numbers (0 bucket included)', () => {
    const probe = classifyTokenSecurity(
      okBody({
        lp_holders: [
          { address: PINK_LOCK, percent: '0.5', is_locked: 1 },
          {
            address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            percent: 'n/a',
            is_locked: 1,
          },
        ],
      }),
      SAFEMOONCASH,
    );
    expect(probe.kind).toBe('reading');
    if (probe.kind === 'reading') {
      expect(probe.lpLock).toEqual({ lockedPercent: 50, burnedPercent: 0 });
    }
  });

  it('lp_holders: fraction -> percent is 4dp rounded and clamped 0-100', () => {
    const probe = classifyTokenSecurity(
      okBody({
        lp_holders: [
          { address: PINK_LOCK, percent: '0.33333333', is_locked: 1 },
          {
            address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            percent: 0.5,
            is_locked: 1,
          },
          {
            address: '0xcccccccccccccccccccccccccccccccccccccccc',
            percent: '1.5',
            is_locked: 1,
          },
          {
            address: '0xdddddddddddddddddddddddddddddddddddddddd',
            percent: '-0.5',
            is_locked: 1,
          },
        ],
      }),
      SAFEMOONCASH,
    );
    expect(probe.kind).toBe('reading');
    if (probe.kind === 'reading') {
      // 33.3333 + 50 + 100 (clamped) + 0 (clamped) = 183.3333 -> 100.
      expect(probe.lpLock).toEqual({ lockedPercent: 100, burnedPercent: 0 });
    }
  });

  it('keeps a reading with lpLock null a READING (never memoized by the caller)', () => {
    const probe = classifyTokenSecurity(okBody({}), SAFEMOONCASH);
    expect(probe.kind).toBe('reading');
    if (probe.kind === 'reading') expect(probe.lpLock).toBeNull();
  });
});

describe('HoneypotNegativeMemo (bounded, definitive absences only)', () => {
  it('remembers a key for exactly the TTL window', () => {
    const memo = new HoneypotNegativeMemo(1_000, 10);
    const t = 5_000;
    memo.remember('k', t);
    expect(memo.has('k', t)).toBe(true);
    expect(memo.has('k', t + 999)).toBe(true);
    expect(memo.has('k', t + 1_000)).toBe(false);
    // Expired entry is evicted by the has() read.
    expect(memo.has('k', t + 1_001)).toBe(false);
  });

  it('evicts the oldest insertion at the capacity cap (FIFO)', () => {
    const memo = new HoneypotNegativeMemo(10_000, 2);
    memo.remember('a', 0);
    memo.remember('b', 0);
    // Re-remembering refreshes insertion order: `a` is now newest.
    memo.remember('a', 0);
    memo.remember('c', 0);
    expect(memo.has('a', 0)).toBe(true);
    expect(memo.has('c', 0)).toBe(true);
    expect(memo.has('b', 0)).toBe(false);
  });

  it('never grows past the default 500 cap', () => {
    const memo = new HoneypotNegativeMemo();
    for (let i = 0; i < SNAPSHOT_HONEYPOT_MEMO_MAX + 25; i += 1) {
      memo.remember(`k${i}`, 0);
    }
    expect(memo.has('k0', 0)).toBe(false);
    expect(memo.has('k24', 0)).toBe(false);
    expect(memo.has(`k${SNAPSHOT_HONEYPOT_MEMO_MAX + 24}`, 0)).toBe(true);
  });

  it('pins the constants (6h TTL, 500 cap, 2s request ceiling)', () => {
    expect(SNAPSHOT_HONEYPOT_NEGATIVE_TTL_MS).toBe(6 * 60 * 60 * 1000);
    expect(SNAPSHOT_HONEYPOT_MEMO_MAX).toBe(500);
    expect(SNAPSHOT_HONEYPOT_REQUEST_TIMEOUT_MS).toBe(2_000);
  });
});

describe('resolveHoneypotEnabled (kill-switch, default ON)', () => {
  it('defaults ENABLED on unset/blank/truthy tokens', () => {
    for (const raw of [
      undefined,
      '',
      '   ',
      '1',
      'true',
      'yes',
      'on',
      'TRUE',
    ]) {
      expect(resolveHoneypotEnabled(raw)).toBe(true);
    }
  });

  it('disables only on explicit false-ish tokens', () => {
    for (const raw of ['0', 'false', 'off', 'no', 'disabled', ' FALSE ']) {
      expect(resolveHoneypotEnabled(raw)).toBe(false);
    }
  });
});

describe('resolveSimVerdictEnabled (D1 kill-switch, default ON)', () => {
  it('defaults ENABLED on unset/blank/truthy tokens', () => {
    for (const raw of [
      undefined,
      '',
      '   ',
      '1',
      'true',
      'yes',
      'on',
      'TRUE',
    ]) {
      expect(resolveSimVerdictEnabled(raw)).toBe(true);
    }
  });

  it('disables only on explicit false-ish tokens (0|false|off|no|disabled)', () => {
    for (const raw of ['0', 'false', 'off', 'no', 'disabled', ' FALSE ']) {
      expect(resolveSimVerdictEnabled(raw)).toBe(false);
    }
  });
});

describe('resolveHoneypotTimeoutMs (own tail budget, default 1500)', () => {
  it('defaults to 1500 on unset', () => {
    expect(SNAPSHOT_HONEYPOT_TIMEOUT_MS_DEFAULT).toBe(1_500);
    expect(resolveHoneypotTimeoutMs(undefined)).toBe(1_500);
  });

  it('accepts a positive override (Math.floor)', () => {
    expect(resolveHoneypotTimeoutMs('2500')).toBe(2_500);
    expect(resolveHoneypotTimeoutMs('1200.9')).toBe(1_200);
  });

  it('falls back to the default on garbage / non-positive / non-finite', () => {
    for (const raw of [
      '',
      '   ',
      'abc',
      '0',
      '-5',
      'NaN',
      'Infinity',
      '1e999',
    ]) {
      expect(resolveHoneypotTimeoutMs(raw)).toBe(1_500);
    }
  });
});

describe('transient note text (honesty contract)', () => {
  it('says fail-open + retries next request', () => {
    expect(HONEYPOT_TRANSIENT_NOTE).toContain('transient');
    expect(HONEYPOT_TRANSIENT_NOTE).toContain('retries next request');
  });
});
