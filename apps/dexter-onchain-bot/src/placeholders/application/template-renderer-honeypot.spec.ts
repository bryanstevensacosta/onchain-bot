import type {
  HoneypotInfo,
  ResolvedToken,
} from '@/scan/domain/ports/scan-pipeline.port';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';
import {
  TEMPLATE_COMMANDS,
  placeholdersFor,
} from '@/placeholders/domain/placeholder-registry';
import { PlaceholdersController } from '@/placeholders/api/http/placeholders.controller';

const CHALE_MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';

function baseToken(overrides: Partial<ResolvedToken> = {}): ResolvedToken {
  return {
    address: CHALE_MINT,
    chain: 'solana',
    symbol: 'CHALE',
    name: 'Chale',
    marketCapUsd: null,
    fdvUsd: null,
    priceUsd: null,
    priceChange24h: null,
    liquidityUsd: null,
    lockedLiquidityPercent: null,
    burnedPercent: null,
    volume24hUsd: null,
    holders: null,
    top10HolderPercent: null,
    top20HolderPercent: null,
    totalSupply: null,
    circulatingSupply: null,
    maxSupply: null,
    devWallets: null,
    devPctSupply: null,
    poolAddress: null,
    source: 'market-data-http',
    ...overrides,
  };
}

const render = (body: string, token: ResolvedToken): string =>
  new TemplateRendererService().render(body, token, 'ca').text;

/**
 * Total matrix (plan todo 71 PASO 2, owner decisions 2026-10-19):
 * (sim, buy, sell) → row core. Extension pins labelled in the test
 * names below:
 *  - `T: b/?` is Rick's own form; `T: ?/s` and the one-sided forms
 *    under `sim='ok'|null` are OUR OWN extension (the vendor doc
 *    only defines `?` under `SIM: FAIL`).
 *  - `sim='fail'` prints a row ALWAYS (SIEMPRE — minimum
 *    `SIM: FAIL`), beating the exact-0/0 silence.
 *  - Silence ONLY: (a) both sides EXACTLY 0 (any sim except fail —
 *    "no taxes + a working round trip shows nothing"), or (b) both
 *    sides absent without a fail (nothing worth saying / no source).
 */
