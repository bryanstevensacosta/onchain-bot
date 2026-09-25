import { PublishingSessionUseCases } from './publishing-session.use-cases';
import { InMemoryPublishingSessionRepository } from '../../infrastructure/repositories/in-memory-publishing-session.repository';
import { InMemoryContentTemplateRepository } from '../../../template/infrastructure/repositories/in-memory-content-template.repository';
import { PublishingContentTemplate } from '../../../template/domain/entities/publishing-template.entity';

function harness(): PublishingSessionUseCases {
  return new PublishingSessionUseCases(
    new InMemoryPublishingSessionRepository(),
    new InMemoryContentTemplateRepository(),
  );
}

describe('PublishingSessionUseCases', () => {
  it('creates ad-hoc sessions and toggles sources without creating them', async () => {
    const useCases = harness();
    const created = await useCases.create({ id: 'tab-a', name: 'Tab A' });
    expect(created.templateId).toBeNull();
    expect(created.canConsume()).toBe(true);
    const toggled = await useCases.setSourceToggle('tab-a', 'src-9', false);
    expect(toggled.isSourceOn('src-9')).toBe(false);
    await useCases.deactivate('tab-a');
    await expect(useCases.get('tab-a')).resolves.toMatchObject({
      active: false,
    });
  });

  it('loads a template snapshot at creation; unknown templates 404', async () => {
    const templates = new InMemoryContentTemplateRepository();
    await templates.save(
      PublishingContentTemplate.create({
        id: 'brief',
        name: 'Brief',
        sourceIds: ['src-a'],
        keywordIds: ['kw-1'],
        targets: ['telegram'],
        botBindings: [{ botId: 'bot-1', target: 'telegram', chatId: '@news' }],
      }),
    );
    const useCases = new PublishingSessionUseCases(
      new InMemoryPublishingSessionRepository(),
      templates,
    );
    const loaded = await useCases.create({
      name: 'From Brief',
      templateId: 'brief',
    });
    expect(loaded.templateId).toBe('brief');
    expect(loaded.isSourceOn('src-a')).toBe(true);
    expect(loaded.isKeywordEligible('kw-1')).toBe(true);
    expect(loaded.targetsFor('telegram')).toEqual([
      { botId: 'bot-1', chatId: '@news' },
    ]);
    await expect(
      useCases.create({ name: 'Bad', templateId: 'missing' }),
    ).rejects.toThrow('unknown template');
  });
});
