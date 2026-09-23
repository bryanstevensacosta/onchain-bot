import {
  DEFAULT_SSE_HEARTBEAT_INTERVAL_MS,
  DEFAULT_SSE_RECONNECT_INITIAL_DELAY_MS,
  DEFAULT_SSE_RECONNECT_MAX_DELAY_MS,
  streamConfig,
} from './stream.config';

describe('streamConfig', () => {
  const ENV_KEYS = [
    'SSE_HEARTBEAT_INTERVAL_MS',
    'SSE_RECONNECT_INITIAL_DELAY_MS',
    'SSE_RECONNECT_MAX_DELAY_MS',
  ] as const;

  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  it('uses 30000/1000/30000 when no env vars are set', () => {
    const cfg = streamConfig();

    expect(cfg.heartbeatIntervalMs).toBe(DEFAULT_SSE_HEARTBEAT_INTERVAL_MS);
    expect(cfg.heartbeatIntervalMs).toBe(30_000);
    expect(cfg.reconnectInitialDelayMs).toBe(
      DEFAULT_SSE_RECONNECT_INITIAL_DELAY_MS,
    );
    expect(cfg.reconnectInitialDelayMs).toBe(1_000);
    expect(cfg.reconnectMaxDelayMs).toBe(DEFAULT_SSE_RECONNECT_MAX_DELAY_MS);
    expect(cfg.reconnectMaxDelayMs).toBe(30_000);
  });

  it('honors valid custom values', () => {
    process.env.SSE_HEARTBEAT_INTERVAL_MS = '60000';
    process.env.SSE_RECONNECT_INITIAL_DELAY_MS = '2000';
    process.env.SSE_RECONNECT_MAX_DELAY_MS = '45000';

    const cfg = streamConfig();

    expect(cfg.heartbeatIntervalMs).toBe(60_000);
    expect(cfg.reconnectInitialDelayMs).toBe(2_000);
    expect(cfg.reconnectMaxDelayMs).toBe(45_000);
  });

  it('falls back to defaults on out-of-range values', () => {
    // Heartbeat 0 is below the 5s minimum; initial 50 is below 100ms.
    process.env.SSE_HEARTBEAT_INTERVAL_MS = '0';
    process.env.SSE_RECONNECT_INITIAL_DELAY_MS = '50';

    const cfg = streamConfig();

    expect(cfg.heartbeatIntervalMs).toBe(30_000);
    expect(cfg.reconnectInitialDelayMs).toBe(1_000);
  });

  it('falls back to defaults on unparsable values', () => {
    process.env.SSE_HEARTBEAT_INTERVAL_MS = 'not-a-number';
    process.env.SSE_RECONNECT_MAX_DELAY_MS = '';

    const cfg = streamConfig();

    expect(cfg.heartbeatIntervalMs).toBe(30_000);
    // Empty max falls back to the default, which still satisfies max >= init.
    expect(cfg.reconnectMaxDelayMs).toBe(30_000);
  });

  it('clamps max up to init when max is lower than init', () => {
    process.env.SSE_RECONNECT_INITIAL_DELAY_MS = '5000';
    process.env.SSE_RECONNECT_MAX_DELAY_MS = '1000';

    const cfg = streamConfig();

    expect(cfg.reconnectInitialDelayMs).toBe(5_000);
    expect(cfg.reconnectMaxDelayMs).toBe(5_000);
  });

  it('rejects a heartbeat above the 5-minute maximum', () => {
    process.env.SSE_HEARTBEAT_INTERVAL_MS = '600000';

    const cfg = streamConfig();

    expect(cfg.heartbeatIntervalMs).toBe(30_000);
  });
});
