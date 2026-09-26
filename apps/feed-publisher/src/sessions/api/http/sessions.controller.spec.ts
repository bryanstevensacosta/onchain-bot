import { SessionsController } from './sessions.controller';
import { PublishingSessionUseCases } from '../../application/use-cases/publishing-session.use-cases';
import { PublishSessionMessageUseCase } from '../../application/use-cases/publish-session-message.use-case';
import { PublishAuditLog } from '../../application/services/publish-audit-log.service';
import { PublishRateLimiter } from '../../application/services/publish-rate-limiter.service';
import { SessionPublishAuthorizer } from '../../application/services/session-publish-authorizer.service';
import { InMemoryPublishingSessionRepository } from '../../infrastructure/repositories/in-memory-publishing-session.repository';
import { RecordingSessionPublisher } from '../../infrastructure/publish/recording-session-publisher.adapter';
import { InMemoryContentTemplateRepository } from '../../../template/infrastructure/repositories/in-memory-content-template.repository';
import { InMemoryTemplateBotRepository } from '../../../template/infrastructure/repositories/in-memory-template-bot.repository';

describe('SessionsController', () => {
  it('creates, toggles, and deactivates sessions via the frontend-backed API', async () => {
    const sessions = new InMemoryPublishingSessionRepository();
    const bots = new InMemoryTemplateBotRepository();
    const controller = new SessionsController(
      new PublishingSessionUseCases(
        sessions,
        new InMemoryContentTemplateRepository(),
      ),
      new PublishSessionMessageUseCase(
        sessions,
        new SessionPublishAuthorizer(bots),
        new PublishRateLimiter(10, 60_000),
        new RecordingSessionPublisher(),
        new PublishAuditLog(),
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
