import { AdsCronScheduler } from '../ads-cron.scheduler';
import { PublishAdUseCase } from '../../handlers/publish-ad.use-case';
import { AdRepository } from 'telegram/crypto-news-ads/application/ports/ad.repository';
import { AdRotationConfigRepository } from 'telegram/crypto-news-ads/application/ports/ad-rotation-config.repository';
import { AdRotationConfig } from 'telegram/crypto-news-ads/domain/entities/ad-rotation-config.entity';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import { DataSource } from 'typeorm';

describe('AdsCronScheduler', () => {
  const processUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<PublishAdUseCase>;
  const cfgRepo = {
    load: jest.fn(),
  } as unknown as jest.Mocked<AdRotationConfigRepository>;
  const adRepo = {
    findExpired: jest.fn(),
    disable: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<AdRepository>;
  const dataSource = {
    query: jest.fn(),
  } as unknown as jest.Mocked<Pick<DataSource, 'query'>>;

  let scheduler: AdsCronScheduler;

  beforeEach(() => {
    jest.clearAllMocks();
    scheduler = new AdsCronScheduler(
      dataSource as unknown as DataSource,
      processUseCase,
      cfgRepo,
      adRepo,
    );
  });

  function enabledCfg(): AdRotationConfig {
    return AdRotationConfig.empty().update({ enabled: true });
  }

  function expiredAd(id: string, action: 'disable' | 'delete'): Ad {
    return Ad.create({
      id,
      name: `Ad ${id}`,
      body: 'body',
      expiresAt: new Date('2026-01-01T00:00:00Z'),
      expirationAction: action,
    });
  }

  describe('onApplicationBootstrap', () => {
    it('logs ready using AdRotationConfig.enabled (NOT LlmConfig)', async () => {
      cfgRepo.load.mockResolvedValue(
        AdRotationConfig.empty().update({ enabled: false }),
      );
      await scheduler.onApplicationBootstrap();
      expect(cfgRepo.load).toHaveBeenCalled();
    });
  });

  describe('tick', () => {
    it('skips when already running (busy guard)', async () => {
      scheduler['running'] = true;
      await scheduler.tick();
      expect(cfgRepo.load).not.toHaveBeenCalled();
      expect(processUseCase.execute).not.toHaveBeenCalled();
    });

    it('skips when rotation config load throws', async () => {
      cfgRepo.load.mockRejectedValueOnce(new Error('db down'));
      await scheduler.tick();
      expect(dataSource.query).not.toHaveBeenCalled();
      expect(processUseCase.execute).not.toHaveBeenCalled();
    });

    it('sweeps expired ads even when rotation config is disabled, but does NOT publish', async () => {
      cfgRepo.load.mockResolvedValue(AdRotationConfig.empty()); // enabled=false
      dataSource.query.mockResolvedValue([{ acquired: true }]);
      adRepo.findExpired.mockResolvedValue([expiredAd('ad-1', 'disable')]);

      await scheduler.tick();

      expect(adRepo.findExpired).toHaveBeenCalled();
      expect(adRepo.disable).toHaveBeenCalledWith('ad-1');
      expect(processUseCase.execute).not.toHaveBeenCalled();
    });

    it('skips tick when advisory lock was not acquired (no sweep, no publish)', async () => {
      cfgRepo.load.mockResolvedValue(enabledCfg());
      dataSource.query.mockResolvedValue([{ acquired: false }]);
      await scheduler.tick();
      expect(adRepo.findExpired).not.toHaveBeenCalled();
      expect(processUseCase.execute).not.toHaveBeenCalled();
    });

    it('lock not acquired does NOT release (no unlock query for pg_try_advisory_lock false)', async () => {
      cfgRepo.load.mockResolvedValue(enabledCfg());
      dataSource.query.mockResolvedValue([{ acquired: false }]);
      await scheduler.tick();
      const unlock = dataSource.query.mock.calls.filter((c) =>
        String(c[0]).includes('pg_advisory_unlock'),
      );
      expect(unlock).toHaveLength(0);
    });

    it('disables expired ads with action disable, then publishes', async () => {
      cfgRepo.load.mockResolvedValue(enabledCfg());
      dataSource.query
        .mockResolvedValueOnce([{ acquired: true }]) // pg_try_advisory_lock
        .mockResolvedValueOnce([{ acquired: false }]); // pg_advisory_unlock result
      adRepo.findExpired.mockResolvedValue([expiredAd('ad-1', 'disable')]);

      await scheduler.tick();

      expect(adRepo.disable).toHaveBeenCalledWith('ad-1');
      expect(adRepo.delete).not.toHaveBeenCalled();
      expect(processUseCase.execute).toHaveBeenCalledTimes(1);
    });

    it('deletes expired ads with action delete', async () => {
      cfgRepo.load.mockResolvedValue(enabledCfg());
      dataSource.query
        .mockResolvedValueOnce([{ acquired: true }])
        .mockResolvedValueOnce([{ acquired: false }]);
      adRepo.findExpired.mockResolvedValue([
        expiredAd('ad-1', 'delete'),
        expiredAd('ad-2', 'disable'),
      ]);

      await scheduler.tick();

      expect(adRepo.delete).toHaveBeenCalledWith('ad-1');
      expect(adRepo.disable).toHaveBeenCalledWith('ad-2');
    });

    it('leaves rows without expired entries untouched (findExpired returns [])', async () => {
      cfgRepo.load.mockResolvedValue(enabledCfg());
      dataSource.query
        .mockResolvedValueOnce([{ acquired: true }])
        .mockResolvedValueOnce([{ acquired: false }]);
      adRepo.findExpired.mockResolvedValue([]);

      await scheduler.tick();

      expect(adRepo.disable).not.toHaveBeenCalled();
      expect(adRepo.delete).not.toHaveBeenCalled();
      expect(processUseCase.execute).toHaveBeenCalledTimes(1);
    });

    it('sweep is idempotent — second consecutive run is a no-op', async () => {
      cfgRepo.load.mockResolvedValue(enabledCfg());
      dataSource.query.mockResolvedValue([{ acquired: true }]);
      // first run finds one expired ad; the disable makes the repo's next
      // findExpired return [] (already disabled rows are not re-swept)
      adRepo.findExpired
        .mockResolvedValueOnce([expiredAd('ad-1', 'disable')])
        .mockResolvedValueOnce([]);

      await scheduler.tick();
      await scheduler.tick();

      expect(adRepo.findExpired).toHaveBeenCalledTimes(2);
      expect(adRepo.disable).toHaveBeenCalledTimes(1);
      expect(processUseCase.execute).toHaveBeenCalledTimes(2);
    });

    it('executes the use case once when lock acquired, then releases', async () => {
      cfgRepo.load.mockResolvedValue(enabledCfg());
      dataSource.query
        .mockResolvedValueOnce([{ acquired: true }]) // pg_try_advisory_lock
        .mockResolvedValueOnce([{ acquired: false }]); // pg_advisory_unlock result
      adRepo.findExpired.mockResolvedValue([]);
      await scheduler.tick();
      expect(processUseCase.execute).toHaveBeenCalledTimes(1);
      const unlock = dataSource.query.mock.calls.some((c) =>
        String(c[0]).includes('pg_advisory_unlock'),
      );
      expect(unlock).toBe(true);
    });

    it('releases lock and resets running when the sweep throws', async () => {
      cfgRepo.load.mockResolvedValue(enabledCfg());
      dataSource.query.mockResolvedValue([{ acquired: true }]);
      adRepo.findExpired.mockRejectedValueOnce(new Error('db down'));
      await expect(scheduler.tick()).resolves.toBeUndefined();
      const unlock = dataSource.query.mock.calls.some((c) =>
        String(c[0]).includes('pg_advisory_unlock'),
      );
      expect(unlock).toBe(true);
      expect(scheduler['running']).toBe(false);
      expect(processUseCase.execute).not.toHaveBeenCalled();
    });

    it('releases lock and resets running when execute throws', async () => {
      cfgRepo.load.mockResolvedValue(enabledCfg());
      dataSource.query.mockResolvedValue([{ acquired: true }]);
      adRepo.findExpired.mockResolvedValue([]);
      processUseCase.execute.mockRejectedValueOnce(new Error('boom'));
      await expect(scheduler.tick()).resolves.toBeUndefined();
      const unlock = dataSource.query.mock.calls.some((c) =>
        String(c[0]).includes('pg_advisory_unlock'),
      );
      expect(unlock).toBe(true);
      expect(scheduler['running']).toBe(false);
    });
  });
});
