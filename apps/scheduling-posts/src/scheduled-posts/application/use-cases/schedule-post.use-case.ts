import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ScheduledPost } from '../../domain/scheduled-post.entity';
import type { ScheduleRequest } from '../../domain/schedule-request';
import { CronDueChecker } from '../../domain/cron-due.checker';
import { ScheduledPostRepository } from '../../domain/ports/scheduled-post.repository';
import { SessionBindingAuthorizer } from '../../domain/ports/session-binding.authorizer';
import { ContentRefResolver } from '../../domain/ports/content-ref.resolver';
import { PublishRateLimiter } from '../../domain/ports/publish-rate-limiter.port';

export interface SchedulePostResult {
  readonly post: ScheduledPost;
  /** false = idempotent replay of the original record (contract: 200, never a second row). */
  readonly created: boolean;
}

/**
 * Contract §2 schedule path (session → scheduler).
 *
 * Order: rate-limit (429 never burns keys) → idempotent replay →
 * session/binding/bot/channel ownership triple → P38-ter active
 * check → schedule-shape validation → content-ref resolution →
 * persist. Rejects 4xx, never silently fixes.
 */
@Injectable()
export class SchedulePostUseCase {
  public constructor(
    private readonly posts: ScheduledPostRepository,
    private readonly sessions: SessionBindingAuthorizer,
    private readonly refs: ContentRefResolver,
    private readonly limiter: PublishRateLimiter,
  ) {}

  public async execute(request: ScheduleRequest): Promise<SchedulePostResult> {
    if (!(await this.limiter.tryAcquire(request.sessionId))) {
      throw new DomainError(
        ErrorCode.RATE_LIMITED,
        `session ${request.sessionId} exceeded the publish rate limit`,
      );
    }
    const replay = await this.posts.findBySessionKey(
      request.sessionId,
      request.idempotencyKey,
    );
    if (replay) {
      return { post: replay, created: false };
    }
    const record = await this.sessions.findSession(request.sessionId);
    if (!record) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `unknown session ${request.sessionId}`,
      );
    }
    if (!record.active) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `SESSION_NOT_ACTIVE: session ${request.sessionId} is closed`,
      );
    }
    const activeBindings = record.bindings.filter((b) => b.botVerified);
    if (activeBindings.length === 0) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `NO_ACTIVE_TARGET: session ${request.sessionId} has zero active verified bindings (dashboard-only mode)`,
      );
    }
    const binding = record.bindings.find(
      (candidate) =>
        candidate.bindingId === request.binding.bindingId &&
        candidate.target === request.binding.target,
    );
    if (!binding || binding.botId !== request.binding.botId) {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        `binding ${request.binding.bindingId} is not owned by session ${request.sessionId}`,
      );
    }
    if (
      !binding.botVerified ||
      binding.defaultChatId !== request.binding.chatId
    ) {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        `bot ${request.binding.botId} is not authorized for session ${request.sessionId}`,
      );
    }
    this.assertScheduleKind(request);
    if (request.content.kind === 'content-ref') {
      const resolved = await this.refs.resolve(request.content.queueEntryId);
      if (!resolved) {
        throw new DomainError(
          ErrorCode.SCHEDULE_INVALID,
          `UNKNOWN_CONTENT_REF: ${request.content.queueEntryId}`,
        );
      }
    }
    const post = ScheduledPost.create({
      sessionId: request.sessionId,
      binding: { ...request.binding },
      content: JSON.parse(JSON.stringify(request.content)) as ScheduleRequest['content'],
      scheduleKind: JSON.parse(JSON.stringify(request.scheduleKind)) as ScheduleRequest['scheduleKind'],
      idempotencyKey: request.idempotencyKey,
    });
    await this.posts.save(post);
    return { post, created: true };
  }

  private assertScheduleKind(request: ScheduleRequest): void {
    const kind = request.scheduleKind;
    if (kind.kind === 'once') {
      const fireAt = new Date(kind.fireAt);
      if (Number.isNaN(fireAt.getTime())) {
        throw new DomainError(
          ErrorCode.SCHEDULE_INVALID,
          `fireAt is not ISO-8601 UTC: ${kind.fireAt}`,
        );
      }
      if (fireAt.getTime() <= Date.now()) {
        throw new DomainError(
          ErrorCode.SCHEDULE_INVALID,
          `fireAt must be > now: ${kind.fireAt}`,
        );
      }
      return;
    }
    if (kind.kind === 'cron') {
      if (kind.timezone !== 'UTC') {
        throw new DomainError(
          ErrorCode.SCHEDULE_INVALID,
          `timezone must be UTC (got ${kind.timezone})`,
        );
      }
      CronDueChecker.assertValid(kind.cronExpr);
      return;
    }
    throw new DomainError(
      ErrorCode.SCHEDULE_INVALID,
      'scheduleKind must be once XOR cron',
    );
  }
}
