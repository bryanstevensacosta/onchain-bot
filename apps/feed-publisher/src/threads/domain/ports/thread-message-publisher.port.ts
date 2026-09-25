export type ThreadMessagePublishOutcome =
  | { readonly outcome: 'ok'; readonly remoteId: string | null }
  | { readonly outcome: 'transient'; readonly reason: string }
  | { readonly outcome: 'critical'; readonly reason: string };

export interface ThreadMessagePublishInput {
  readonly threadId: string;
  readonly index: number;
  readonly content: string;
}

/**
 * Per-message publish transport (v1 skeleton).
 *
 * The LIVE binding is the in-memory recorder (todo 7 binds the real
 * Threads Bot API adapter here without touching the use-case). Outcome
 * kinds drive the failure matrix: `ok` advances, `transient`
 * (rate limit) holds IN_PROGRESS/PARTIAL with backoff, `critical`
 * (bad token/config) fails the thread terminally.
 */
export abstract class ThreadMessagePublisherPort {
  public abstract publish(
    input: ThreadMessagePublishInput,
  ): Promise<ThreadMessagePublishOutcome>;
}
