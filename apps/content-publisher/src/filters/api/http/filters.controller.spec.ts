import { Test } from '@nestjs/testing';
import { FiltersController } from './filters.controller';
import { ChannelFilterRepository } from '../../application/ports/channel-filter.repository';
import { ContentFilterUseCases } from '../../application/use-cases/content-filter.use-cases';
import { ChannelContentFilterConfig } from '../../domain/channel-content-filter-config.entity';

describe('FiltersController', () => {
  async function build() {
    const store = new Map<string, ChannelContentFilterConfig>();
    const repo: ChannelFilterRepository = {
      findFiltersByChannelId: jest.fn(async (channelId: string) =>
        [...store.values()]
          .filter((f) => f.channelId === channelId)
          .map((f) => ({
            pattern: f.pattern,
            replacement: f.replacement,
            flags: f.flags,
            priority: f.priority,
            isActive: f.isActive,
            createdAt: f.createdAt,
          })),
      ),
      findAll: jest.fn(async () => [...store.values()]),
      findById: jest.fn(async (id: string) => store.get(id) ?? null),
      save: jest.fn(async (cfg: ChannelContentFilterConfig) => {
        store.set(cfg.id, cfg);
      }),
      delete: jest.fn(async (id: string) => store.delete(id)),
    };
    const module = await Test.createTestingModule({
      controllers: [FiltersController],
      providers: [
        ContentFilterUseCases,
        { provide: ChannelFilterRepository, useValue: repo },
      ],
    }).compile();
    return { module, controller: module.get(FiltersController) };
  }

  it('creates, lists, toggles and deletes a per-channel filter', async () => {
    const { controller, module } = await build();
    const created = await controller.create('-1001', {
      pattern: 'BTC',
      replacement: 'bitcoin',
      flags: 'gi',
      priority: 0,
      isActive: true,
    });
    expect(created.channelId).toBe('-1001');
    expect(await controller.list('-1001')).toHaveLength(1);
    const toggled = await controller.toggle(created.id);
    expect(toggled.isActive).toBe(false);
    await controller.remove(created.id);
    expect(await controller.list('-1001')).toHaveLength(0);
    await module.close();
  });

  it('returns 404 for unknown filter ids', async () => {
    const { controller, module } = await build();
    await expect(controller.toggle('missing')).rejects.toMatchObject({
      status: 404,
    });
    await expect(controller.remove('missing')).rejects.toMatchObject({
      status: 404,
    });
    await module.close();
  });
});
