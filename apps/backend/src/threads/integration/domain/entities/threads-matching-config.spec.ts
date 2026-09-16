import { ThreadsMatchingConfig } from './threads-matching-config.entity';

describe('ThreadsMatchingConfig single-row seed', () => {
  it('loads id=1 defaulting to disabled (fail-closed)', () => {
    const cfg = ThreadsMatchingConfig.load({});
    expect(cfg.id).toBe(1);
    expect(cfg.enabled).toBe(false);
    expect(cfg.updatedAt).toBeInstanceOf(Date);
  });

  it('updates to the seeded enabled shape', () => {
    const cfg = ThreadsMatchingConfig.load({});
    cfg.update({ enabled: true });
    expect(cfg.enabled).toBe(true);
  });

  it('reconstitutes the seed row without validation', () => {
    const at = new Date('2026-09-01T00:00:00Z');
    const cfg = ThreadsMatchingConfig.reconstitute({
      id: 1,
      enabled: true,
      updatedAt: at,
    });
    expect(cfg.id).toBe(1);
    expect(cfg.enabled).toBe(true);
    expect(cfg.updatedAt).toEqual(at);
  });
});
