import { RotationDeciderService } from './rotation-decider.service';
import { ScheduledAd } from '../../domain/scheduled-ad.entity';
import { SchedulingConfig } from '../../domain/scheduling-config.entity';
import { SchedulingState } from '../../domain/scheduling-state.entity';

function makeAd(id: string, order: number): ScheduledAd {
  return ScheduledAd.create({ id, name: `ad-${id}`, body: 'hello', order });
}

function makeSetup() {
  const decider = new RotationDeciderService();
  const config = SchedulingConfig.load({
    enabled: true,
    everyNPosts: 1,
    minMinutesBetweenAds: 0,
    telegram: { publishDelayMs: 60_000, dailyCap: 2 },
    threads: { publishDelayMs: 5_000, dailyCap: 10 },
  });
  const state = SchedulingState.empty().incrementPostsSinceLastAd();
  return { decider, config, state };
}

describe('RotationDeciderService', () => {
  it('publishes the first ad when no per-target wait has elapsed', async () => {
    const { decider, config, state } = makeSetup();
    const now = new Date('2026-09-25T10:00:00.000Z');
    const decision = await decider.shouldPublishAd({
      now,
      target: 'telegram',
      config,
      state,
      activeAds: [makeAd('a1', 0)],
    });
    expect(decision.shouldPublish).toBe(true);
    expect(decision.ad?.id).toBe('a1');
    expect(decision.reason).toBe('ok');
  });

  it('returns no-active-ads when the catalog is empty', async () => {
    const { decider, config, state } = makeSetup();
    const decision = await decider.shouldPublishAd({
      now: new Date('2026-09-25T10:00:00.000Z'),
      target: 'telegram',
      config,
      state,
      activeAds: [],
    });
    expect(decision).toEqual({
      shouldPublish: false,
      ad: null,
      reason: 'no-active-ads',
      heldUntilNextDay: false,
    });
  });

  it('enforces the per-target publish delay independently (P38)', async () => {
    const { decider, config, state } = makeSetup();
    const first = new Date('2026-09-25T10:00:00.000Z');
    const afterTelegram = state.markPublished('telegram', 'a1', first);
    // 30s later: telegram still inside its 60s delay, threads has no wait.
    const now = new Date('2026-09-25T10:00:30.000Z');
    const ads = [makeAd('a1', 0), makeAd('a2', 1)];
    const telegramDecision = await decider.shouldPublishAd({
      now,
      target: 'telegram',
      config,
      state: afterTelegram,
      activeAds: ads,
    });
    expect(telegramDecision.shouldPublish).toBe(false);
    expect(telegramDecision.reason).toBe('publish-delay-not-met');
    const threadsDecision = await decider.shouldPublishAd({
      now,
      target: 'threads',
      config,
      state: afterTelegram,
      activeAds: ads,
    });
    expect(threadsDecision.shouldPublish).toBe(true);
    expect(threadsDecision.reason).toBe('ok');
  });

  it('holds at the per-target daily cap without dropping (P38 adversarial)', async () => {
    const { decider, config, state } = makeSetup();
    let cursor = state;
    cursor = cursor.markPublished(
      'telegram',
      'a1',
      new Date('2026-09-25T10:00:00.000Z'),
    );
    cursor = cursor.markPublished(
      'telegram',
      'a2',
      new Date('2026-09-25T12:00:00.000Z'),
    );
    const decision = await decider.shouldPublishAd({
      now: new Date('2026-09-25T18:00:00.000Z'),
      target: 'telegram',
      config,
      state: cursor,
      activeAds: [makeAd('a1', 0), makeAd('a2', 1)],
    });
    expect(decision.shouldPublish).toBe(false);
    expect(decision.reason).toBe('daily-cap-reached');
    expect(decision.heldUntilNextDay).toBe(true);
    // The sibling target is unaffected by the telegram cap.
    const sibling = await decider.shouldPublishAd({
      now: new Date('2026-09-25T18:00:00.000Z'),
      target: 'threads',
      config,
      state: cursor,
      activeAds: [makeAd('a1', 0)],
    });
    expect(sibling.shouldPublish).toBe(true);
  });

  it('resets the daily counter on UTC day rollover', async () => {
    const { decider, config, state } = makeSetup();
    let cursor = state;
    cursor = cursor.markPublished(
      'telegram',
      'a1',
      new Date('2026-09-25T10:00:00.000Z'),
    );
    cursor = cursor.markPublished(
      'telegram',
      'a2',
      new Date('2026-09-25T12:00:00.000Z'),
    );
    const nextDay = await decider.shouldPublishAd({
      now: new Date('2026-09-26T10:00:00.000Z'),
      target: 'telegram',
      config,
      state: cursor,
      activeAds: [makeAd('a1', 0)],
    });
    expect(nextDay.shouldPublish).toBe(true);
    expect(nextDay.reason).toBe('ok');
  });

  it('round-robins per target from the target cursor', async () => {
    const { decider, config, state } = makeSetup();
    const cursor = state.markPublished(
      'telegram',
      'a1',
      new Date('2026-09-25T08:00:00.000Z'),
    );
    const decision = await decider.shouldPublishAd({
      now: new Date('2026-09-25T10:00:00.000Z'),
      target: 'telegram',
      config,
      state: cursor,
      activeAds: [makeAd('a1', 0), makeAd('a2', 1)],
    });
    expect(decision.ad?.id).toBe('a2');
  });
});
