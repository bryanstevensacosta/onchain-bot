import {
  isKnownPlaceholder,
  placeholdersFor,
  TEMPLATE_COMMANDS,
} from '@/placeholders/domain/placeholder-registry';
import { MAX_BODY_LENGTH } from '@/templates/domain/message-template.validators';
import { InMemoryMessageTemplateRepository } from '@/templates/infrastructure/persistence/in-memory/in-memory-message-template.repository';
import {
  MESSAGE_TEMPLATE_SEEDS,
  MessageTemplateSeedService,
} from './message-template-seed.service';

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

const keysOf = (body: string): string[] => {
  const keys = new Set<string>();
  PLACEHOLDER_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PLACEHOLDER_PATTERN.exec(body)) !== null) {
    keys.add(match[1]);
  }
  return [...keys];
};

describe('MessageTemplateSeedService (todo 9)', () => {
  it('seeds 7 templates: every body uses only registry placeholders and fits ≤4000 chars', () => {
    expect(MESSAGE_TEMPLATE_SEEDS).toHaveLength(7);
    for (const seed of seeds()) {
      expect(seed.bodyMarkdown.length).toBeGreaterThan(0);
      expect(seed.bodyMarkdown.length).toBeLessThanOrEqual(MAX_BODY_LENGTH);
      for (const key of keysOf(seed.bodyMarkdown)) {
        expect(isKnownPlaceholder(seed.command, key)).toBe(true);
      }
      // Derived key is chainDisplay — the old name must not appear.
      expect(seed.bodyMarkdown).not.toContain('chainEmoji');
    }
  });

  it('covers all 6 template commands (ca seeds twice)', () => {
    const commands = MESSAGE_TEMPLATE_SEEDS.map((s) => s.command).sort();
    expect(commands).toEqual(['bare', 'c', 'ca', 'ca', 'cc', 'x', 'z']);
    expect([...TEMPLATE_COMMANDS].sort()).toEqual([
      'bare',
      'c',
      'ca',
      'cc',
      'x',
      'z',
    ]);
  });

  it('x + bare full bodies equal the ca full body (own rows, shared anatomy)', () => {
    const bodyOf = (command: string, name: string): string => {
      const seed = MESSAGE_TEMPLATE_SEEDS.find(
        (s) => s.command === command && s.name === name,
      );
      if (!seed) {
        throw new Error(`seed (${command}, ${name}) missing`);
      }
      return seed.bodyMarkdown;
    };
    expect(bodyOf('x', 'full-dexter-v1')).toBe(bodyOf('ca', 'full-dexter-v1'));
    expect(bodyOf('bare', 'bare-ca-v1')).toBe(bodyOf('ca', 'full-dexter-v1'));
  });

  it('double-run is idempotent: same count, 0 created on re-run, exactly 1 active per command', async () => {
    const service = new MessageTemplateSeedService(
      new InMemoryMessageTemplateRepository(),
    );
    const first = await service.runOnce();
    expect(first.created).toBe(7);
    expect(first.skipped).toBe(0);

    const second = await service.runOnce();
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(0);

    const repo = (
      service as unknown as {
        templates: InMemoryMessageTemplateRepository;
      }
    ).templates;
    expect((await repo.findAll()).length).toBe(7);
    for (const command of TEMPLATE_COMMANDS) {
      const active = await repo.findActiveByCommand(command);
      expect(active).not.toBeNull();
      const actives = (await repo.findByCommand(command)).filter(
        (t) => t.isActive,
      );
      expect(actives).toHaveLength(1);
    }
    // The first seed of each command won the vacuum activation.
    const caActive = await repo.findActiveByCommand('ca');
    expect(caActive?.name).toBe('full-dexter-v1');
  });

  it('never steals an operator active choice on re-boot', async () => {
    const repo = new InMemoryMessageTemplateRepository();
    const service = new MessageTemplateSeedService(repo);
    await service.runOnce();

    // Operator activates the compact template via controller semantics.
    const compact = (await repo.findByCommand('ca')).find(
      (t) => t.name === 'compact-rick-v1',
    );
    if (!compact) {
      throw new Error('compact seed missing');
    }
    const previous = await repo.findActiveByCommand('ca');
    if (!previous) {
      throw new Error('no active ca template after seed');
    }
    previous.deactivate();
    await repo.save(previous);
    compact.activate();
    compact.bumpVersion();
    await repo.save(compact);

    const rerun = await service.runOnce();
    expect(rerun.created).toBe(0);
    expect((await repo.findActiveByCommand('ca'))?.name).toBe(
      'compact-rick-v1',
    );
  });

  it('a seed body with an unknown placeholder is skipped without throwing', async () => {
    const service = new MessageTemplateSeedService(
      new InMemoryMessageTemplateRepository(),
    );
    const result = await service.runOnce([
      ...MESSAGE_TEMPLATE_SEEDS,
      { command: 'ca', name: 'broken-typo-v1', bodyMarkdown: 'oops {{typo}}' },
    ]);
    expect(result.created).toBe(7);
    expect(result.skipped).toBe(1);
    const repo = (
      service as unknown as {
        templates: InMemoryMessageTemplateRepository;
      }
    ).templates;
    expect((await repo.findAll()).length).toBe(7);
    // The rest still seeded and activated despite the bad row.
    expect(await repo.findActiveByCommand('ca')).not.toBeNull();
  });

  it('onApplicationBootstrap skips silently when DEXTER_SEED_TEMPLATES=false', async () => {
    const previous = process.env.DEXTER_SEED_TEMPLATES;
    process.env.DEXTER_SEED_TEMPLATES = 'false';
    try {
      const repo = new InMemoryMessageTemplateRepository();
      const service = new MessageTemplateSeedService(repo);
      await service.onApplicationBootstrap();
      expect((await repo.findAll()).length).toBe(0);
    } finally {
      if (previous === undefined) {
        delete process.env.DEXTER_SEED_TEMPLATES;
      } else {
        process.env.DEXTER_SEED_TEMPLATES = previous;
      }
    }
  });

  it('onApplicationBootstrap seeds when the flag is unset (dev default true)', async () => {
    const previous = process.env.DEXTER_SEED_TEMPLATES;
    delete process.env.DEXTER_SEED_TEMPLATES;
    try {
      const repo = new InMemoryMessageTemplateRepository();
      const service = new MessageTemplateSeedService(repo);
      await service.onApplicationBootstrap();
      expect((await repo.findAll()).length).toBe(7);
    } finally {
      if (previous === undefined) {
        delete process.env.DEXTER_SEED_TEMPLATES;
      } else {
        process.env.DEXTER_SEED_TEMPLATES = previous;
      }
    }
  });

  it('documents the valid placeholder list per command (placeholdersFor parity)', () => {
    for (const command of TEMPLATE_COMMANDS) {
      expect(placeholdersFor(command).length).toBeGreaterThan(0);
    }
  });
});

const seeds = (): typeof MESSAGE_TEMPLATE_SEEDS => MESSAGE_TEMPLATE_SEEDS;
