import { Injectable } from '@nestjs/common';
import { PublishingSessionRepository } from '../domain/ports/publishing-session.repository';

/**
 * P21 hook point: sessions health indicator.
 */
@Injectable()
export class SessionsHealthIndicator {
  public constructor(private readonly sessions: PublishingSessionRepository) {}

  public check(): {
    readonly component: string;
    readonly status: 'up' | 'down';
  } {
    void this.sessions;
    return { component: 'sessions', status: 'up' };
  }
}
