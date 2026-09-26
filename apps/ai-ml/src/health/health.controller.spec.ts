import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns { status: ok }', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok' });
  });
});
