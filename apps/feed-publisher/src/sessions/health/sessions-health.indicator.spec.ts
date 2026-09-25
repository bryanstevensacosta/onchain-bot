import { SessionsHealthIndicator } from './sessions-health.indicator';
import { InMemoryPublishingSessionRepository } from '../infrastructure/repositories/in-memory-publishing-session.repository';

describe('SessionsHealthIndicator', () => {
  it('reports up', () => {
    const indicator = new SessionsHealthIndicator(
      new InMemoryPublishingSessionRepository(),
    );
    expect(indicator.check()).toEqual({ component: 'sessions', status: 'up' });
  });
});
