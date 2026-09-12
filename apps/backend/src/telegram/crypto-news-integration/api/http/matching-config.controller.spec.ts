import { Test, TestingModule } from '@nestjs/testing';
import { MatchingConfigController } from './matching-config.controller';
import { MatchingConfigRepository } from 'telegram/crypto-news-integration/application/ports/matching-config.repository';
import { MatchingHealthState } from 'telegram/crypto-news-integration/application/state/matching-health.state';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';
import { MatchingConfig } from 'telegram/crypto-news-integration/domain/entities/matching-config.entity';

describe('MatchingConfigController', () => {
  let controller: MatchingConfigController;
  let repo: jest.Mocked<MatchingConfigRepository>;
  let health: MatchingHealthState;
  let queueRepo: jest.Mocked<PublisherQueueRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MatchingConfigController],
      providers: [
        {
          provide: MatchingConfigRepository,
          useValue: {
            load: jest.fn(),
            save: jest.fn(),
          },
        },
        MatchingHealthState,
        {
          provide: PublisherQueueRepository,
          useValue: {
            countPending: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(MatchingConfigController);
    repo = module.get(MatchingConfigRepository);
    health = module.get(MatchingHealthState);
    queueRepo = module.get(PublisherQueueRepository);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getConfig returns the single-row view (id=1)', async () => {
    repo.load.mockResolvedValue(
      MatchingConfig.reconstitute({
        id: 1,
        enabled: true,
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    );
    const view = await controller.getConfig();
    expect(view.id).toBe(1);
    expect(view.enabled).toBe(true);
    expect(view.updatedAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('updateConfig patches enabled and persists (sole write path)', async () => {
    const cfg = MatchingConfig.reconstitute({
      id: 1,
      enabled: false,
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    repo.load.mockResolvedValue(cfg);
    repo.save.mockResolvedValue(undefined);

    const view = await controller.updateConfig({ enabled: true });

    expect(view.enabled).toBe(true);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(cfg);
  });

  it('updateConfig with empty patch leaves enabled untouched', async () => {
    const cfg = MatchingConfig.reconstitute({
      id: 1,
      enabled: false,
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    repo.load.mockResolvedValue(cfg);
    repo.save.mockResolvedValue(undefined);

    const view = await controller.updateConfig({});

    expect(view.enabled).toBe(false);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  describe('getHealth', () => {
    const seedEnabled = (enabled: boolean): void => {
      repo.load.mockResolvedValue(
        MatchingConfig.reconstitute({
          id: 1,
          enabled,
          updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        }),
      );
    };

    it('returns exactly the 6-field contract with live values', async () => {
      seedEnabled(true);
      queueRepo.countPending.mockResolvedValue(3);
      health.recordFetchSuccess(new Date('2026-09-12T00:02:00.000Z'));
      health.recordEnqueued(new Date('2026-09-12T00:03:00.000Z'));

      const view = await controller.getHealth();

      expect(view).toEqual({
        enabled: true,
        lastTickAt: '2026-09-12T00:02:00.000Z',
        lastFetchOk: true,
        consecutiveFetchFailures: 0,
        lastEnqueuedAt: '2026-09-12T00:03:00.000Z',
        queuePending: 3,
      });
      expect(Object.keys(view).sort()).toEqual(
        [
          'consecutiveFetchFailures',
          'enabled',
          'lastEnqueuedAt',
          'lastFetchOk',
          'lastTickAt',
          'queuePending',
        ].sort(),
      );
    });

    it('returns nulls before the first tick (fresh restart)', async () => {
      seedEnabled(false);
      queueRepo.countPending.mockResolvedValue(0);

      const view = await controller.getHealth();

      expect(view).toEqual({
        enabled: false,
        lastTickAt: null,
        lastFetchOk: null,
        consecutiveFetchFailures: 0,
        lastEnqueuedAt: null,
        queuePending: 0,
      });
    });

    it('reflects fetch failures recorded by the scheduler', async () => {
      seedEnabled(true);
      queueRepo.countPending.mockResolvedValue(7);
      health.recordFetchFailure(new Date('2026-09-12T00:00:00.000Z'));
      health.recordFetchFailure(new Date('2026-09-12T00:01:00.000Z'));

      const view = await controller.getHealth();

      expect(view.lastFetchOk).toBe(false);
      expect(view.consecutiveFetchFailures).toBe(2);
      expect(view.lastTickAt).toBe('2026-09-12T00:01:00.000Z');
      expect(view.queuePending).toBe(7);
    });
  });
});
