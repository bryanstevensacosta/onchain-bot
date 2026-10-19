import {
  classifyTokenSecurity,
  GOPLUS_CHAIN_IDS,
  goplusChainId,
  HONEYPOT_TRANSIENT_NOTE,
  HoneypotNegativeMemo,
  parseTaxPercent,
  resolveHoneypotEnabled,
  resolveHoneypotTimeoutMs,
  SNAPSHOT_HONEYPOT_MEMO_MAX,
  SNAPSHOT_HONEYPOT_NEGATIVE_TTL_MS,
  SNAPSHOT_HONEYPOT_REQUEST_TIMEOUT_MS,
  SNAPSHOT_HONEYPOT_TIMEOUT_MS_DEFAULT,
} from './snapshot-honeypot';

/**
 * GoPlus honeypot domain (dexter plan todo 71, Fase 1 — taxes only).
 * Pure unit pins: chain scope, fraction→percent conversion (NEVER
 * clamp, NEVER coerce), the envelope classification table (the
 * negative-memo contract depends on it), the bounded memo, and the
 * kill-switch. Fixtures are LIVE-verbatim witnesses (2026-10-19):
 * SAFEMOONCASH bsc `"0.04"`/`"0.02"`, PEPE eth `"0"`/`"0"`, CAKE bsc
 * entry present with both tax keys ABSENT.
 */

const SAFEMOONCASH = '0xF017E2773e4ee0590C81D79ccbcF1B2De1D22877';
const PEPE = '0x6982508145454Ce325dDbE47a25d4ec3d2311933';
const CAKE = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82';

const lower = (address: string): string => address.toLowerCase();

/** GoPlus success envelope for ONE address entry. */
function okBody(entry: unknown): Record<string, unknown> {
  return {
    code: 1,
    message: 'OK',
    result: { [lower(SAFEMOONCASH)]: entry },
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
    });
  });

  it('CAKE: entry present, tax keys ABSENT -> both nulls (probed, no data)', () => {
    const probe = classifyTokenSecurity(okBody({}), SAFEMOONCASH);
    expect(probe).toEqual({
      kind: 'reading',
      reading: { buy: null, sell: null, sim: null },
    });
  });

  it('always emits sim: null (Fase 1 — honeypot.is/SIM deferred)', () => {
    const probe = classifyTokenSecurity(
      okBody({ buy_tax: '1', sell_tax: '1', is_honeypot: '1' }),
      SAFEMOONCASH,
    );
    expect(probe.kind).toBe('reading');
    if (probe.kind === 'reading') {
      expect(probe.reading.sim).toBeNull();
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
    });
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
