import { TrackingCronScheduler } from './tracking-cron.scheduler';
import { UpdateTrackedCallsUseCase } from '../../application/handlers/update-tracked-calls.use-case';
import { SchedulerRegistry } from '@nestjs/schedule';

describe('TrackingCronScheduler', () => {
  it('tick delegates to UpdateTrackedCallsUseCase', async () => {
    const updateUseCase = {
      execute: jest
        .fn()
        .mockResolvedValue({ evaluated: 1, updated: 1, skipped: 0 }),
    } as unknown as UpdateTrackedCallsUseCase;
    const scheduler = new TrackingCronScheduler(
      updateUseCase,
      new SchedulerRegistry(),
    );
    await scheduler.tick(10);
    expect(updateUseCase.execute).toHaveBeenCalledWith({ batchSize: 10 });
  });

  it('concurrent ticks are skipped (concurrency guard)', async () => {
    let resolveExecute: () => void = () => undefined;
    const executePromise = new Promise<{
      evaluated: number;
      updated: number;
      skipped: number;
    }>((resolve) => {
      resolveExecute = () => resolve({ evaluated: 0, updated: 0, skipped: 0 });
    });
    const updateUseCase = {
      execute: jest.fn().mockReturnValue(executePromise),
    } as unknown as UpdateTrackedCallsUseCase;
    const scheduler = new TrackingCronScheduler(
      updateUseCase,
      new SchedulerRegistry(),
    );

    const first = scheduler.tick();
    const second = await scheduler.tick();
    expect(updateUseCase.execute).toHaveBeenCalledTimes(1);
    resolveExecute();
    await first;
  });

  it('errors are logged and do not propagate', async () => {
    const updateUseCase = {
      execute: jest.fn().mockRejectedValue(new Error('boom')),
    } as unknown as UpdateTrackedCallsUseCase;
    const scheduler = new TrackingCronScheduler(
      updateUseCase,
      new SchedulerRegistry(),
    );
    await expect(scheduler.tick()).resolves.toBeUndefined();
  });
});
