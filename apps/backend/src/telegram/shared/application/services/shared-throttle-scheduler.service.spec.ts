import { Test, TestingModule } from '@nestjs/testing';
import {
  SharedThrottleSchedulerService,
  SHARED_THROTTLE_BOUNDS,
  type SharedThrottleBounds,
} from './shared-throttle-scheduler.service';
import { SharedThrottleStateRepository } from '../ports/shared-throttle-state.repository';

describe('SharedThrottleSchedulerService', () => {
  let service: SharedThrottleSchedulerService;
  let throttleStateRepo: jest.Mocked<SharedThrottleStateRepository>;

  const compileService = async (
    overrides: Partial<SharedThrottleBounds> = {},
  ): Promise<TestingModule> => {
    return Test.createTestingModule({
      providers: [
        SharedThrottleSchedulerService,
        {
          provide: SHARED_THROTTLE_BOUNDS,
          useValue: { minDelayMs: 60_000, maxDelayMs: 60_000, ...overrides },
        },
        {
          provide: SharedThrottleStateRepository,
          useValue: {
            getLastPublishAt: jest.fn(),
            setLastPublishAt: jest.fn(),
            load: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();
  };

  beforeEach(async () => {
    const module: TestingModule = await compileService();
    service = module.get<SharedThrottleSchedulerService>(
      SharedThrottleSchedulerService,
    );
    throttleStateRepo = module.get(SharedThrottleStateRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getLastPublishAt', () => {
    it('returns the value from the repo', async () => {
      const now = new Date('2026-07-06T12:00:00Z');
      throttleStateRepo.getLastPublishAt.mockResolvedValue(now);
      const result = await service.getLastPublishAt();
      expect(result).toBe(now);
    });

    it('returns null when the repo returns null (first boot)', async () => {
      throttleStateRepo.getLastPublishAt.mockResolvedValue(null);
      const result = await service.getLastPublishAt();
      expect(result).toBeNull();
    });
  });

  describe('setLastPublishAt', () => {
    it('forwards the timestamp to the repo', async () => {
      const at = new Date('2026-07-06T12:00:00Z');
      throttleStateRepo.setLastPublishAt.mockResolvedValue();
      await service.setLastPublishAt(at);
      expect(throttleStateRepo.setLastPublishAt).toHaveBeenCalledWith(at);
    });
  });

  describe('shouldPublish', () => {
    it('allows publishing when there is no prior lastPublishAt', async () => {
      throttleStateRepo.getLastPublishAt.mockResolvedValue(null);
      const decision = await service.shouldPublish(new Date());
      expect(decision.canPublish).toBe(true);
      expect(decision.nextDelayMs).toBe(0);
    });

    it('allows publishing when the random delay has elapsed', async () => {
      const last = new Date('2026-07-06T11:00:00Z');
      const now = new Date('2026-07-06T12:00:00Z');
      throttleStateRepo.getLastPublishAt.mockResolvedValue(last);
      // 60 min elapsed — always > the 60s injected delay
      const decision = await service.shouldPublish(now);
      expect(decision.canPublish).toBe(true);
      expect(decision.nextDelayMs).toBe(0);
    });

    it('denies publishing when the last publish was very recent', async () => {
      const last = new Date('2026-07-06T11:59:30Z');
      const now = new Date('2026-07-06T12:00:00Z');
      // 30 seconds elapsed — guaranteed < the 60s injected delay
      throttleStateRepo.getLastPublishAt.mockResolvedValue(last);
      const decision = await service.shouldPublish(now);
      expect(decision.canPublish).toBe(false);
      expect(decision.nextDelayMs).toBe(30_000);
    });

    it('emits a non-negative nextDelayMs even on edge cases', async () => {
      const last = new Date('2026-07-06T12:00:00Z');
      const now = new Date('2026-07-06T12:00:00Z');
      throttleStateRepo.getLastPublishAt.mockResolvedValue(last);
      const decision = await service.shouldPublish(now);
      expect(decision.nextDelayMs).toBeGreaterThanOrEqual(0);
    });

    it('emits a nextDelayMs bounded by the configured max delay', async () => {
      // 1 ms elapsed — well under any delay
      const last = new Date('2026-07-06T12:00:00Z');
      const now = new Date('2026-07-06T12:00:00.001Z');
      throttleStateRepo.getLastPublishAt.mockResolvedValue(last);
      const decision = await service.shouldPublish(now);
      // nextDelayMs = randomDelay - elapsed; the randomDelay itself
      // is at most the injected 60_000ms = 1min.
      expect(decision.nextDelayMs).toBeLessThanOrEqual(60_000);
    });
  });

  describe('random delay distribution (injected deterministic bounds)', () => {
    it('produces delays in [0, 60_000] when the last publish was long ago', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      throttleStateRepo.getLastPublishAt.mockResolvedValue(yesterday);
      for (let i = 0; i < 50; i++) {
        const decision = await service.shouldPublish(new Date());
        expect(decision.canPublish).toBe(true);
        expect(decision.nextDelayMs).toBe(0);
      }
    });

    it('produces a nextDelayMs in (0, 60_000] when the last publish was 1 ms ago', async () => {
      const oneMsAgo = new Date(Date.now() - 1);
      for (let i = 0; i < 50; i++) {
        throttleStateRepo.getLastPublishAt.mockResolvedValue(oneMsAgo);
        const decision = await service.shouldPublish(new Date());
        expect(decision.canPublish).toBe(false);
        expect(decision.nextDelayMs).toBeGreaterThan(0);
        expect(decision.nextDelayMs).toBeLessThanOrEqual(60_000);
      }
    });
  });

  describe('scope parametrization', () => {
    it('two instances with DIFFERENT bounds decide independently for the same repo row', async () => {
      // Both instances share the same persisted row: last published 61s ago.
      const last = new Date('2026-07-06T11:59:00Z');
      const now = new Date('2026-07-06T12:00:01Z');

      // Instance A: 60s/60s window (like ads default). 61s elapsed → OK.
      const moduleA = await compileService({
        minDelayMs: 60_000,
        maxDelayMs: 60_000,
      });
      const serviceA = moduleA.get<SharedThrottleSchedulerService>(
        SharedThrottleSchedulerService,
      );
      const repoA = moduleA.get<SharedThrottleStateRepository>(
        SharedThrottleStateRepository,
      );
      (repoA.getLastPublishAt as jest.Mock).mockResolvedValue(last);

      // Instance B: 180s/180s window (aggressive anti-pulse). 61s elapsed → blocked.
      const moduleB = await compileService({
        minDelayMs: 180_000,
        maxDelayMs: 180_000,
      });
      const serviceB = moduleB.get<SharedThrottleSchedulerService>(
        SharedThrottleSchedulerService,
      );
      const repoB = moduleB.get<SharedThrottleStateRepository>(
        SharedThrottleStateRepository,
      );
      (repoB.getLastPublishAt as jest.Mock).mockResolvedValue(last);

      const decisionA = await serviceA.shouldPublish(now);
      const decisionB = await serviceB.shouldPublish(now);

      expect(decisionA.canPublish).toBe(true);
      expect(decisionB.canPublish).toBe(false);
      expect(decisionB.nextDelayMs).toBe(119_000);
    });
  });
});
