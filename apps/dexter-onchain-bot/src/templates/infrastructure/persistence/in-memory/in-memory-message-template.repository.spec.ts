import { MessageTemplate } from '@/templates/domain/message-template.entity';
import { InMemoryMessageTemplateRepository } from '@/templates/infrastructure/persistence/in-memory/in-memory-message-template.repository';
import { MessageTemplateDuplicateError } from '@/templates/infrastructure/persistence/message-template.errors';

describe('in-memory message-template repository (todo 3)', () => {
  const make = (
    overrides?: Partial<{
      command: 'ca' | 'x' | 'z' | 'c' | 'cc' | 'bare';
      name: string;
      bodyMarkdown: string;
      isActive: boolean;
    }>,
  ): MessageTemplate =>
    MessageTemplate.create({
      command: overrides?.command ?? 'ca',
      name: overrides?.name ?? 'full-dexter-v1',
      bodyMarkdown: overrides?.bodyMarkdown ?? '{{symbol}} body',
      isActive: overrides?.isActive,
    });

  it('starts empty (seed rows belong to the todo-9 seed service)', async () => {
    const repo = new InMemoryMessageTemplateRepository();
    await expect(repo.findAll()).resolves.toEqual([]);
    await expect(repo.findActiveByCommand('ca')).resolves.toBeNull();
  });

  it('save + findActive + delete roundtrip', async () => {
    const repo = new InMemoryMessageTemplateRepository();
    const template = make();
    await repo.save(template);
    await expect(repo.findById(template.id)).resolves.toBe(template);
    await expect(repo.findAll()).resolves.toEqual([template]);
    await expect(repo.findByCommand('ca')).resolves.toEqual([template]);
    await expect(repo.findByCommand('x')).resolves.toEqual([]);

    template.activate();
    await repo.save(template);
    await expect(repo.findActiveByCommand('ca')).resolves.toBe(template);

    await expect(repo.delete(template.id)).resolves.toBe(true);
    await expect(repo.findById(template.id)).resolves.toBeNull();
    await expect(repo.findActiveByCommand('ca')).resolves.toBeNull();
    await expect(repo.delete(template.id)).resolves.toBe(false);
  });

  it('duplicate (command, name) throws a domain error (never raw)', async () => {
    const repo = new InMemoryMessageTemplateRepository();
    await repo.save(make());
    await expect(repo.save(make())).rejects.toBeInstanceOf(
      MessageTemplateDuplicateError,
    );
    await expect(repo.save(make())).rejects.toMatchObject({
      code: 'MESSAGE_TEMPLATE_DUPLICATE',
    });
  });

  it('same name on a different command is allowed', async () => {
    const repo = new InMemoryMessageTemplateRepository();
    await repo.save(make({ command: 'ca', name: 'shared' }));
    await expect(
      repo.save(make({ command: 'x', name: 'shared' })),
    ).resolves.toBeDefined();
  });

  it('second concurrent activate loses with a domain error (one winner)', async () => {
    const repo = new InMemoryMessageTemplateRepository();
    const first = make({ name: 'a', isActive: true });
    const second = make({ name: 'b', isActive: true });
    await repo.save(first);
    await expect(repo.save(second)).rejects.toBeInstanceOf(
      MessageTemplateDuplicateError,
    );
    await expect(repo.findActiveByCommand('ca')).resolves.toBe(first);
  });

  it('deactivating the winner unblocks a later activate', async () => {
    const repo = new InMemoryMessageTemplateRepository();
    const first = make({ name: 'a', isActive: true });
    const second = make({ name: 'b' });
    await repo.save(first);
    await repo.save(second);
    first.deactivate();
    await repo.save(first);
    second.activate();
    await expect(repo.save(second)).resolves.toBe(second);
    await expect(repo.findActiveByCommand('ca')).resolves.toBe(second);
  });

  it('save upserts by id (re-save after rename keeps one row)', async () => {
    const repo = new InMemoryMessageTemplateRepository();
    const template = make();
    await repo.save(template);
    template.rename('renamed');
    await repo.save(template);
    const all = await repo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.name).toBe('renamed');
    expect(all[0]?.version).toBe(2);
  });
});
