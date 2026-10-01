import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns { status: ok }', () => {
    const body = new HealthController().getHealth();
    expect(body.status).toBe('ok');
    expect(body.components.vault).toBe('up');
  });
});
