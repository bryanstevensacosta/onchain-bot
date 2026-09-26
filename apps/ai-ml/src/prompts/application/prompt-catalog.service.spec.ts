import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PromptsModule } from '../prompts.module';
import { PromptCatalogService } from './prompt-catalog.service';

/**
 * Failing-first service spec (ai-ml todo 1): versioning + activate
 * (rollback) + dual-read fallback. RED until the catalog exists.
 */
describe('PromptCatalogService (todo 1)', () => {
  const build = async (): Promise<PromptCatalogService> => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), PromptsModule],
    }).compile();
    return module.get(PromptCatalogService);
  };

  it('creates v1 active, versions accumulate, activate rolls back', async () => {
    const svc = await build();
    const v1 = await svc.createTemplate({
      name: 'feed-rewrite',
      content: 'Rewrite {{original}}',
      contentType: 'global',
    });
    expect(v1.version).toBe(1);
    expect(v1.isActive).toBe(true);
    expect(v1.variables).toEqual(['original']);

    const v2 = await svc.createVersion('feed-rewrite', {
      content: 'Rewrite in Spanish {{original}} {{title}}',
    });
    expect(v2.version).toBe(2);
    expect(v2.isActive).toBe(true);

    const history = await svc.listVersions('feed-rewrite');
    expect(history.map((t) => t.version)).toEqual([1, 2]);
    expect(history.find((t) => t.version === 2)?.isActive).toBe(true);

    // Adversarial: rollback to v1 works and sticks.
    const rolled = await svc.activateVersion('feed-rewrite', 1);
    expect(rolled.version).toBe(1);
    expect(rolled.isActive).toBe(true);
    const active = await svc.getActive('feed-rewrite');
    expect(active.version).toBe(1);
    expect((await svc.listVersions('feed-rewrite')).find((t) => t.version === 2)?.isActive).toBe(
      false,
    );
  });

  it('GET by name+version returns the pinned version', async () => {
    const svc = await build();
    await svc.createTemplate({ name: 'pinned', content: 'v1 {{a}}' });
    await svc.createVersion('pinned', { content: 'v2 {{b}}' });
    const got = await svc.get('pinned', 1);
    expect(got.content).toBe('v1 {{a}}');
    expect(got.variables).toEqual(['a']);
  });

  it('dual-read: ai-ml first, legacy fallback for migrated names', async () => {
    const svc = await build();
    const local = await svc.resolve('default-feed');
    expect(local.source).toBe('legacy-fallback');
    expect(local.template.contentType).toBe('global');
    expect(local.template.variables).toContain('original');

    await svc.createTemplate({
      name: 'default-feed',
      content: 'ai-ml owned {{original}}',
      contentType: 'global',
    });
    const owned = await svc.resolve('default-feed');
    expect(owned.source).toBe('ai-ml');
    expect(owned.template.content).toBe('ai-ml owned {{original}}');
  });

  it('dual-read: unknown names resolve to not-found', async () => {
    const svc = await build();
    await expect(svc.resolve('no-such-template')).rejects.toThrow(/not found/i);
  });
});
