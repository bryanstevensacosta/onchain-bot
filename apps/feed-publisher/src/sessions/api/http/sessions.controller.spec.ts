import { SessionsController } from './sessions.controller';
import { PublishingSessionUseCases } from '../../application/use-cases/publishing-session.use-cases';
import { InMemoryPublishingSessionRepository } from '../../infrastructure/repositories/in-memory-publishing-session.repository';
import { InMemoryContentTemplateRepository } from '../../../template/infrastructure/repositories/in-memory-content-template.repository';

describe('SessionsController', () => {
  it('creates, toggles, and deactivates sessions via the frontend-backed API', async () => {
    const controller = new SessionsController(
      new PublishingSessionUseCases(
        new InMemoryPublishingSessionRepository(),
        new InMemoryContentTemplateRepository(),
      ),
    );
    const created = await controller.create({ name: 'Tab A' });
    expect(created.id).toBe('tab-a');
    const toggled = await controller.setSourceToggle('tab-a', {
      sourceId: 'src-a',
      enabled: false,
    });
    expect(toggled.sourceToggles['src-a']).toBe(false);
    const off = await controller.deactivate('tab-a');
    expect(off.canPublish).toBe(false);
    await expect(controller.list()).resolves.toHaveLength(1);
  });
});
