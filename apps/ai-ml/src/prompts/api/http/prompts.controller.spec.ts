import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PromptsModule } from '@/prompts/prompts.module';
import { PromptsController } from './prompts.controller';

/**
 * Failing-first HTTP spec (ai-ml todo 1): CRUD + version history +
 * activate + resolve over the controller. RED until it exists.
 * Auth guard is fail-open dev (no keys configured), so the
 * controller is exercised directly without HTTP transport.
 */
describe('PromptsController (todo 1)', () => {
  const build = async (): Promise<PromptsController> => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), PromptsModule],
    }).compile();
    return module.get(PromptsController);
  };

  it('CRUD + history + rollback over HTTP surface', async () => {
    const ctl = await build();
    const created = await ctl.create({ name: 'http-tpl', content: 'Hi {{who}}' });
    expect(created.version).toBe(1);

    const second = await ctl.createVersion('http-tpl', { content: 'Hi {{who}} v2' });
    expect(second.version).toBe(2);

    const history = await ctl.listVersions('http-tpl');
    expect(history.map((t) => t.version)).toEqual([1, 2]);

    const pinned = await ctl.getByName('http-tpl', '1');
    expect(pinned.version).toBe(1);

    const rolled = await ctl.activate('http-tpl', '1');
    expect(rolled.isActive).toBe(true);
    const active = await ctl.getActive('http-tpl');
    expect(active.version).toBe(1);
  });

  it('resolve falls back to the migrated feed-publisher template', async () => {
    const ctl = await build();
    const out = await ctl.resolve({ name: 'default-feed' });
    expect(out.source).toBe('legacy-fallback');
    expect(out.template.name).toBe('default-feed');
  });
});
