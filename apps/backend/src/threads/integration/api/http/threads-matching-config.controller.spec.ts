import { ThreadsMatchingConfigController } from 'threads/integration/api/http/threads-matching-config.controller';
import { InMemoryThreadsMatchingConfigRepository } from 'threads/integration/application/repositories/in-memory-threads-matching-config.repository';
import { ThreadsMatchingHealthState } from 'threads/integration/application/state/threads-matching-health.state';
import { InMemoryThreadsQueueRepository } from 'threads/publisher/application/repositories/in-memory-threads-queue.repository';

describe('ThreadsMatchingConfigController', () => {
  let matchingRepo: InMemoryThreadsMatchingConfigRepository;
  let health: ThreadsMatchingHealthState;
  let queueRepo: InMemoryThreadsQueueRepository;
  let controller: ThreadsMatchingConfigController;

  beforeEach(() => {
    matchingRepo = new InMemoryThreadsMatchingConfigRepository();
    health = new ThreadsMatchingHealthState();
    queueRepo = new InMemoryThreadsQueueRepository();
    controller = new ThreadsMatchingConfigController(
      matchingRepo,
      health,
      queueRepo,
    );
  });

  it('getConfig returns the single row seeded enabled=true', async () => {
    const view = await controller.getConfig();

    expect(view.id).toBe(1);
    expect(view.enabled).toBe(true);
    expect(typeof view.updatedAt).toBe('string');
  });

  it('updateConfig flips the flag and persists it', async () => {
    const patched = await controller.updateConfig({ enabled: false });

    expect(patched.enabled).toBe(false);
    expect((await controller.getConfig()).enabled).toBe(false);
  });

  it('getHealth returns the frozen 6-field contract', async () => {
    health.recordFetchSuccess(new Date('2026-09-15T10:00:00Z'));

    const view = await controller.getHealth();

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
    expect(view.enabled).toBe(true);
    expect(view.lastTickAt).toBe('2026-09-15T10:00:00.000Z');
    expect(view.lastFetchOk).toBe(true);
    expect(view.consecutiveFetchFailures).toBe(0);
    expect(view.lastEnqueuedAt).toBeNull();
    expect(view.queuePending).toBe(0);
  });
});
