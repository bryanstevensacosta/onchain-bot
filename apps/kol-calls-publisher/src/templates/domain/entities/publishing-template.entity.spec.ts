import { DomainError } from '../../../shared/kernel/domain-error';
import { PublishingTemplate } from './publishing-template.entity';

describe('PublishingTemplate (todo 10, failing-first)', () => {
  it('creates a dashboard-only template by default (no bot, threadConfig null)', () => {
    const template = PublishingTemplate.create({ name: 'vip-calls' });
    expect(template.id).toBe('vip-calls');
    expect(template.name).toBe('vip-calls');
    expect(template.active).toBe(true);
    expect(template.kolSourceIds).toEqual([]);
    expect(template.threadConfig).toBeNull();
    expect(template.botId).toBeNull();
    expect(template.channelTarget).toBeNull();
    expect(template.adminVerifiedAt).toBeNull();
    expect(template.canPublish()).toBe(false);
    expect(template.rankingStrategy).toBe('score');
    expect(template.rankingLimit).toBe(50);
  });

  it('rejects empty names and out-of-range config', () => {
    expect(() => PublishingTemplate.create({ name: '' })).toThrow(DomainError);
    expect(() => PublishingTemplate.create({ name: '  ' })).toThrow(
      DomainError,
    );
    expect(() =>
      PublishingTemplate.create({ name: 't', minVisibleScore: 101 }),
    ).toThrow(DomainError);
    expect(() =>
      PublishingTemplate.create({ name: 't', gemPatterns: ['['] }),
    ).toThrow(DomainError);
    expect(() =>
      PublishingTemplate.create({ name: 't', rankingLimit: 0 }),
    ).toThrow(DomainError);
    expect(() =>
      PublishingTemplate.create({
        name: 't',
        rankingStrategy: 'viral' as never,
      }),
    ).toThrow(DomainError);
  });

  it('derives a slug id from the name when no id is given', () => {
    const template = PublishingTemplate.create({ name: 'My VIP Calls!' });
    expect(template.id).toBe('my-vip-calls');
  });

  it('activate/deactivate toggles publishing availability', () => {
    const template = PublishingTemplate.create({ name: 't' });
    template.deactivate();
    expect(template.active).toBe(false);
    expect(template.canPublish()).toBe(false);
    template.activate();
    expect(template.active).toBe(true);
  });

  it('assignChannel clears admin verification (must re-verify)', () => {
    const template = PublishingTemplate.create({ name: 't' });
    template.assignChannel('bot-1', '@channel');
    expect(template.botId).toBe('bot-1');
    expect(template.channelTarget).toBe('@channel');
    expect(template.adminVerifiedAt).toBeNull();
    expect(template.canPublish()).toBe(false);
    template.markChannelVerified(new Date('2026-09-25T00:00:00Z'));
    expect(template.canPublish()).toBe(true);
    template.assignChannel('bot-1', '@other');
    expect(template.adminVerifiedAt).toBeNull();
    expect(template.canPublish()).toBe(false);
  });

  it('exposes the todo-9 classification config (sources + display + gems)', () => {
    const template = PublishingTemplate.create({
      name: 't',
      kolSourceIds: ['ch1'],
      minVisibleScore: 40,
      gemMinScore: 70,
      gemPatterns: ['solana'],
    });
    expect(template.classification.isSourceVisible('ch1')).toBe(true);
    expect(template.classification.isSourceVisible('ch9')).toBe(false);
    expect(template.classification.isScoreVisible(40)).toBe(true);
    expect(template.classification.isScoreVisible(39)).toBe(false);
    expect(
      template.classification.matchesGem({
        score: 80,
        enrichmentText: 'solana memecoin',
      }),
    ).toBe(true);
  });

  it('emits created/activated/sources-updated events', () => {
    const template = PublishingTemplate.create({ name: 't' });
    const created = template.commit();
    expect(created.map((e) => e.eventName)).toContain(
      'templates.template.created',
    );
    template.activate();
    template.setSources(['ch1']);
    const names = template.commit().map((e) => e.eventName);
    expect(names).toContain('templates.template.activated');
    expect(names).toContain('templates.template.sources-updated');
  });
});
