import { scoreSolanaProbe } from 'chain/detection/infrastructure/probers/score-solana-probe';

describe('scoreSolanaProbe', () => {
  it('returns 0 points when probe was rejected', () => {
    const result = {
      status: 'rejected' as const,
      reason: new Error('rpc down'),
    };
    const { points, reasons } = scoreSolanaProbe(result);
    expect(points).toBe(0);
    expect(reasons).toEqual(['probe:solana:error']);
  });

  it('returns 30 points when RPC responded but account does not exist', () => {
    const result = {
      status: 'fulfilled' as const,
      value: { responded: true, isContract: false, notes: [] },
    };
    const { points, reasons } = scoreSolanaProbe(result);
    expect(points).toBe(30);
    expect(reasons).toContain('rpc:responded');
    expect(reasons).not.toContain('account:exists');
  });

  it('returns 60 points when RPC responded and account exists', () => {
    const result = {
      status: 'fulfilled' as const,
      value: { responded: true, isContract: true, notes: [] },
    };
    const { points, reasons } = scoreSolanaProbe(result);
    expect(points).toBe(60);
    expect(reasons).toContain('rpc:responded');
    expect(reasons).toContain('account:exists');
  });

  it('returns 0 points when RPC did not respond and account null', () => {
    const result = {
      status: 'fulfilled' as const,
      value: { responded: false, isContract: null, notes: [] },
    };
    const { points } = scoreSolanaProbe(result);
    expect(points).toBe(0);
  });

  it('appends prober notes as reasons', () => {
    const result = {
      status: 'fulfilled' as const,
      value: {
        responded: true,
        isContract: true,
        notes: ['solana:format_not_32_bytes'],
      },
    };
    const { reasons } = scoreSolanaProbe(result);
    expect(reasons).toContain('note:solana:format_not_32_bytes');
  });
});
