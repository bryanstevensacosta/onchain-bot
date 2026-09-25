import { ConflictException, NotFoundException } from '@nestjs/common';
import { SourcesController } from './sources.controller';
import { RegisterNewsSourceUseCase } from '../../application/use-cases/register-news-source.use-case';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    channelId: '-1001',
    handle: 'watcher',
    title: 'Watcher',
    type: 'crypto-news',
    isActive: true,
    lifecycleStatus: 'ACTIVE',
    addedAt: new Date('2026-09-21T10:00:00Z'),
    updatedAt: new Date('2026-09-21T10:05:00Z'),
    ...overrides,
  };
}

describe('SourcesController (feed source catalog)', () => {
  const sourceRepo: any = {
    findAll: jest.fn(),
    findAllActive: jest.fn(),
    findByChannelId: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const registerSourceUseCase: any = { execute: jest.fn() };
  const controller = new SourcesController(sourceRepo, registerSourceUseCase);

  beforeEach(() => jest.clearAllMocks());

  it('addSource delegates to the register use case (201 path)', async () => {
    registerSourceUseCase.execute.mockResolvedValue({
      channelId: '-1001',
      title: 'Watcher',
    });
    const res = await controller.addSource({
      channelId: '-1001',
      title: 'Watcher',
    });
    expect(registerSourceUseCase.execute).toHaveBeenCalledWith({
      channelId: '-1001',
      title: 'Watcher',
    });
    expect(res.channelId).toBe('-1001');
  });

  it('addSource surfaces duplicate registration as 409', async () => {
    registerSourceUseCase.execute.mockRejectedValue(
      new ConflictException('already exists'),
    );
    await expect(
      controller.addSource({ channelId: '-1001', title: 'Watcher' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('getSources returns all rows with type passthrough', async () => {
    sourceRepo.findAll.mockResolvedValue([
      makeRow(),
      makeRow({ channelId: '-1002', type: 'kol', isActive: false }),
    ]);
    const res = await controller.getSources(undefined);
    expect(res).toHaveLength(2);
    expect(res[0].type).toBe('crypto-news');
    expect(res[1].type).toBe('kol');
  });

  it('getSources filters by type=kol', async () => {
    sourceRepo.findAll.mockResolvedValue([
      makeRow(),
      makeRow({ channelId: '-1002', type: 'kol' }),
    ]);
    const res = await controller.getSources('kol');
    expect(res).toHaveLength(1);
    expect(res[0].channelId).toBe('-1002');
  });

  it('getSources projects avatarUrl per source (P19)', async () => {
    sourceRepo.findAll.mockResolvedValue([
      makeRow(),
      makeRow({ channelId: '-1002', type: 'kol' }),
    ]);
    const res = await controller.getSources(undefined);
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ avatarUrl: '/api/kol-avatar/-1001' });
    expect(res[1]).toMatchObject({ avatarUrl: '/api/kol-avatar/-1002' });
  });

  it('getSources rejects an unknown type with 400', async () => {
    await expect(controller.getSources('rss')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('getActiveSourceIds maps to channel ids (type filter passes through)', async () => {
    sourceRepo.findAllActive.mockResolvedValue([
      { channelId: '-1001', title: 'Watcher' },
    ]);
    const res = await controller.getActiveSourceIds('crypto-news');
    expect(res).toEqual(['-1001']);
    expect(sourceRepo.findAllActive).toHaveBeenCalledWith('crypto-news');
  });

  it('updateSource patches title/handle and returns the view', async () => {
    sourceRepo.findByChannelId.mockResolvedValue(makeRow());
    sourceRepo.save.mockImplementation(async (s: any) => s);
    const res = await controller.updateSource('-1001', {
      title: 'Renamed',
      handle: 'renamed',
    });
    expect(res.title).toBe('Renamed');
    expect(res.handle).toBe('renamed');
    expect(res.type).toBe('crypto-news');
  });

  it('updateSource throws 404 for unknown channels', async () => {
    sourceRepo.findByChannelId.mockResolvedValue(null);
    await expect(
      controller.updateSource('-1009', { title: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('toggleSource flips isActive', async () => {
    sourceRepo.findByChannelId.mockResolvedValue(makeRow({ isActive: true }));
    sourceRepo.save.mockImplementation(async (s: any) => s);
    const res = await controller.toggleSource('-1001');
    expect(res).toEqual({
      channelId: '-1001',
      isActive: false,
      avatarUrl: '/api/kol-avatar/-1001',
    });
  });

  it('toggleSource throws 404 for unknown channels', async () => {
    sourceRepo.findByChannelId.mockResolvedValue(null);
    await expect(controller.toggleSource('-1009')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deleteSource removes the row and returns success', async () => {
    sourceRepo.findByChannelId.mockResolvedValue(makeRow());
    const res = await controller.deleteSource('-1001');
    expect(sourceRepo.delete).toHaveBeenCalledWith('-1001');
    expect(res).toEqual({ success: true });
  });

  it('deleteSource throws 404 for unknown channels', async () => {
    sourceRepo.findByChannelId.mockResolvedValue(null);
    await expect(controller.deleteSource('-1009')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('RegisterNewsSourceUseCase (feed repo wiring + batch)', () => {
  function fakeRepo(rows: Record<string, any> = {}) {
    const store = new Map<string, any>(Object.entries(rows));
    return {
      store,
      findByChannelId: jest.fn(async (id: string) => store.get(id) ?? null),
      create: jest.fn(
        (
          channelId: string,
          title: string,
          handle?: string,
          type = 'crypto-news',
        ) => ({
          channelId,
          title,
          handle: handle ?? null,
          type,
          isActive: true,
          lifecycleStatus: 'ACTIVE',
          lastIngestedAt: null,
          addedAt: new Date('2026-09-21T10:00:00Z'),
        }),
      ),
      save: jest.fn(async (s: any) => {
        store.set(s.channelId, s);
        return s;
      }),
      delete: jest.fn(async (id: string) => {
        store.delete(id);
      }),
    };
  }

  const listener: any = {
    resolveChannelMetadata: jest.fn(async () => ({
      title: 'Resolved',
      handle: 'resolved',
    })),
  };

  beforeEach(() => jest.clearAllMocks());

  it('execute creates a crypto-news source by default', async () => {
    const repo = fakeRepo();
    const useCase = new RegisterNewsSourceUseCase(repo as any, listener);
    const out = await useCase.execute({ channelId: '123', title: 'T' });
    expect(out.channelId).toBe('-100123');
    expect(out.type).toBe('crypto-news');
  });

  it('execute rejects invalid channelId with 400 (not 500)', async () => {
    const repo = fakeRepo();
    const useCase = new RegisterNewsSourceUseCase(repo as any, listener);
    await expect(
      useCase.execute({ channelId: 'not-a-number', title: 'T' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('execute rejects duplicates with 409', async () => {
    const repo = fakeRepo({ '-1001': makeRow() });
    const useCase = new RegisterNewsSourceUseCase(repo as any, listener);
    await expect(
      useCase.execute({ channelId: '-1001', title: 'T' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('executeBatch creates missing rows and reports created count', async () => {
    const repo = fakeRepo();
    const useCase = new RegisterNewsSourceUseCase(repo as any, listener);
    const out = await useCase.executeBatch({
      sources: [
        { channelId: '-1001', title: 'News', type: 'crypto-news' },
        { channelId: '-1002', title: 'Kol One', type: 'kol' },
      ],
    });
    expect(out).toMatchObject({ created: 2, updated: 0, total: 2 });
    expect(repo.store.get('-1002').type).toBe('kol');
  });

  it('executeBatch is idempotent: re-run updates nothing', async () => {
    const repo = fakeRepo();
    const useCase = new RegisterNewsSourceUseCase(repo as any, listener);
    const payload = {
      sources: [
        { channelId: '-1001', title: 'News', type: 'crypto-news' as const },
      ],
    };
    const first = await useCase.executeBatch(payload);
    const second = await useCase.executeBatch(payload);
    expect(first).toMatchObject({ created: 1, updated: 0, total: 1 });
    expect(second).toMatchObject({ created: 0, updated: 0, total: 1 });
  });

  it('executeBatch updates changed fields on existing rows', async () => {
    const repo = fakeRepo({ '-1001': makeRow() });
    const useCase = new RegisterNewsSourceUseCase(repo as any, listener);
    const out = await useCase.executeBatch({
      sources: [{ channelId: '-1001', title: 'Renamed' }],
    });
    expect(out).toMatchObject({ created: 0, updated: 1, total: 1 });
    expect(repo.store.get('-1001').title).toBe('Renamed');
  });

  it('executeBatch validates everything before writing (400 leaves table untouched)', async () => {
    const repo = fakeRepo();
    const useCase = new RegisterNewsSourceUseCase(repo as any, listener);
    await expect(
      useCase.executeBatch({
        sources: [
          { channelId: '-1001', title: 'News' },
          { channelId: 'bad-id', title: 'Broken' },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.store.size).toBe(0);
  });

  it('executeBatch rejects empty arrays and oversized batches with 400', async () => {
    const repo = fakeRepo();
    const useCase = new RegisterNewsSourceUseCase(repo as any, listener);
    await expect(useCase.executeBatch({ sources: [] })).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      useCase.executeBatch({
        sources: Array.from({ length: 501 }, (_, i) => ({
          channelId: `-100${i}`,
          title: 'T',
        })),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
