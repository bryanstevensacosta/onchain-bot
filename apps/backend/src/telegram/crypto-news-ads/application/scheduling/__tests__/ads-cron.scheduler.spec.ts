import { AdsCronScheduler } from '../ads-cron.scheduler';
import { PublishAdUseCase } from '../../handlers/publish-ad.use-case';
import { AdRotationConfigRepository } from 'telegram/crypto-news-ads/application/ports/ad-rotation-config.repository';
import { AdRotationConfig } from 'telegram/crypto-news-ads/domain/entities/ad-rotation-config.entity';
import { DataSource } from 'typeorm';

describe('AdsCronScheduler', () => {
  const processUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<PublishAdUseCase>;
  const cfgRepo = {
    load: jest.fn(),
  } as unknown as jest.Mocked<AdRotationConfigRepository>;
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
    );
  });

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

    it('returns without executing when rotation config is disabled', async () => {
      cfgRepo.load.mockResolvedValue(AdRotationConfig.empty()); // enabled=false
      await scheduler.tick();
      expect(processUseCase.execute).not.toHaveBeenCalled();
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('skips tick when advisory lock was not acquired', async () => {
      cfgRepo.load.mockResolvedValue(
        AdRotationConfig.empty().update({ enabled: true }),
      );
      dataSource.query.mockResolvedValue([{ acquired: false }]);
      await scheduler.tick();
      expect(processUseCase.execute).not.toHaveBeenCalled();
    });

    it('lock not acquired does NOT release (no unlock query for pg_try_advisory_lock false)', async () => {
      cfgRepo.load.mockResolvedValue(
        AdRotationConfig.empty().update({ enabled: true }),
      );
      dataSource.query.mockResolvedValue([{ acquired: false }]);
      await scheduler.tick();
      const unlock = dataSource.query.mock.calls.filter((c) =>
        String(c[0]).includes('pg_advisory_unlock'),
      );
      expect(unlock).toHaveLength(0);
    });

    it('executes the use case once when lock acquired, then releases', async () => {
      cfgRepo.load.mockResolvedValue(
        AdRotationConfig.empty().update({ enabled: true }),
      );
      dataSource.query
        .mockResolvedValueOnce([{ acquired: true }]) // pg_try_advisory_lock
        .mockResolvedValueOnce([{ acquired: false }]); // pg_advisory_unlock result
      await scheduler.tick();
      expect(processUseCase.execute).toHaveBeenCalledTimes(1);
      const unlock = dataSource.query.mock.calls.some((c) =>
        String(c[0]).includes('pg_advisory_unlock'),
      );
      expect(unlock).toBe(true);
    });

    it('releases lock and resets running when execute throws', async () => {
      cfgRepo.load.mockResolvedValue(
        AdRotationConfig.empty().update({ enabled: true }),
      );
      dataSource.query.mockResolvedValue([{ acquired: true }]);
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
