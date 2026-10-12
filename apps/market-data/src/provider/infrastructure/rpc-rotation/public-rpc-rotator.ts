/**
 * Public-RPC rotation primitive (dexter plan todo 42 — gratis para siempre).
 *
 * ONE entry per stack (EVM `rpcCallForChain` public leg, Solana
 * `buildRpcUrls` public leg) becomes a round-robin list of VERIFIED-live
 * endpoints (verified 2026-10-12, table in market-data AGENTS.md —
 * never from memory). Keyed tiers are untouched in order; the public
 * list sits AFTER keyed, BEFORE honest null.
 *
 * Policy (all pinned, no env surface):
 * - Round-robin: a per-instance cursor advances once per call; each
 *   call starts at `cursor % healthy.length` over the score-sorted
 *   healthy list, so consecutive calls start on different endpoints.
 * - Latency-score decay: per-endpoint EMA of success latency
 *   (`SCORE_ALPHA = 0.3`); on every read all scores relax toward the
 *   best score by `SCORE_DECAY = 0.1`, so a once-slow endpoint is
 *   re-tried instead of penalized forever. Unknown endpoints score 0
 *   (tried early, config order breaks ties).
 * - Backoff: a 429/timeout-class failure parks the endpoint for
 *   `PUBLIC_RPC_BACKOFF_MINUTES = 5` (N pinned — public tiers are
 *   40req/10s-class walls; siblings serve meanwhile). Any other
 *   failure just fails over to the next endpoint THIS call, no park.
 *   Re-admit is lazy on the next read (no timers, no cron).
 *
 * State is in-memory with DOCUMENTED reset: a deploy wipes scores +
 * backoffs (same rule as the breaker/governor memory stores — accepted,
 * not hidden). `reset()` exists for specs.
 *
 * Observability rides the EXISTING seams (no new metrics, no parallel
 * control loop): success logs `served-by=public:<host>` at the call
 * site; backoff enter/exit queue providerErrors-shaped notes
 * (`public-rotation:<host>`) drained via `drainNotes()` and merged
 * into snapshot `providerErrors` by the snapshot service. Enter-notes
 * carry the 429 signature so the governor counts them as pressure
 * (same channel it already reads); exit-notes are neutral. The
 * breaker is unaffected (it observes fetcher throws, not RPC tiers).
 *
 * QPS MATH (behavior change accounted): a call that reaches the public
 * leg issues at most ONE attempt per listed endpoint (bounded fan-out
 * ≤ list length — 3 most chains, 2 polygon, 1 robinhood; Solana 3) and
 * stops at the first success. Worst case per scan therefore grows from
 * 1 to ≤3 public attempts, ONLY when siblings are down; the healthy
 * path still costs exactly 1 attempt. No unbounded retry exists here
 * (retry caps stay in the fetcher wrapper, todo 19b2).
 */

export interface PublicRotationNote {
  readonly key: string;
  readonly value: string;
}

/** Backoff length in minutes (N pinned — see module doc). */
export const PUBLIC_RPC_BACKOFF_MINUTES = 5;

export const PUBLIC_RPC_BACKOFF_MS = PUBLIC_RPC_BACKOFF_MINUTES * 60_000;

/** EMA weight of each new success-latency sample. */
export const PUBLIC_RPC_SCORE_ALPHA = 0.3;

/** Per-read relaxation of every score toward the best score. */
export const PUBLIC_RPC_SCORE_DECAY = 0.1;

/**
 * Hostname-only rendering for logs/notes (public URLs carry no keys,
 * but the helper stays total — unparseable input renders a token).
 */
export function publicRpcHost(url: string): string {
  try {
    return new URL(url).hostname || 'unparseable';
  } catch {
    return 'unparseable';
  }
}

/**
 * 429/timeout classifier shared by both stacks (caller decides with
 * its own error shape, then reports `backoff: true/false`).
 *
 * True on HTTP 429, JSON-RPC 429 codes, or timeout/rate-limit text.
 * A plain 5xx/Cloudflare-525/refused is NOT a backoff signal — the
 * call fails over to the sibling this round without parking (the next
 * round-robin turn re-probes it).
 */
export function isPublicRpcBackoffSignal(
  status: number | null | undefined,
  code: number | string | null | undefined,
  message: string | null | undefined,
): boolean {
  if (status === 429 || code === 429) return true;
  if (typeof message === 'string' && message.length > 0) {
    return /429|timeout|timed out|ECONNABORTED|too many requests|rate.?limit/i.test(
      message,
    );
  }
  return false;
}

