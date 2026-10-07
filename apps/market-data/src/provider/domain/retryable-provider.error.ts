/**
 * Retryable provider error (dexter plan todo 19b2).
 *
 * Adapter catch blocks translate the axios-shaped failure into EITHER
 * `null` (absence — 404, no-data, keyless-skip, anything unclassified:
 * NEVER retried) OR this typed error (transient — timeout,
 * 429-with-`Retry-After`, 5xx: retried EXACTLY ONCE by the per-fetcher
 * wrapper). Duck-typed on purpose: the domain stays axios-free (no
 * `axios.isAxiosError` import here — adapters already depend on axios,
 * the domain does not).
 *
 * Live shape (evidence `.omo/evidence/task-fe-retry.log`, 2026-10-07):
 * GeckoTerminal answers excess with HTTP 429 + `retry-after: 0` +
 * JSON `{"status":{"error_code":429,…}}`. Our outbound budget
 * (60/min) does NOT mirror their real throttle (~5/burst), so this
 * signal is the only thing standing between a 429 and a null shell.
 */
export type RetryableFailureKind = 'timeout' | 'rate-limited' | 'server';

export class RetryableProviderError extends Error {
  public readonly provider: string;
  public readonly kind: RetryableFailureKind;
  /** HTTP status when the failure came with a response (undefined on timeout). */
  public readonly status: number | undefined;
  /**
   * Parsed `Retry-After` in ms (0 when the header is absent — timeouts
   * and headerless 5xx carry no wait instruction; the wrapper caps and
   * jitters on top). Only set from a PRESENT + PARSEABLE header; a
   * 429 without one is NOT retryable (see classifier below).
   */
  public readonly retryAfterMs: number;

  public constructor(
    provider: string,
    kind: RetryableFailureKind,
    retryAfterMs: number,
    status?: number,
  ) {
    super(
      `${provider} transient ${kind}${status !== undefined ? ` (http ${status})` : ''} — single retry with cap`,
    );
    this.name = 'RetryableProviderError';
    this.provider = provider;
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
    this.status = status;
  }
}

interface AxiosShapedError {
  readonly code?: unknown;
  readonly response?: {
    readonly status?: unknown;
    readonly headers?: unknown;
  } | null;
}

/**
 * Parse a `Retry-After` header value to ms. Accepts delay-seconds
 * (`"0"`, `"120"` — the ingestion guard emits exactly this shape,
 * `rate-limit.guard.ts:236-237`) or an HTTP-date. Returns `null`
 * when absent, unparseable, or negative (callers treat that as "no
 * wait instruction", NOT as zero — the distinction matters for 429).
 */
export function parseRetryAfterMs(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    return value * 1000;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const asSeconds = Number(trimmed);
  if (Number.isFinite(asSeconds)) {
    if (asSeconds < 0) return null;
    return asSeconds * 1000;
  }
  const asDate = Date.parse(trimmed);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, asDate - Date.now());
  }
  return null;
}

function readRetryAfterMs(headers: unknown): number | null {
  if (headers === null || typeof headers !== 'object') return null;
  const bag = headers as Record<string, unknown>;
  // Axios lowercases response header names; tolerate both cases.
  const raw = bag['retry-after'] ?? bag['Retry-After'] ?? bag['RETRY-AFTER'];
  return parseRetryAfterMs(raw);
}

function isTimeoutCode(code: unknown): boolean {
  return code === 'ECONNABORTED' || code === 'ETIMEDOUT';
}

/**
 * Classify an adapter failure. Returns a `RetryableProviderError`
 * for EXACTLY three classes (plan todo 19b2 — closed list):
 *
 * - timeout (`ECONNABORTED` axios-timeout / `ETIMEDOUT`), no response —
 *   `retryAfterMs: 0` (nothing to parse; the 8s adapter timeout
 *   already spaces the attempts);
 * - 429 WITH a present + parseable `Retry-After` header (live:
 *   GeckoTerminal sends `retry-after: 0`). A 429 WITHOUT the header
 *   returns `null` — never hammer a server that did not tell us when
 *   to come back;
 * - 5xx (500–599), header parsed when present, else 0.
 *
 * EVERYTHING else returns `null` (→ adapter `null` → never retried):
 * 404, 400/401/403, headerless/garbled 429, network errors without a
 * timeout code, non-axios throws (ccxt lib errors, outbound-deny from
 * the gate, programming errors — the wrapper rethrows those
 * untouched so the deny signal and fail-open messages survive).
 */
export function toRetryableProviderError(
  err: unknown,
  provider: string,
): RetryableProviderError | null {
  if (err === null || typeof err !== 'object') return null;
  const shaped = err as AxiosShapedError;
  const response = shaped.response ?? null;
  if (response === null || typeof response !== 'object') {
    if (isTimeoutCode(shaped.code)) {
      return new RetryableProviderError(provider, 'timeout', 0);
    }
    return null;
  }
  const status = response.status;
  if (typeof status !== 'number') {
    if (isTimeoutCode(shaped.code)) {
      return new RetryableProviderError(provider, 'timeout', 0);
    }
    return null;
  }
  if (status === 429) {
    const retryAfterMs = readRetryAfterMs(response.headers);
    if (retryAfterMs === null) return null;
    return new RetryableProviderError(
      provider,
      'rate-limited',
      retryAfterMs,
      status,
    );
  }
  if (status >= 500 && status <= 599) {
    return new RetryableProviderError(
      provider,
      'server',
      readRetryAfterMs(response.headers) ?? 0,
      status,
    );
  }
  return null;
}

/**
 * Adapter catch-block one-liner: throws the typed error when the
 * failure is retryable, otherwise returns (caller logs + `null`).
 * 404 is checked by the CALLER first (stays `null`, never reaches
 * this function — belt + suspenders, the classifier returns `null`
 * for 404 anyway).
 */
export function throwIfRetryableProviderError(
  err: unknown,
  provider: string,
): void {
  const retryable = toRetryableProviderError(err, provider);
  if (retryable !== null) {
    throw retryable;
  }
}
