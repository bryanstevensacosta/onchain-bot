import type { TargetBindingRef } from '../schedule-request';

/** A session-owned, verified target binding (contract P38-bis). */
export interface VerifiedBinding {
  readonly bindingId: string;
  readonly target: TargetBindingRef['target'];
  readonly botId: string;
  /** Verified channel: schedule AND fire paths require chatId === defaultChatId. */
  readonly defaultChatId: string;
  readonly botVerified: boolean;
  readonly publishDelayMs: number;
  readonly dailyCap: number;
}

export interface SessionRecord {
  readonly sessionId: string;
  readonly active: boolean;
  readonly bindings: VerifiedBinding[];
}

/**
 * Session/binding ownership (contract P50: the authorizer triple —
 * session-owned binding + same-target verified bot + verified
 * channel — runs on schedule AND fire paths, same 403 shape).
 *
 * v1 is in-memory, seeded from `SCHEDULING_SESSION_BINDINGS` JSON at
 * boot (plus `seed()` for tests/ops). The HTTP session lookup against
 * feed-publisher sessions is the cutover follow-up (todo 3).
 */
export abstract class SessionBindingAuthorizer {
  public abstract findSession(sessionId: string): Promise<SessionRecord | null>;
  public abstract seed(session: SessionRecord): Promise<void>;
}
