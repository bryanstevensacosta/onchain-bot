import {
  PublishingSession,
  defaultSessionName,
} from './domain/entities/publishing-session.entity';
import { PublishingSessionUseCases } from '@/sessions/application/use-cases/publishing-session.use-cases';
import { SessionsController } from '@/sessions/api/http/sessions.controller';
import { PublishSessionMessageUseCase } from '@/sessions/application/use-cases/publish-session-message.use-case';
import { SessionPublishAuthorizer } from '@/sessions/application/services/session-publish-authorizer.service';
import { PublishRateLimiter } from '@/sessions/application/services/publish-rate-limiter.service';
import { RecordingSessionPublisher } from '@/sessions/infrastructure/publish/recording-session-publisher.adapter';
import { PublishAuditLog } from '@/sessions/application/services/publish-audit-log.service';
import { InMemoryPublishingSessionRepository } from '@/sessions/infrastructure/repositories/in-memory-publishing-session.repository';
import { InMemoryContentTemplateRepository } from '@/template/infrastructure/repositories/in-memory-content-template.repository';
import { InMemoryTemplateBotRepository } from '@/template/infrastructure/repositories/in-memory-template-bot.repository';
import { PublishingContentTemplate } from '@/template/domain/entities/publishing-template.entity';
import { backfillSessionNames } from '@/sessions/infrastructure/persistence/session-name-migration';

function harness(templates = new InMemoryContentTemplateRepository()): {
  useCases: PublishingSessionUseCases;
  controller: SessionsController;
} {
  const sessions = new InMemoryPublishingSessionRepository();
  const useCases = new PublishingSessionUseCases(sessions, templates);
  const controller = new SessionsController(
    useCases,
    new PublishSessionMessageUseCase(
      sessions,
      new SessionPublishAuthorizer(new InMemoryTemplateBotRepository()),
      new PublishRateLimiter(10, 60_000),
      new RecordingSessionPublisher(),
      new PublishAuditLog(),
    ),
  );
  return { useCases, controller };
}

describe('session display name', () => {
  it('defaults to ad-hoc-<n> when no name and no template', async () => {
    const { useCases } = harness();
    const first = await useCases.create({});
    expect(first.name).toBe('ad-hoc-1');
    const second = await useCases.create({});
    expect(second.name).toBe('ad-hoc-2');
  });

  it('defaults to <template-name>-<n> when loaded from a template', async () => {
    const templates = new InMemoryContentTemplateRepository();
    await templates.save(
      PublishingContentTemplate.create({
        id: 'brief',
        name: 'Brief',
        sourceIds: [],
        keywordIds: [],
        targets: ['telegram'],
      }),
    );
    const { useCases } = harness(templates);
    const loaded = await useCases.create({ templateId: 'brief' });
    expect(loaded.name).toBe('Brief-1');
  });

  it('keeps a user-provided name', async () => {
    const { useCases } = harness();
    const created = await useCases.create({ name: 'Morning tab' });
    expect(created.name).toBe('Morning tab');
  });

  it('rejects empty names on create and rename', async () => {
    const { useCases } = harness();
    await expect(useCases.create({ name: '   ' })).rejects.toThrow(
      'must not be empty',
    );
    const created = await useCases.create({ name: 'Tab A' });
    await expect(useCases.rename(created.id, '')).rejects.toThrow(
      'must not be empty',
    );
    await expect(useCases.update(created.id, { name: '  ' })).rejects.toThrow(
      'must not be empty',
    );
  });

  it('rejects overlong names but accepts the 80-char boundary', async () => {
    const { useCases } = harness();
    const boundary = 'n'.repeat(80);
    const created = await useCases.create({ name: boundary });
    expect(created.name).toBe(boundary);
    await expect(useCases.create({ name: 'n'.repeat(81) })).rejects.toThrow(
      'at most 80',
    );
    await expect(useCases.rename(created.id, 'n'.repeat(81))).rejects.toThrow(
      'at most 80',
    );
  });

  it('is editable via rename and PATCH update', async () => {
    const { useCases } = harness();
    const created = await useCases.create({ name: 'Old' });
    const renamed = await useCases.rename(created.id, 'New');
    expect(renamed.name).toBe('New');
    const patched = await useCases.update(created.id, { name: 'Newer' });
    expect(patched.name).toBe('Newer');
  });

  it('allows duplicate names while ids stay unique', async () => {
    const { useCases } = harness();
    const first = await useCases.create({ id: 'tab-1', name: 'Same' });
    const second = await useCases.create({ id: 'tab-2', name: 'Same' });
    expect(first.name).toBe('Same');
    expect(second.name).toBe('Same');
    expect(first.id).not.toBe(second.id);
  });

  it('exposes the name in the API views (create/list/get/update)', async () => {
    const { controller } = harness();
    const created = await controller.create({ name: 'Tab A' });
    expect(created.name).toBe('Tab A');
    const listed = await controller.list();
    expect(listed[0].name).toBe('Tab A');
    const fetched = await controller.get(created.id);
    expect(fetched.name).toBe('Tab A');
    const updated = await controller.update(created.id, { name: 'Tab B' });
    expect(updated.name).toBe('Tab B');
  });

  it('builds defaults from the template name or ad-hoc', () => {
    expect(defaultSessionName('Brief', 2)).toBe('Brief-2');
    expect(defaultSessionName(null, 1)).toBe('ad-hoc-1');
    expect(defaultSessionName('  ', 3)).toBe('ad-hoc-3');
  });

  it('entity create without a name falls back to ad-hoc-1', () => {
    expect(PublishingSession.create({}).name).toBe('ad-hoc-1');
  });

  it('backfills legacy rows with missing or empty names', () => {
    const { rows, touched } = backfillSessionNames([
      { id: 'a', name: 'Kept' },
      { id: 'b', name: '' },
      { id: 'c', name: null, templateName: 'Brief' },
      { id: 'd', name: '  ' },
    ]);
    expect(touched).toBe(3);
    expect(rows).toEqual([
      { id: 'a', name: 'Kept' },
      { id: 'b', name: 'ad-hoc-2' },
      { id: 'c', name: 'Brief-3' },
      { id: 'd', name: 'ad-hoc-4' },
    ]);
  });
});
