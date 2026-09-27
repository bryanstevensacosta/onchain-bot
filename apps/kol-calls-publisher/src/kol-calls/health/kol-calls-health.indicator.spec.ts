import { Injectable } from '@nestjs/common';
import { KolCallsHealthIndicator } from './kol-calls-health.indicator';

describe('KolCallsHealthIndicator', () => {
  it('reports kol-calls up with contract detail', () => {
    const status = new KolCallsHealthIndicator().check();
    expect(status.component).toBe('kol-calls');
    expect(status.status).toBe('up');
    expect(status.detail).toContain('mentions');
  });
});
