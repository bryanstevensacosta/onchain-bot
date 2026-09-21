import { registerAs } from '@nestjs/config';

/**
 * Defaults for the SSE stream timing knobs.
 *
 * These match the previously hardcoded behavior exactly:
 * - heartbeat every 30s (was a fixed every-30-seconds cron job in StreamService)
 * - backend reconnect backoff 1s initial, 30s max (was hardcoded in the
 *   backend `TelegramSseListenerAdapter`)
 */
export const DEFAULT_SSE_HEARTBEAT_INTERVAL_MS = 30_000;
export const DEFAULT_SSE_RECONNECT_INITIAL_DELAY_MS = 1_000;
export const DEFAULT_SSE_RECONNECT_MAX_DELAY_MS = 30_000;

/** Valid range for the SSE heartbeat interval. */
export const SSE_HEARTBEAT_MIN_MS = 5_000;
export const SSE_HEARTBEAT_MAX_MS = 300_000;

/** Valid range for the reconnect initial delay. */
export const SSE_RECONNECT_INITIAL_MIN_MS = 100;
export const SSE_RECONNECT_INITIAL_MAX_MS = 30_000;

export interface StreamConfig {
  heartbeatIntervalMs: number;
  reconnectInitialDelayMs: number;
  reconnectMaxDelayMs: number;
}

function parseMs(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * SSE stream timing configuration (`registerAs('stream')`).
 *
 * Environment variables consumed here:
 * - `SSE_HEARTBEAT_INTERVAL_MS` (default 30000, valid 5000-300000)
 * - `SSE_RECONNECT_INITIAL_DELAY_MS` (default 1000, valid 100-30000)
 * - `SSE_RECONNECT_MAX_DELAY_MS` (default 30000, clamped to >= initial)
 *
 * Fail-soft contract (same as `shared/common/config/app.config.ts`):
 * missing or out-of-range values fall back to the defaults above instead
 * of throwing, so a bad envvar can never break the SSE stream at boot.
 */
export const streamConfig = registerAs('stream', (): StreamConfig => {
  const heartbeatRaw = parseMs(
    process.env.SSE_HEARTBEAT_INTERVAL_MS,
    DEFAULT_SSE_HEARTBEAT_INTERVAL_MS,
  );
  const heartbeatIntervalMs =
    heartbeatRaw >= SSE_HEARTBEAT_MIN_MS && heartbeatRaw <= SSE_HEARTBEAT_MAX_MS
      ? Math.floor(heartbeatRaw)
      : DEFAULT_SSE_HEARTBEAT_INTERVAL_MS;

  const initialRaw = parseMs(
    process.env.SSE_RECONNECT_INITIAL_DELAY_MS,
    DEFAULT_SSE_RECONNECT_INITIAL_DELAY_MS,
  );
  const reconnectInitialDelayMs =
    initialRaw >= SSE_RECONNECT_INITIAL_MIN_MS &&
    initialRaw <= SSE_RECONNECT_INITIAL_MAX_MS
      ? Math.floor(initialRaw)
      : DEFAULT_SSE_RECONNECT_INITIAL_DELAY_MS;

  const maxRaw = parseMs(
    process.env.SSE_RECONNECT_MAX_DELAY_MS,
    DEFAULT_SSE_RECONNECT_MAX_DELAY_MS,
  );
  // Max must be at least the initial delay; clamp up instead of resetting
  // so a tuned initial delay keeps a sane ceiling.
  const reconnectMaxDelayMs = Number.isFinite(maxRaw)
    ? Math.max(Math.floor(maxRaw), reconnectInitialDelayMs)
    : DEFAULT_SSE_RECONNECT_MAX_DELAY_MS;

  return {
    heartbeatIntervalMs,
    reconnectInitialDelayMs,
    reconnectMaxDelayMs,
  };
});

export type StreamConfigType = ReturnType<typeof streamConfig>;
