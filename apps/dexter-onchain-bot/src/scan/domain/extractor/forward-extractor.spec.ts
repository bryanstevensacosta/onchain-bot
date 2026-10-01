import { extractForwardCandidates } from './forward-extractor';

const SOL = 'So11111111111111111111111111111111111111112';

describe('forward-extractor (any text, wallet/token/exchange)', () => {
  it('forward-ok: extracts the contract plus the mentioned exchange', () => {
    const text = `Fwd from Alpha: aping ${SOL} on Jupiter, dyor`;
    const out = extractForwardCandidates(text);
    expect(out.addresses).toEqual([SOL]);
    expect(out.exchanges).toContain('jupiter');
    expect(out.hasText).toBe(true);
  });

  it('forward-empty: text without addresses yields empty candidates', () => {
    const out = extractForwardCandidates('gm team, markets look green today');
    expect(out.addresses).toEqual([]);
    expect(out.exchanges).toEqual([]);
    expect(out.hasText).toBe(true);
  });

  it('empty input is not text at all', () => {
    expect(extractForwardCandidates('   ').hasText).toBe(false);
  });
});
