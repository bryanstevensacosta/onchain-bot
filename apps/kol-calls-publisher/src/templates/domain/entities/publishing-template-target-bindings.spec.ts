import { PublishingTemplate } from './publishing-template.entity';

/**
 * Template x target contract (threads-publisher plan Fase 2 todo 10,
 * P38-bis): templates reference targets — the delivery surface as
 * links. Today only the telegram binding exists (bot + verified
 * channel); the threads binding lands when `threadConfig`
 * un-stubbes (C1). Empty = dashboard-only (P38-ter).
 */
describe('PublishingTemplate.targetBindings (todo 10)', () => {
  it('exposes the telegram binding once bot + channel are assigned', () => {
    const template = PublishingTemplate.create({ id: 't1', name: 'T1' });
    expect(template.targetBindings()).toEqual([]);
    template.assignChannel('bot-1', '@mirror');
    expect(template.targetBindings()).toEqual([
      { target: 'telegram', botId: 'bot-1', chatId: '@mirror' },
    ]);
  });

  it('stays dashboard-only without a binding', () => {
    const template = PublishingTemplate.create({ id: 't2', name: 'T2' });
    expect(template.targetBindings()).toEqual([]);
    expect(template.canPublish()).toBe(false);
  });
});
