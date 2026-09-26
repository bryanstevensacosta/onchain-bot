import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ScheduledPost } from '../../domain/scheduled-post.entity';
import { ScheduledPostRepository } from '../../domain/ports/scheduled-post.repository';
import { ScheduleResultCallbackPort } from '../../domain/ports/schedule-result-callback.port';

/**
 * Session-initiated cancel (contract §3: `DELETE /scheduled/:id` by
 * the owning session only; cancel of a fired post → 409 terminal;
 * the scheduler never auto-cancels). Emits the terminal callback.
 */
@Injectable()
export class CancelScheduledPostUseCase {
  public constructor(
    private readonly posts: ScheduledPostRepository,
    private readonly callbacks: ScheduleResultCallbackPort,
  ) {}

  public async execute(postId: string, sessionId: string, reason = 'cancelled'): Promise<ScheduledPost> {
    const post = await this.posts.findById(postId);
    if (!post) {
      throw new DomainError(ErrorCode.NOT_FOUND, `unknown scheduled post ${postId}`);
    }
    const cancelled = post.cancel(sessionId, reason);
    const saved = await this.posts.save(cancelled);
    try {
      await this.callbacks.emit({
        scheduledPostId: post.id,
        sessionId: post.sessionId,
        bindingId: post.binding.bindingId,
        target: post.binding.target,
        state: 'cancelled',
        messageId: null,
        firedAt: null,
        reason,
        idempotencyKey: post.idempotencyKey,
      });
    } catch {
      return saved;
    }
    return saved;
  }
}