/**
 * Audit reason for a parked endpoint (feeds the enter-note text).
 * 429-flavored reasons keep the `429` token so the governor counts
 * the enter-note as pressure through its existing scan; timeouts
 * stay neutral (latency, not quota — same class as `tail:*`).
 */
export function publicRpcBackoffReason(
  status: number | null | undefined,
  code: number | string | null | undefined,
  message: string | null | undefined,
): string {
  if (status === 429 || code === 429) return '429';
  if (
    typeof message === 'string' &&
    /timeout|timed out|ECONNABORTED/i.test(message)
  ) {
    return 'timeout';
  }
  if (code !== null && code !== undefined) return `rpc-error-${String(code)}`;
  if (status !== null && status !== undefined) return `http-${String(status)}`;
  return 'transport';
}

export class PublicRpcRotator {
  private readonly endpoints: ReadonlyArray<string>;
  private readonly scores = new Map<string, number>();
  private readonly backoffUntil = new Map<string, number>();
  private readonly notes: PublicRotationNote[] = [];
  private cursor = 0;

  public constructor(endpoints: ReadonlyArray<string>) {
    this.endpoints = [...endpoints];
  }

  /** Endpoints eligible NOW, score-ordered then rotated by the cursor. */
  public orderedEndpoints(now: number = Date.now()): ReadonlyArray<string> {
    this.readBackoffs(now);
    this.decayScores();
    const healthy = this.endpoints.filter(
      (url) => (this.backoffUntil.get(url) ?? 0) <= now,
    );
    const ranked = healthy
      .map((url, index) => ({
        url,
        score: this.scores.get(url) ?? 0,
        index,
      }))
      .sort((a, b) => a.score - b.score || a.index - b.index)
      .map((entry) => entry.url);
    if (ranked.length === 0) return [];
    const start = this.cursor % ranked.length;
    this.cursor += 1;
    return [...ranked.slice(start), ...ranked.slice(0, start)];
  }

  public recordSuccess(url: string, latencyMs: number): void {
    if (!this.endpoints.includes(url)) return;
    const sample = Number.isFinite(latencyMs) && latencyMs >= 0 ? latencyMs : 0;
    const prev = this.scores.get(url) ?? 0;
    this.scores.set(
      url,
      PUBLIC_RPC_SCORE_ALPHA * sample + (1 - PUBLIC_RPC_SCORE_ALPHA) * prev,
    );
  }

  /**
   * Report one public-endpoint attempt outcome. `backoff: true` parks
   * the endpoint for N minutes with an enter-note; `false` only fails
   * over (no note, no park).
   */
  public recordFailure(
    url: string,
    backoff: boolean,
    reason: string,
    now: number = Date.now(),
  ): void {
    if (!backoff || !this.endpoints.includes(url)) return;
    if ((this.backoffUntil.get(url) ?? 0) > now) return;
    this.backoffUntil.set(url, now + PUBLIC_RPC_BACKOFF_MS);
    this.notes.push({
      key: `public-rotation:${publicRpcHost(url)}`,
      value:
        `backoff enter (${reason}) — skipped for ` +
        `${PUBLIC_RPC_BACKOFF_MINUTES}m, traffic on siblings; re-admit automatic`,
    });
  }

  /** Drain-once audit queue (enter/exit notes, providerErrors-shaped). */
  public drainNotes(): ReadonlyArray<PublicRotationNote> {
    return this.notes.splice(0, this.notes.length);
  }

  /** Documented reset (deploys wipe by construction; specs call this). */
  public reset(): void {
    this.scores.clear();
    this.backoffUntil.clear();
    this.notes.length = 0;
    this.cursor = 0;
  }

  private readBackoffs(now: number): void {
    for (const url of this.endpoints) {
      const until = this.backoffUntil.get(url) ?? 0;
      if (until !== 0 && until <= now) {
        this.backoffUntil.delete(url);
        this.notes.push({
          key: `public-rotation:${publicRpcHost(url)}`,
          value: `backoff exit — re-admitted after ${PUBLIC_RPC_BACKOFF_MINUTES}m cool-off`,
        });
      }
    }
  }

  private decayScores(): void {
    if (this.scores.size === 0) return;
    let best = Number.POSITIVE_INFINITY;
    for (const score of this.scores.values()) {
      if (score < best) best = score;
    }
    if (!Number.isFinite(best)) return;
    for (const [url, score] of this.scores) {
      this.scores.set(url, score - (score - best) * PUBLIC_RPC_SCORE_DECAY);
    }
  }
}
