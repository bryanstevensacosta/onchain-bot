import { ContentTemplatesController } from './content-templates.controller';
import { ContentTemplateUseCases } from '@/template/application/use-cases/content-template.use-cases';
import { InMemoryContentTemplateRepository } from '@/template/infrastructure/repositories/in-memory-content-template.repository';

describe('ContentTemplatesController', () => {
  it('creates and lists templates via the frontend-backed API', async () => {
    const controller = new ContentTemplatesController(
      new ContentTemplateUseCases(new InMemoryContentTemplateRepository()),
    );
    const created = await controller.create({
      name: 'Brief',
      targets: ['telegram'],
    });
    expect(created.id).toBe('brief');
    const all = await controller.list();
    expect(all).toHaveLength(1);
    const toggled = await controller.deactivate('brief');
    expect(toggled.active).toBe(false);
  });
});
