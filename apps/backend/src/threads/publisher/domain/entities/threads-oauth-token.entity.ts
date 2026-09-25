import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';

export interface ThreadsOAuthTokenProps {
  readonly id: number;
  accessToken: string;
  threadsUserId: string;
  obtainedAt: Date;
  expiresInS: number;
  updatedAt: Date;
}

/** Refresh when fewer than 7 days remain before expiry. */
export const THREADS_TOKEN_REFRESH_THRESHOLD_DAYS = 7;

/**
 * Aggregate root: the single Threads Graph API OAuth token row.
 *
 * Only ONE row exists at any time (`id = 1`). Holds the long-lived
 * (60-day) user access token plus the Threads user id it belongs to.
 * The token refresher use case (T3) upserts this row when fewer than
 * 7 days remain before expiry.
 *
 * Persistence: @Entity({ name: 'threads_oauth_tokens' }) counterpart lives in
 * `threads/publisher/infrastructure/persistence/typeorm/entities/` (this domain
 * file owns invariants only, never the ORM decorator).
 */
export class ThreadsOAuthToken extends AggregateRoot<number> {
  private state: ThreadsOAuthTokenProps;

  protected constructor(id: number, props: ThreadsOAuthTokenProps) {
    super(id);
    this.state = props;
  }

  /**
   * Factory: validate invariants and build a fresh token row.
   * Use `reconstitute()` when loading from persistence.
   */
  public static create(input: {
    id?: number;
    accessToken: string;
    threadsUserId: string;
    obtainedAt?: Date;
    expiresInS: number;
    updatedAt?: Date;
  }): ThreadsOAuthToken {
    const accessToken = ThreadsOAuthToken.requireNonEmpty(
      input.accessToken,
      'accessToken',
    );
    const threadsUserId = ThreadsOAuthToken.requireNonEmpty(
      input.threadsUserId,
      'threadsUserId',
    );
    const expiresInS = ThreadsOAuthToken.requirePositiveExpiresIn(
      input.expiresInS,
    );
    const now = new Date();
    return new ThreadsOAuthToken(input.id ?? 1, {
      id: input.id ?? 1,
      accessToken,
      threadsUserId,
      obtainedAt: input.obtainedAt ?? now,
      expiresInS,
      updatedAt: input.updatedAt ?? now,
    });
  }

  public static reconstitute(input: ThreadsOAuthTokenProps): ThreadsOAuthToken {
    return new ThreadsOAuthToken(input.id, input);
  }

  public get id(): number {
    return this.state.id;
  }

  public get accessToken(): string {
    return this.state.accessToken;
  }

  public get threadsUserId(): string {
    return this.state.threadsUserId;
  }

  public get obtainedAt(): Date {
    return this.state.obtainedAt;
  }

  public get expiresInS(): number {
    return this.state.expiresInS;
  }

  public get updatedAt(): Date {
    return this.state.updatedAt;
  }

  /**
   * Absolute expiry instant derived from obtainedAt + expiresInS.
   */
  public get expiresAt(): Date {
    return new Date(
      this.state.obtainedAt.getTime() + this.state.expiresInS * 1000,
    );
  }

  /**
   * True when the token is expired or will expire within
   * `withinDays` (default 7 — the refresher threshold).
   */
  public isExpiringSoon(
    withinDays: number = THREADS_TOKEN_REFRESH_THRESHOLD_DAYS,
    now: Date = new Date(),
  ): boolean {
    const thresholdMs = withinDays * 24 * 60 * 60 * 1000;
    return this.expiresAt.getTime() - now.getTime() <= thresholdMs;
  }

  /**
   * Apply a token refresh: replace the access token (and optionally
   * the user id / lifetime) and stamp obtainedAt/updatedAt to now.
   */
  public updateFromRefresh(input: {
    accessToken: string;
    threadsUserId?: string;
    expiresInS?: number;
    obtainedAt?: Date;
  }): void {
    this.state.accessToken = ThreadsOAuthToken.requireNonEmpty(
      input.accessToken,
      'accessToken',
    );
    if (input.threadsUserId !== undefined) {
      this.state.threadsUserId = ThreadsOAuthToken.requireNonEmpty(
        input.threadsUserId,
        'threadsUserId',
      );
    }
    if (input.expiresInS !== undefined) {
      this.state.expiresInS = ThreadsOAuthToken.requirePositiveExpiresIn(
        input.expiresInS,
      );
    }
    const now = input.obtainedAt ?? new Date();
    this.state.obtainedAt = now;
    this.state.updatedAt = new Date();
  }

  private static requireNonEmpty(raw: unknown, field: string): string {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `ThreadsOAuthToken.${field} must be a non-empty string`,
        { [field]: raw },
      );
    }
    return raw.trim();
  }

  private static requirePositiveExpiresIn(raw: unknown): number {
    if (!Number.isFinite(raw) || (raw as number) <= 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'ThreadsOAuthToken.expiresInS must be a positive number',
        { expiresInS: raw },
      );
    }
    return raw as number;
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
