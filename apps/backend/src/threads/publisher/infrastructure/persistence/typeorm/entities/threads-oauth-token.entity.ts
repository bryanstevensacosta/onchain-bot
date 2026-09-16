import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `ThreadsOAuthToken`.
 *
 * Table: `threads_oauth_tokens` — singleton row (always `id = 1`)
 * holding the long-lived Threads Graph API user access token, the
 * Threads user id it belongs to, and its lifetime metadata. Written
 * ONLY by the token refresher (T3); never seeded, never logged.
 *
 * NOTE: this is NOT the domain aggregate. The domain entity lives at
 * `threads/publisher/domain/entities/threads-oauth-token.entity.ts`.
 */
@Entity({ name: 'threads_oauth_tokens' })
export class ThreadsOAuthTokenEntity {
  /**
   * Always 1 (singleton). Hard-coded because the refresher and the
   * repo must read/write the same row — there is exactly one
   * Threads account per backend.
   */
  @PrimaryColumn({ name: 'id', type: 'integer' })
  public id!: number;

  @Column({ name: 'access_token', type: 'text' })
  public accessToken!: string;

  @Column({ name: 'threads_user_id', type: 'varchar', length: 64 })
  public threadsUserId!: string;

  @CreateDateColumn({ name: 'obtained_at', type: 'timestamptz' })
  public obtainedAt!: Date;

  @Column({ name: 'expires_in_s', type: 'integer' })
  public expiresInS!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}
