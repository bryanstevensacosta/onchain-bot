import { HealthController } from './api/http/health.controller';

describe('HealthController (kol-calls-publisher)', () => {
  it('returns ok with kol-calls + scoring + templates + approval + publishing components', () => {
    const controller = new HealthController();
    const health = controller.getHealth();
    expect(health.status).toBe('ok');
    expect(health.components['kol-calls'].status).toBe('up');
    expect(health.components['database'].status).toBe('up');
    expect(health.components['scoring'].status).toBe('up');
    expect(health.components['templates'].status).toBe('up');
    expect(health.components['approval'].status).toBe('up');
    expect(health.components['publishing'].status).toBe('up');
    expect(health.components['target'].status).toBe('up');
  });
});
