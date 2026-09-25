import { ScheduledAd } from '../../../../domain/scheduled-ad.entity';
import { SchedulingConfig } from '../../../../domain/scheduling-config.entity';
import { SchedulingState } from '../../../../domain/scheduling-state.entity';
import { AdMediaLibraryEntry } from '../../../../domain/ad-media-library-entry.entity';
import {
  fromAdMediaLibraryOrmEntity,
  fromScheduledAdOrmEntity,
  fromSchedulingConfigOrmEntity,
  fromSchedulingStateOrmEntity,
  toAdMediaLibraryOrmEntity,
  toScheduledAdOrmEntity,
  toSchedulingConfigOrmEntity,
  toSchedulingStateOrmEntity,
} from './scheduling-typeorm.mapper';

describe('scheduling-typeorm.mapper', () => {
  it('round-trips posts, config, state, and library rows (GAP-1 shapes)', () => {
    const ad = ScheduledAd.create({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'promo',
      body: 'hello',
      order: 3,
    });
    expect(fromScheduledAdOrmEntity(toScheduledAdOrmEntity(ad)).name).toBe(
      'promo',
    );

    const config = SchedulingConfig.load({
      enabled: true,
      telegram: { publishDelayMs: 5000, dailyCap: 2 },
    });
    const configBack = fromSchedulingConfigOrmEntity(
      toSchedulingConfigOrmEntity(config),
    );
    expect(configBack.limitsFor('telegram')).toEqual({
      publishDelayMs: 5000,
      dailyCap: 2,
    });

    const state = SchedulingState.empty()
      .incrementPostsSinceLastAd()
      .markPublished('threads', 'a9', new Date('2026-09-25T10:00:00.000Z'));
    const stateBack = fromSchedulingStateOrmEntity(
      toSchedulingStateOrmEntity(state),
    );
    expect(stateBack.postsSinceLastAd).toBe(1);
    expect(stateBack.cursorFor('threads').lastAdId).toBe('a9');

    const entry = AdMediaLibraryEntry.create({
      filePath: 'ads-library/abc.png',
      contentHash: 'abc',
    });
    expect(
      fromAdMediaLibraryOrmEntity(toAdMediaLibraryOrmEntity(entry)).contentHash,
    ).toBe('abc');
  });
});
