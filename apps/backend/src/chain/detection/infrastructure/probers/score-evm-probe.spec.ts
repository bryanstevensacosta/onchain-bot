import { scoreEvmProbe } from 'chain/detection/infrastructure/probers/score-evm-probe';

describe('scoreEvmProbe', () => {
  it('returns 0 points when probe was rejected', () => {
    const result = {
      status: 'rejected' as const,
      reason: new Error('rpc down'),
    };
    const { points, reasons } = scoreEvmProbe(result);
    expect(points).toBe(0);
    expect(reasons).toEqual(['probe:evm:error']);
  });

  it('returns 20 points when RPC responded but no code', () => {
    const result = {
      status: 'fulfilled' as const,
      value: { responded: true, isContract: false, notes: [] },
    };
    const { points, reasons } = scoreEvmProbe(result);
    expect(points).toBe(20);
    expect(reasons).toContain('rpc:responded');
    expect(reasons).not.toContain('has_code:true');
  });

  it('returns 30 points when RPC responded and address has code', () => {
    const result = {
      status: 'fulfilled' as const,
      value: { responded: true, isContract: true, notes: [] },
    };
    const { points, reasons } = scoreEvmProbe(result);
    expect(points).toBe(30);
    expect(reasons).toContain('rpc:responded');
    expect(reasons).toContain('has_code:true');
  });

  it('returns 0 points when RPC did not respond and no code', () => {
    const result = {
      status: 'fulfilled' as const,
      value: { responded: false, isContract: null, notes: [] },
    };
    const { points } = scoreEvmProbe(result);
    expect(points).toBe(0);
  });

  it('appends prober notes as reasons', () => {
    const result = {
      status: 'fulfilled' as const,
      value: {
        responded: true,
        isContract: true,
        notes: ['evm:rpc_error', 'evm:format_invalid'],
      },
    };
    const { reasons } = scoreEvmProbe(result);
    expect(reasons).toContain('note:evm:rpc_error');
    expect(reasons).toContain('note:evm:format_invalid');
  });
});
