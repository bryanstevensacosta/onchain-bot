import { PublishingSession } from './publishing-session.entity';

describe('PublishingSession (failing-first)', () => {
  it('inactive sessions consume and publish nothing', () => {
    const session = PublishingSession.create({
      name: 'Tab A',
      active: false,
    });
    expect(session.canConsume()).toBe(false);
    expect(session.canPublish()).toBe(false);
  });

  it('matching off consumes nothing; publishing off publishes nothing', () => {
    const noMatch = PublishingSession.create({
      name: 'No Match',
      matchingEnabled: false,
    });
    expect(noMatch.canConsume()).toBe(false);
    expect(noMatch.canPublish()).toBe(true);
    const noPublish = PublishingSession.create({
      name: 'No Publish',
      publishingEnabled: false,
    });
    expect(noPublish.canConsume()).toBe(true);
    expect(noPublish.canPublish()).toBe(false);
  });

  it('source toggles default on; sessions toggle, never create', () => {
    const session = PublishingSession.create({ name: 'Tabs' });
    expect(session.isSourceOn('src-new')).toBe(true);
    session.setSourceToggle('src-new', false);
    expect(session.isSourceOn('src-new')).toBe(false);
  });

  it('empty keywords pass everything; llm off renders raw', () => {
    const session = PublishingSession.create({
      name: 'Raw',
      llmEnabled: false,
    });
    expect(session.isKeywordEligible('kw-x')).toBe(true);
    expect(session.renderMode()).toBe('raw');
    const scoped = PublishingSession.create({
      name: 'Scoped',
      keywordIds: ['kw-1'],
    });
    expect(scoped.isKeywordEligible('kw-1')).toBe(true);
    expect(scoped.isKeywordEligible('kw-2')).toBe(false);
    expect(scoped.renderMode()).toBe('llm');
  });

  it('routes N telegram + N threads targets independently', () => {
    const session = PublishingSession.create({
      name: 'Both',
      telegramTargets: [
        { botId: 'tg-1', chatId: '@a' },
        { botId: 'tg-2', chatId: '@b' },
      ],
      threadsTargets: [{ botId: 'th-1', chatId: '@c' }],
    });
    expect(session.targetsFor('telegram')).toHaveLength(2);
    expect(session.targetsFor('threads')).toHaveLength(1);
  });
});
