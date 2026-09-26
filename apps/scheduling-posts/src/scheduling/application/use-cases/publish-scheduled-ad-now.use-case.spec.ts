import { ScheduledAd } from '../../domain/scheduled-ad.entity';
import { PublishScheduledAdNowUseCase } from './publish-scheduled-ad-now.use-case';
import { SchedulingHealthState } from '../state/scheduling-health.state';
import { InMemoryScheduledAdRepository } from '../../infrastructure/persistence/in-memory/in-memory-scheduled-ad.repository';
import { InMemorySchedulingStateRepository } from '../../infrastructure/persistence/in-memory/in-memory-scheduling-state.repository';
import { InMemoryScheduledAdDispatcher } from '../../infrastructure/dispatch/in-memory-scheduled-ad.dispatcher';

describe('PublishScheduledAdNowUseCase', () => {
  it('sends immediately and advances the target cursor only', async () => {
    const adRepo = new InMemoryScheduledAdRepository();
    const stateRepo = new InMemorySchedulingStateRepository();
    const dispatcher = new InMemoryScheduledAdDispatcher();
    const useCase = new PublishScheduledAdNowUseCase(
      adRepo,
      stateRepo,
      dispatcher,
      new SchedulingHealthState(),
    );
    const ad = ScheduledAd.create({ id: 'a1', name: 'one', body: 'hello' });
    await adRepo.save(ad);
    const result = await useCase.execute(
      ad,
      'threads',
      new Date('2026-09-25T10:00:00.000Z'),
    );
    expect(result).toEqual({ ok: true, messageId: 1, error: null });
    const state = await stateRepo.load();
    expect(state.cursorFor('threads').lastAdId).toBe('a1');
    expect(state.cursorFor('telegram').lastAdId).toBeNull();
  });

  it('returns the dispatch error without failure bookkeeping', async () => {
    const adRepo = new InMemoryScheduledAdRepository();
    const stateRepo = new InMemorySchedulingStateRepository();
    const dispatcher = new InMemoryScheduledAdDispatcher();
    const useCase = new PublishScheduledAdNowUseCase(
      adRepo,
      stateRepo,
      dispatcher,
      new SchedulingHealthState(),
    );
    const ad = ScheduledAd.create({ id: 'a1', name: 'one', body: 'hello' });
    await adRepo.save(ad);
    dispatcher.failNextWith('boom');
    const result = await useCase.execute(
      ad,
      'telegram',
      new Date('2026-09-25T10:00:00.000Z'),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('boom');
    const after = await adRepo.findById('a1');
    expect(after?.consecutiveFailures).toBe(0);
    expect(after?.enabled).toBe(true);
  });
});
