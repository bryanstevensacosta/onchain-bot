import { PublishingContentTemplate } from '../template/domain/entities/publishing-template.entity';

/**
 * Template x target contract (threads-publisher plan Fase 2 todo 10,
 * P38-bis): templates reference targets — each binding carries its
 * own bot/channel/delay/cap config, and the schedule carries
 * per-target limits. Sessions operate those links live (planner).
 */
describe('template target bindings (P38-bis)', () => {
  it('exposes per-target bindings with per-target schedule limits', () => {
    const template = PublishingContentTemplate.create({
      id: 'tpl-news',
      name: 'News',
      targets: ['telegram', 'threads'],
      botBindings: [
        { botId: 'tg-1', target: 'telegram', chatId: '@news' },
        { botId: 'th-1', target: 'threads', chatId: '@digest' },
      ],
      schedule: {
        mode: 'recurring',
        intervalMinutes: 10,
        telegram: { publishDelayMs: 60_000, dailyCap: 60 },
        threads: { publishDelayMs: 600_000, dailyCap: 25 },
      },
    });
    expect(template.targetsInclude('telegram')).toBe(true);
    expect(template.targetsInclude('threads')).toBe(true);
    expect(template.bindingsFor('telegram')).toEqual([
      { botId: 'tg-1', target: 'telegram', chatId: '@news' },
    ]);
    expect(template.bindingsFor('threads')).toEqual([
      { botId: 'th-1', target: 'threads', chatId: '@digest' },
    ]);
    expect(template.schedule.telegram).toEqual({
      publishDelayMs: 60_000,
      dailyCap: 60,
    });
    expect(template.schedule.threads).toEqual({
      publishDelayMs: 600_000,
      dailyCap: 25,
    });
    expect(template.canPublish()).toBe(true);
  });

  it('stays dashboard-only without bindings (P38-ter)', () => {
    const template = PublishingContentTemplate.create({
      id: 'tpl-dash',
      name: 'Dash',
      targets: ['telegram'],
    });
    expect(template.canPublish()).toBe(false);
  });
});
