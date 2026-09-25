import { MatchingConfig } from './matching-config.entity';
import { toMatchingConfigView } from '../application/mappers/matching-config.mapper';
import { InMemoryMatchingConfigRepository } from '../infrastructure/persistence/in-memory/in-memory-matching-config.repository';

describe('MatchingConfig', () => {
  it('seeds disabled by default (fail-closed)', () => {
    const cfg = MatchingConfig.load({});
    expect(cfg.id).toBe(1);
    expect(cfg.enabled).toBe(false);
  });

  it('updates the enabled flag and bumps updatedAt', () => {
    const cfg = MatchingConfig.load({ enabled: false });
    const before = cfg.updatedAt;
    cfg.update({ enabled: true });
    expect(cfg.enabled).toBe(true);
    expect(cfg.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('maps to the frozen controller view', () => {
    const view = toMatchingConfigView(
      MatchingConfig.reconstitute({
        id: 1,
        enabled: true,
        updatedAt: new Date('2026-09-25T00:00:00.000Z'),
      }),
    );
    expect(view).toEqual({
      id: 1,
      enabled: true,
      updatedAt: '2026-09-25T00:00:00.000Z',
    });
  });

  it('in-memory repository seeds on first load and persists updates', async () => {
    const repo = new InMemoryMatchingConfigRepository();
    const first = await repo.load();
    expect(first.enabled).toBe(false);
    first.update({ enabled: true });
    await repo.save(first);
    expect((await repo.load()).enabled).toBe(true);
  });
});
