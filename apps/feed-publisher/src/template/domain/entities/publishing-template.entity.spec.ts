import { PublishingContentTemplate as PublishingTemplate } from './publishing-template.entity';

describe('PublishingTemplate (failing-first)', () => {
  it('creates a telegram-only template scoped to sources + keywords', () => {
    const template = PublishingTemplate.create({
      name: 'Morning Brief',
      sourceIds: ['src-a', 'src-b'],
      keywordIds: ['kw-1'],
      targets: ['telegram'],
    });
    expect(template.name).toBe('Morning Brief');
    expect(template.targets).toEqual(['telegram']);
    expect(template.isSourceEligible('src-a')).toBe(true);
    expect(template.isSourceEligible('src-zzz')).toBe(false);
  });

  it('rejects empty targets (telegram, threads, or both required)', () => {
    expect(() =>
      PublishingTemplate.create({ name: 'Empty', targets: [] }),
    ).toThrow('at least one target');
  });

  it('empty scopes mean everything is eligible; prompt ref is reusable', () => {
    const template = PublishingTemplate.create({
      name: 'All Feed',
      targets: ['telegram', 'threads'],
      promptTemplateId: 'global-default',
    });
    expect(template.isSourceEligible('anything')).toBe(true);
    expect(template.isKeywordEligible('anything')).toBe(true);
    expect(template.promptTemplateId).toBe('global-default');
    expect(template.targetsInclude('threads')).toBe(true);
  });

  it('cannot publish without bot bindings (dashboard-only)', () => {
    const template = PublishingTemplate.create({
      name: 'No Bots',
      targets: ['telegram'],
    });
    expect(template.canPublish()).toBe(false);
    template.updateConfig({
      botBindings: [{ botId: 'bot-1', target: 'telegram', chatId: '@chan' }],
    });
    expect(template.canPublish()).toBe(true);
    template.deactivate();
    expect(template.canPublish()).toBe(false);
  });

  it('applies own content filters on-read, fail-open on bad patterns', () => {
    const template = PublishingTemplate.create({
      name: 'Filtered',
      targets: ['telegram'],
      contentFilters: [
        {
          id: 'f1',
          pattern: 'buy now',
          replacement: '[promo]',
          flags: 'gi',
          priority: 1,
          isActive: true,
        },
        {
          id: 'f2',
          pattern: 'x'.repeat(600),
          replacement: '',
          flags: 'gi',
          priority: 0,
          isActive: true,
        },
        {
          id: 'f3',
          pattern: 'off-pattern',
          replacement: '',
          flags: 'gi',
          priority: 2,
          isActive: false,
        },
      ],
    });
    expect(template.applyContentFilters('BUY NOW cheap')).toBe('[promo] cheap');
  });

  it('scheduling posts: off never due, one-shot fires after its time', () => {
    const off = PublishingTemplate.create({
      name: 'Off',
      targets: ['telegram'],
    });
    expect(off.isScheduleDue(new Date())).toBe(false);
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 3_600_000);
    const oneShot = PublishingTemplate.create({
      name: 'Once',
      targets: ['telegram'],
      schedule: { mode: 'one-shot', oneShotAt: past },
    });
    expect(oneShot.isScheduleDue(new Date())).toBe(true);
    oneShot.updateConfig({ schedule: { oneShotAt: future } });
    expect(oneShot.isScheduleDue(new Date())).toBe(false);
    const recurring = PublishingTemplate.create({
      name: 'Daily',
      targets: ['threads'],
      schedule: { mode: 'recurring', intervalMinutes: 60 },
    });
    expect(recurring.isScheduleDue(new Date())).toBe(true);
  });
});
