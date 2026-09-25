import { IngestionHealthIndicator } from './ingestion-health.indicator';

describe('IngestionHealthIndicator', () => {
  it('reports the ingestion component as up (P21 hook point)', () => {
    expect(new IngestionHealthIndicator().check()).toEqual({
      component: 'ingestion',
      status: 'up',
    });
  });
});
