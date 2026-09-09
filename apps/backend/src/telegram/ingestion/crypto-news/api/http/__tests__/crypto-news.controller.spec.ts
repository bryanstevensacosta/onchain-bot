import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CryptoNewsController } from 'telegram/ingestion/crypto-news/api/http/crypto-news.controller';
import {
  CreateFilterUseCase,
  ListFiltersUseCase,
  UpdateFilterUseCase,
  DeleteFilterUseCase,
  ToggleFilterUseCase,
} from 'telegram/ingestion/crypto-news/application/handlers/filters';

interface ControllerHarness {
  controller: CryptoNewsController;
  createFilter: { execute: jest.Mock };
  listFilters: { execute: jest.Mock };
  updateFilter: { execute: jest.Mock };
  deleteFilter: { execute: jest.Mock };
  toggleFilter: { execute: jest.Mock };
}

async function buildController(): Promise<ControllerHarness> {
  const createFilter = { execute: jest.fn() };
  const listFilters = { execute: jest.fn() };
  const updateFilter = { execute: jest.fn() };
  const deleteFilter = { execute: jest.fn() };
  const toggleFilter = { execute: jest.fn() };

  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [CryptoNewsController],
    providers: [
      { provide: CreateFilterUseCase, useValue: createFilter },
      { provide: ListFiltersUseCase, useValue: listFilters },
      { provide: UpdateFilterUseCase, useValue: updateFilter },
      { provide: DeleteFilterUseCase, useValue: deleteFilter },
      { provide: ToggleFilterUseCase, useValue: toggleFilter },
    ],
  }).compile();

  return {
    controller: moduleRef.get(CryptoNewsController),
    createFilter,
    listFilters,
    updateFilter,
    deleteFilter,
    toggleFilter,
  };
}

describe('CryptoNewsController (post db-separation todo 4: filters CRUD only)', () => {
  it('exposes no legacy ingestion-owned routes', async () => {
    const { controller } = await buildController();
    const legacy = [
      'listMessages',
      'getMessage',
      'listSources',
      'listActiveSourceIds',
      'addSource',
      'backfill',
      'getMedia',
    ];
    for (const method of legacy) {
      expect(
        (controller as unknown as Record<string, unknown>)[method],
      ).toBeUndefined();
    }
  });

  it('POST sources/:channelId/filters delegates to CreateFilterUseCase', async () => {
    const { controller, createFilter } = await buildController();
    const created = { id: 'f1', channelId: '123', pattern: 'x' };
    createFilter.execute.mockResolvedValue(created);

    const result = await controller.createFilter('123', {
      pattern: 'x',
      replacement: '',
      flags: 'gi',
      priority: 0,
      isActive: true,
    });

    expect(result).toBe(created);
    expect(createFilter.execute).toHaveBeenCalledWith({
      channelId: '123',
      pattern: 'x',
      replacement: '',
      flags: 'gi',
      priority: 0,
      isActive: true,
    });
  });

  it('GET sources/:channelId/filters delegates to ListFiltersUseCase', async () => {
    const { controller, listFilters } = await buildController();
    listFilters.execute.mockResolvedValue([{ id: 'f1' }]);

    const result = await controller.getFilters('123');

    expect(result).toEqual([{ id: 'f1' }]);
    expect(listFilters.execute).toHaveBeenCalledWith('123');
  });

  it('PUT filters/:id delegates to UpdateFilterUseCase', async () => {
    const { controller, updateFilter } = await buildController();
    updateFilter.execute.mockResolvedValue({ id: 'f1', priority: 5 });

    const result = await controller.updateFilter('f1', { priority: 5 });

    expect(result).toEqual({ id: 'f1', priority: 5 });
    expect(updateFilter.execute).toHaveBeenCalledWith({
      id: 'f1',
      priority: 5,
    });
  });

  it('DELETE filters/:id throws 404 when use case reports false', async () => {
    const { controller, deleteFilter } = await buildController();
    deleteFilter.execute.mockResolvedValue(false);

    await expect(controller.deleteFilterEndpoint('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('DELETE filters/:id resolves void when use case reports true', async () => {
    const { controller, deleteFilter } = await buildController();
    deleteFilter.execute.mockResolvedValue(true);

    await expect(
      controller.deleteFilterEndpoint('f1'),
    ).resolves.toBeUndefined();
    expect(deleteFilter.execute).toHaveBeenCalledWith('f1');
  });

  it('PATCH filters/:id/toggle delegates to ToggleFilterUseCase', async () => {
    const { controller, toggleFilter } = await buildController();
    toggleFilter.execute.mockResolvedValue({ id: 'f1', isActive: false });

    const result = await controller.toggleFilterEndpoint('f1');

    expect(result).toEqual({ id: 'f1', isActive: false });
    expect(toggleFilter.execute).toHaveBeenCalledWith('f1');
  });

  it('maps "not found" errors to 404 on create', async () => {
    const { controller, createFilter } = await buildController();
    createFilter.execute.mockRejectedValue(new Error('Filter x not found'));

    await expect(
      controller.createFilter('123', {
        pattern: 'x',
        replacement: '',
        flags: 'gi',
        priority: 0,
        isActive: true,
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
