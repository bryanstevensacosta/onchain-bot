import { ContentTemplateUseCases } from './content-template.use-cases';
import { InMemoryContentTemplateRepository } from '../../infrastructure/repositories/in-memory-content-template.repository';

describe('ContentTemplateUseCases', () => {
  it('creates, activates, and removes templates (409 on duplicate id)', async () => {
    const useCases = new ContentTemplateUseCases(
      new InMemoryContentTemplateRepository(),
    );
    await useCases.create({
      id: 'brief',
      name: 'Morning Brief',
      targets: ['telegram'],
    });
    await expect(
      useCases.create({ id: 'brief', name: 'Dup', targets: ['telegram'] }),
    ).rejects.toThrow('already exists');
    const deactivated = await useCases.deactivate('brief');
    expect(deactivated.active).toBe(false);
    const activated = await useCases.activate('brief');
    expect(activated.active).toBe(true);
    await useCases.remove('brief');
    await expect(useCases.get('brief')).rejects.toThrow('unknown template');
  });
});
