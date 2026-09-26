import { ScheduledAd } from '../../domain/scheduled-ad.entity';
import { SchedulingConfig } from '../../domain/scheduling-config.entity';
import { RotationDeciderService } from '../services/rotation-decider.service';
import { PublishScheduledAdUseCase } from './publish-scheduled-ad.use-case';
import { SchedulingHealthState } from '../state/scheduling-health.state';
import { InMemoryScheduledAdRepository } from '../../infrastructure/persistence/in-memory/in-memory-scheduled-ad.repository';
import { InMemorySchedulingConfigRepository } from '../../infrastructure/persistence/in-memory/in-memory-scheduling-config.repository';
import { InMemorySchedulingStateRepository } from '../../infrastructure/persistence/in-memory/in-memory-scheduling-state.repository';
import { InMemoryScheduledAdDispatcher } from '../../infrastructure/dispatch/in-memory-scheduled-ad.dispatcher';

function makeHarness() {
  const adRepo = new InMemoryScheduledAdRepository();
  const configRepo = new InMemorySchedulingConfigRepository();
  const stateRepo = new InMemorySchedulingStateRepository();
  const dispatcher = new InMemoryScheduledAdDispatcher();
  const health = new SchedulingHealthState();
  const useCase = new PublishScheduledAdUseCase(
    adRepo,
    configRepo,
    stateRepo,
    new RotationDeciderService(),
    dispatcher,
    health,
  );
  return { adRepo, configRepo, stateRepo, dispatcher, health, useCase };
}

async function seedEnabled(
  configRepo: InMemorySchedulingConfigRepository,
  patch: {
    telegram?: { publishDelayMs?: number; dailyCap?: number };
    threads?: { publishDelayMs?: number; dailyCap?: number };
  } = {},
): Promise<void> {
  const current = await configRepo.load();
  await configRepo.save(
    current.update({
      enabled: true,
      everyNPosts: 1,
      minMinutesBetweenAds: 0,
      telegram: { publishDelayMs: 0, dailyCap: 10 },
      threads: { publishDelayMs: 0, dailyCap: 10 },
      ...patch,
    }),
  );
}

describe('PublishScheduledAdUseCase', () => {
  it('publishes one target without touching the sibling cursor', async () => {
    const { adRepo, configRepo, stateRepo, dispatcher, useCase } =
      makeHarness();
    await seedEnabled(configRepo);
    await useCase.recordNewsPost();
    await adRepo.save(
      ScheduledAd.create({ id: 'a1', name: 'one', body: 'hello' }),
    );
    await useCase.execute('telegram', new Date('2026-09-25T10:00:00.000Z'));
    expect(dispatcher.publishedTo('telegram')).toHaveLength(1);
    expect(dispatcher.publishedTo('threads')).toHaveLength(0);
    const state = await stateRepo.load();
    expect(state.cursorFor('telegram').lastAdId).toBe('a1');
    expect(state.cursorFor('threads').lastAdId).toBeNull();
  });

  it('holds at the daily cap: no dispatch, no cursor move, no failure count', async () => {
    const { adRepo, configRepo, stateRepo, dispatcher, useCase } =
      makeHarness();
    await seedEnabled(configRepo, {
      telegram: { publishDelayMs: 0, dailyCap: 1 },
    });
    await useCase.recordNewsPost();
    await adRepo.save(
      ScheduledAd.create({ id: 'a1', name: 'one', body: 'hello' }),
    );
    await useCase.execute('telegram', new Date('2026-09-25T10:00:00.000Z'));
    await useCase.execute('telegram', new Date('2026-09-25T11:00:00.000Z'));
    expect(dispatcher.publishedTo('telegram')).toHaveLength(1);
    const ad = await adRepo.findById('a1');
    expect(ad?.consecutiveFailures).toBe(0);
    expect(ad?.enabled).toBe(true);
    const state = await stateRepo.load();
    expect(
      state.publishedTodayFor('telegram', new Date('2026-09-25T12:00:00.000Z')),
    ).toBe(1);
  });

  it('retries the held post after the UTC-day rollover', async () => {
    const { adRepo, configRepo, dispatcher, useCase } = makeHarness();
    await seedEnabled(configRepo, {
      telegram: { publishDelayMs: 0, dailyCap: 1 },
    });
    await useCase.recordNewsPost();
    await adRepo.save(
      ScheduledAd.create({ id: 'a1', name: 'one', body: 'hello' }),
    );
    await useCase.execute('telegram', new Date('2026-09-25T10:00:00.000Z'));
    await useCase.execute('telegram', new Date('2026-09-26T10:00:00.000Z'));
    expect(dispatcher.publishedTo('telegram')).toHaveLength(2);
  });

  it('disables after 3 consecutive dispatch failures', async () => {
    const { adRepo, configRepo, dispatcher, useCase } = makeHarness();
    await seedEnabled(configRepo);
    await useCase.recordNewsPost();
    await adRepo.save(
      ScheduledAd.create({ id: 'a1', name: 'one', body: 'hello' }),
    );
    for (let i = 0; i < 3; i += 1) {
      dispatcher.failNextWith('boom');
      await useCase.execute(
        'telegram',
        new Date(`2026-09-25T1${i}:00:00.000Z`),
      );
    }
    const ad = await adRepo.findById('a1');
    expect(ad?.consecutiveFailures).toBe(3);
    expect(ad?.enabled).toBe(false);
    expect(dispatcher.publishedTo('telegram')).toHaveLength(0);
  });

  it('never burns a post on a not-configured publisher', async () => {
    const { adRepo, configRepo, dispatcher, useCase } = makeHarness();
    await seedEnabled(configRepo);
    await useCase.recordNewsPost();
    await adRepo.save(
      ScheduledAd.create({ id: 'a1', name: 'one', body: 'hello' }),
    );
    dispatcher.failNextWith('CRYPTO_NEWS_BOT_TOKEN is not configured');
    await useCase.execute('telegram', new Date('2026-09-25T10:00:00.000Z'));
    const ad = await adRepo.findById('a1');
    expect(ad?.enabled).toBe(true);
    expect(ad?.consecutiveFailures).toBe(0);
  });

  it('skips everything when the master switch is off', async () => {
    const { adRepo, dispatcher, useCase } = makeHarness();
    await adRepo.save(
      ScheduledAd.create({ id: 'a1', name: 'one', body: 'hello' }),
    );
    await useCase.execute('telegram', new Date('2026-09-25T10:00:00.000Z'));
    expect(dispatcher.published()).toHaveLength(0);
  });

  it('recordNewsPost advances the shared cadence counter', async () => {
    const { stateRepo, useCase } = makeHarness();
    await useCase.recordNewsPost();
    await useCase.recordNewsPost();
    expect((await stateRepo.load()).postsSinceLastAd).toBe(2);
  });
});
