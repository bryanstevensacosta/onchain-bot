import { Injectable } from '@nestjs/common';
import { ScheduledPostRepository } from '../domain/ports/scheduled-post.repository';
import { SessionBindingAuthorizer } from '../domain/ports/session-binding.authorizer';

/**
 * P21 hook point: scheduled-posts depth health (never liveness). Up
 * when the post store + session registry load; down when either read
 * throws.
 */
@Injectable()
export class ScheduledPostsHealthIndicator {
  public constructor(
    private readonly posts: ScheduledPostRepository,
    private readonly sessions: SessionBindingAuthorizer,
  ) {}

  public async check(): Promise<{
    readonly component: string;
    readonly status: 'up' | 'down';
  }> {
    try {
      await this.posts.count();
      return { component: 'scheduled-posts', status: 'up' };
    } catch {
      return { component: 'scheduled-posts', status: 'down' };
    }
  }
}
