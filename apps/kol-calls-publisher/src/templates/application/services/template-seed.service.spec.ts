import { InMemoryTemplateRepository } from '../../infrastructure/repositories/in-memory-template.repository';
import { TemplateSeedService } from './template-seed.service';

describe('TemplateSeedService vip-calls seed (P14, failing-first)', () => {
  it('seeds a dashboard-only vip-calls template once (no bot, all sources)', async () => {
    const templates = new InMemoryTemplateRepository();
    const seed = new TemplateSeedService(templates);
    await seed.onModuleInit();
    await seed.onModuleInit();
    const template = await templates.findById('vip-calls');
    expect(template).not.toBeNull();
    expect(template?.name).toBe('vip-calls');
    expect(template?.active).toBe(true);
    expect(template?.botId).toBeNull();
    expect(template?.kolSourceIds).toEqual([]);
    expect(template?.canPublish()).toBe(false);
    expect(await templates.count()).toBe(1);
  });
});
