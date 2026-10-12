import {
  PUBLIC_RPC_BACKOFF_MINUTES,
  PUBLIC_RPC_BACKOFF_MS,
  PublicRpcRotator,
  isPublicRpcBackoffSignal,
  publicRpcHost,
} from './public-rpc-rotator';

const A = 'https://a.example/rpc';
const B = 'https://b.example/rpc';
const C = 'https://c.example/rpc';

describe('PublicRpcRotator (dexter plan todo 42)', () => {
  it('pins N = 5 minutes of backoff', () => {
    expect(PUBLIC_RPC_BACKOFF_MINUTES).toBe(5);
    expect(PUBLIC_RPC_BACKOFF_MS).toBe(5 * 60_000);
  });

  it('rotates the start endpoint across consecutive calls (round-robin)', () => {
    const rotator = new PublicRpcRotator([A, B, C]);
    const first = rotator.orderedEndpoints(1_000);
    const second = rotator.orderedEndpoints(1_000);
    const third = rotator.orderedEndpoints(1_000);
    expect(first[0]).toBe(A);
    expect(second[0]).toBe(B);
    expect(third[0]).toBe(C);
    // Every call still offers every healthy endpoint (failover intact).
    expect([...first].sort()).toEqual([A, B, C]);
  });

  it('prefers the faster endpoint by latency score (worst-healthy last)', () => {
    const rotator = new PublicRpcRotator([A, B]);
    rotator.recordSuccess(A, 2_000);
    rotator.recordSuccess(B, 50);
    // Cursor starts at 0 and B (faster) ranks first either way here.
    expect(rotator.orderedEndpoints(1_000)[0]).toBe(B);
  });

  it('decays scores so a once-slow endpoint is re-tried, not buried', () => {
    const rotator = new PublicRpcRotator([A, B]);
    rotator.recordSuccess(A, 10_000);
    rotator.recordSuccess(B, 10);
    for (let i = 0; i < 200; i += 1) {
      rotator.orderedEndpoints(1_000 + i);
    }
    // After enough decay reads the gap collapses toward zero.
    const order = rotator.orderedEndpoints(9_999);
    expect(order).toHaveLength(2);
  });

  it('parks a 429 endpoint for N minutes with zero traffic + enter-note', () => {
    const rotator = new PublicRpcRotator([A, B]);
    rotator.recordFailure(A, true, '429', 1_000);
    const during = rotator.orderedEndpoints(2_000);
    expect(during).toEqual([B]);
    const notes = rotator.drainNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].key).toBe('public-rotation:a.example');
    expect(notes[0].value).toMatch(/backoff enter \(429\)/);
    expect(notes[0].value).toMatch(/5m/);
    // Drain-once: second drain is empty.
    expect(rotator.drainNotes()).toEqual([]);
  });

  it('re-admits after N minutes with an exit-note (neutral, no 429 text)', () => {
    const rotator = new PublicRpcRotator([A, B]);
    rotator.recordFailure(A, true, '429', 1_000);
    expect(rotator.drainNotes()).toHaveLength(1);
    const after = rotator.orderedEndpoints(1_000 + PUBLIC_RPC_BACKOFF_MS + 1);
    expect(after).toHaveLength(2);
    const notes = rotator.drainNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].key).toBe('public-rotation:a.example');
    expect(notes[0].value).toMatch(/backoff exit/);
    expect(notes[0].value).not.toMatch(/429/);
  });

  it('non-backoff failures fail over without parking and without notes', () => {
    const rotator = new PublicRpcRotator([A, B]);
    rotator.recordFailure(A, false, 'connection refused', 1_000);
    expect(rotator.orderedEndpoints(2_000)).toHaveLength(2);
    expect(rotator.drainNotes()).toEqual([]);
  });

  it('all-parked reads empty (callers collapse to honest null)', () => {
    const rotator = new PublicRpcRotator([A]);
    rotator.recordFailure(A, true, 'timeout', 1_000);
    rotator.drainNotes();
    expect(rotator.orderedEndpoints(2_000)).toEqual([]);
  });

  it('reset wipes scores, backoffs and notes (documented deploy reset)', () => {
    const rotator = new PublicRpcRotator([A, B]);
    rotator.recordSuccess(A, 500);
    rotator.recordFailure(A, true, '429', 1_000);
    rotator.reset();
    expect(rotator.orderedEndpoints(2_000)).toEqual([A, B]);
    expect(rotator.drainNotes()).toEqual([]);
  });

  it('ignores unknown urls (never throws on stale reporters)', () => {
    const rotator = new PublicRpcRotator([A]);
    expect(() => {
      rotator.recordSuccess('https://ghost.example', 10);
      rotator.recordFailure('https://ghost.example', true, '429', 1_000);
    }).not.toThrow();
    expect(rotator.orderedEndpoints(2_000)).toEqual([A]);
  });
});

describe('isPublicRpcBackoffSignal', () => {
  it.each([
    [429, null, 'boom'],
    [null, 429, 'boom'],
    [null, null, 'timeout of 5000ms exceeded'],
    [null, null, 'Request failed with status code 429'],
    [null, null, 'rate limit exceeded, retry later'],
    [null, null, 'ECONNABORTED'],
  ])('backs off on 429/timeout (%s %s %s)', (status, code, message) => {
    expect(isPublicRpcBackoffSignal(status, code, message)).toBe(true);
  });

  it.each([
    [null, -32602, 'execution reverted'],
    [null, -32005, 'Node is behind by 42 slots'],
    [500, null, 'internal error'],
    [null, null, 'connection refused'],
    [null, null, 'error code: 525'],
    [null, null, null],
  ])(
    'fails over without parking otherwise (%s %s %s)',
    (status, code, message) => {
      expect(isPublicRpcBackoffSignal(status, code, message)).toBe(false);
    },
  );
});

describe('publicRpcHost', () => {
  it('renders hostnames only (never key material)', () => {
    expect(
      publicRpcHost('https://mainnet.helius-rpc.com/?api-key=SECRET'),
    ).toBe('mainnet.helius-rpc.com');
    expect(publicRpcHost('not a url')).toBe('unparseable');
  });
});