describe('TemplateRendererService honeypotLine 🍯 (plan todo 71)', () => {
  it('whitelists honeypotLine on every command', () => {
    for (const command of TEMPLATE_COMMANDS) {
      expect(placeholdersFor(command)).toContain('honeypotLine');
    }
  });

  it('exposes META for honeypotLine (derived, nullable, row example)', () => {
    const controller = new PlaceholdersController();
    const entry = controller
      .list('ca')
      .placeholders.find((row) => row.key === 'honeypotLine');
    expect(entry?.type).toBe('derived');
    expect(entry?.nullable).toBe(true);
    // The META `example` (like `honeypotBlock`'s blank-line one in the
    // catalog) documents the VALUE's raw bytes and is intentionally
    // unchanged; only body rendering normalizes the newlines away
    // (owner decision 2026-10-30).
    expect(entry?.example).toBe('SIM: OK ⋅ T: 3/5');
    expect(entry?.example).not.toContain('%');
  });

  it.each<[string, HoneypotInfo | null, string]>([
    [
      'SIM OK + measured sides (Rick state 1)',
      { sim: 'ok', buy: 3, sell: 5 },
      '🍯 SIM: OK ⋅ T: 3/5',
    ],
    [
      'SIM OK + decimals (1-2 dec trim)',
      { sim: 'ok', buy: 3.99, sell: 3.8 },
      '🍯 SIM: OK ⋅ T: 3\\.99/3\\.8',
    ],
    [
      'SIM OK + one zero side (never rounded to silence)',
      { sim: 'ok', buy: 0, sell: 5 },
      '🍯 SIM: OK ⋅ T: 0/5',
    ],
    [
      'SIM OK + unknown sell (OUR extension of `?`)',
      { sim: 'ok', buy: 3, sell: null },
      '🍯 SIM: OK ⋅ T: 3/?',
    ],
    [
      'SIM OK + unknown buy (OUR extension of `?`)',
      { sim: 'ok', buy: null, sell: 5 },
      '🍯 SIM: OK ⋅ T: ?/5',
    ],
    [
      'SIM OK + exact 0/0 (clean round trip) → silence',
      { sim: 'ok', buy: 0, sell: 0 },
      '',
    ],
    [
      'SIM OK + both sides absent → silence',
      { sim: 'ok', buy: null, sell: null },
      '',
    ],
    [
      'SIM FAIL without taxes (Rick state 3 — minimum row)',
      { sim: 'fail', buy: null, sell: null },
      '🍯 SIM: FAIL',
    ],
    [
      'SIM FAIL + blocked sell (Rick state 2, `b/?`)',
      { sim: 'fail', buy: 3, sell: null },
      '🍯 SIM: FAIL ⋅ T: 3/?',
    ],
    [
      'SIM FAIL + measured sides',
      { sim: 'fail', buy: 3, sell: 5 },
      '🍯 SIM: FAIL ⋅ T: 3/5',
    ],
    [
      'SIM FAIL + unknown buy (OUR extension of `?`)',
      { sim: 'fail', buy: null, sell: 5 },
      '🍯 SIM: FAIL ⋅ T: ?/5',
    ],
    [
      'SIM FAIL beats the exact-0/0 silence (SIEMPRE rule)',
      { sim: 'fail', buy: 0, sell: 0 },
      '🍯 SIM: FAIL ⋅ T: 0/0',
    ],
    [
      'no sim + measured sides (Rick state 4, external source)',
      { sim: null, buy: 3, sell: 5 },
      '🍯 T: 3/5',
    ],
    [
      'no sim + unknown sell (OUR extension of `?`)',
      { sim: null, buy: 3, sell: null },
      '🍯 T: 3/?',
    ],
    [
      'no sim + unknown buy (OUR extension of `?`)',
      { sim: null, buy: null, sell: 5 },
      '🍯 T: ?/5',
    ],
    ['no sim + exact 0/0 → silence', { sim: null, buy: 0, sell: 0 }, ''],
    [
      'no sim + one zero side stays a row',
      { sim: null, buy: 0, sell: 5 },
      '🍯 T: 0/5',
    ],
    [
      'no sim + both sides absent → silence (no source)',
      { sim: null, buy: null, sell: null },
      '',
    ],
  ])('matrix: %s', (_label, honeypot, expected) => {
    const out = render('{{honeypotLine}}', baseToken({ honeypot }));
    expect(out).toBe(expected);
  });

  it('never claims SIM without a simulation (null sim has no `SIM:`)', () => {
    const out = render(
      '{{honeypotLine}}',
      baseToken({ honeypot: { sim: null, buy: 3, sell: 5 } }),
    );
    expect(out).not.toContain('SIM');
  });

  it('never renders a bare `0` for a measured > 0 side', () => {
    expect(
      render(
        '{{honeypotLine}}',
        baseToken({ honeypot: { sim: null, buy: 0.4, sell: 0.2 } }),
      ),
    ).toBe('🍯 T: 0\\.4/0\\.2');
    expect(
      render(
        '{{honeypotLine}}',
        baseToken({ honeypot: { sim: null, buy: 0.004, sell: 0.0004 } }),
      ),
    ).toBe('🍯 T: 0\\.004/<0\\.001');
    expect(
      render(
        '{{honeypotLine}}',
        baseToken({ honeypot: { sim: null, buy: 0.001, sell: 1 } }),
      ),
    ).toBe('🍯 T: 0\\.001/1');
  });

  it('keeps the raw gate: sub-0.5 sides never round down to 0/0 silence', () => {
    const out = render(
      '{{honeypotLine}}',
      baseToken({ honeypot: { sim: null, buy: 0.1, sell: 0.1 } }),
    );
    expect(out).not.toBe('');
    expect(out).toBe('🍯 T: 0\\.1/0\\.1');
  });

  it('renders empty when the token carries no honeypot (absent / null)', () => {
    expect(render('{{honeypotLine}}', baseToken())).toBe('');
    expect(render('{{honeypotLine}}', baseToken({ honeypot: null }))).toBe('');
  });

  it('suffix mechanics: the row lowers a NEW line at the call site', () => {
    expect(
      render(
        'Liq: 1.8K{{honeypotLine}}',
        baseToken({ honeypot: { sim: 'ok', buy: 3, sell: 5 } }),
      ),
    ).toBe('Liq: 1.8K\n🍯 SIM: OK ⋅ T: 3/5');
  });

  it('suffix mechanics: silence leaves the call-site line byte-intact', () => {
    expect(
      render(
        'Liq: 1.8K{{honeypotLine}}',
        baseToken({ honeypot: { sim: 'ok', buy: 0, sell: 0 } }),
      ),
    ).toBe('Liq: 1.8K');
  });

  it('composes as a mid-body suffix without disturbing neighbours', () => {
    const token = baseToken({ honeypot: { sim: 'fail', buy: 3, sell: null } });
    expect(render('A: 1{{honeypotLine}}\nB: 2', token)).toBe(
      'A: 1\n🍯 SIM: FAIL ⋅ T: 3/?\nB: 2',
    );
    expect(
      render(
        'A: 1{{honeypotLine}}\nB: 2',
        baseToken({ honeypot: { sim: null, buy: null, sell: null } }),
      ),
    ).toBe('A: 1\nB: 2');
  });

  it('the 🍯 row survives cleanup byte-intact (no separators eaten)', () => {
    // Suffix mechanics: the value lowers the new line itself — the
    // call site attaches it at the END of the previous line.
    const out = render(
      'X{{honeypotLine}}\nY',
      baseToken({ honeypot: { sim: 'ok', buy: 3.99, sell: 0.5 } }),
    );
    expect(out).toBe('X\n🍯 SIM: OK ⋅ T: 3\\.99/0\\.5\nY');
  });

  it('carries honeypotLine in placeholdersUsed', () => {
    const out = new TemplateRendererService().render(
      '{{honeypotLine}}',
      baseToken({ honeypot: { sim: 'ok', buy: 3, sell: 5 } }),
      'ca',
    );
    expect(out.placeholdersUsed).toContain('honeypotLine');
  });

  it('renders the row without `%` or money symbols (raw numbers only)', () => {
    const out = render(
      '{{honeypotLine}}',
      baseToken({ honeypot: { sim: 'ok', buy: 3.99, sell: 100 } }),
    );
    expect(out).toBe('🍯 SIM: OK ⋅ T: 3\\.99/100');
    expect(out).not.toContain('%');
    expect(out).not.toContain('$');
  });
});
