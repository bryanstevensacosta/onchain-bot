import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('counts and gauges', () => {
    const metrics = new MetricsService();
    metrics.inc('published_total');
    metrics.inc('published_total', 2);
    metrics.setGauge('queue_depth', 7);
    expect(metrics.getCounter('published_total')).toBe(3);
    expect(metrics.getGauge('queue_depth')).toBe(7);
    expect(metrics.getCounter('missing')).toBe(0);
    expect(metrics.snapshot()).toEqual({
      published_total: 3,
      queue_depth: 7,
    });
  });
});
