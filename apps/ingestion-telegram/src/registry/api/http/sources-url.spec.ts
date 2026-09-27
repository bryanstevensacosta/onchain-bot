import { SourcesController } from './sources.controller';

/**
 * Central todo 12 (P57): `url` (t.me) on every source view.
 */
describe('SourcesController url (central todo 12)', () => {
  function makeRow(overrides: Record<string, unknown> = {}) {
    return {
      channelId: '-1001',
      handle: 'watcher',
      title: 'Watcher',
      type: 'crypto-news',
      isActive: true,
      lifecycleStatus: 'ACTIVE',
      url: null,
      addedAt: new Date('2026-09-21T10:00:00Z'),
      updatedAt: new Date('2026-09-21T10:05:00Z'),
      ...overrides,
    };
  }

  const sourceRepo: any = {
    findAll: jest.fn(),
    findAllActive: jest.fn(),
    findByChannelId: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const registerSourceUseCase: any = { execute: jest.fn() };
  const telegramListener: any = {
    resolveChannelMetadata: jest.fn(async (input: string) => ({
      peerId: '-1007',
      title: 'Seven',
      handle: 'seven',
      kind: 'channel',
      isBot: false,
      input,
    })),
  };
  const controller = new SourcesController(
    sourceRepo,
    registerSourceUseCase,
    telegramListener,
  );

  beforeEach(() => jest.clearAllMocks());

  it('getSources falls back to the t.me url when the column is NULL', async () => {
    sourceRepo.findAll.mockResolvedValue([makeRow()]);
    const res = await controller.getSources(undefined);
    expect(res[0]).toMatchObject({ url: 'https://t.me/watcher' });
  });

  it('getSources serves NULL url for handle-less rows (no guessed URLs)', async () => {
    sourceRepo.findAll.mockResolvedValue([makeRow({ handle: null })]);
    const res = await controller.getSources(undefined);
    expect(res[0].url).toBeNull();
  });

  it('updateSource recomputes url on handle change', async () => {
    sourceRepo.findByChannelId.mockResolvedValue(makeRow());
    sourceRepo.save.mockImplementation(async (s: any) => s);
    const res = await controller.updateSource('-1001', { handle: 'renamed' });
    expect(res).toMatchObject({
      handle: 'renamed',
      url: 'https://t.me/renamed',
    });
    expect(sourceRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://t.me/renamed' }),
    );
  });

  it('updateSource clears url when the handle is removed', async () => {
    sourceRepo.findByChannelId.mockResolvedValue(makeRow());
    sourceRepo.save.mockImplementation(async (s: any) => s);
    const res = await controller.updateSource('-1001', { handle: '' });
    expect(res.handle).toBeNull();
    expect(res.url).toBeNull();
  });

  it('resolveSource carries avatarUrl + url', async () => {
    const res = await controller.resolveSource('@seven');
    expect(res).toMatchObject({
      channelId: '-1007',
      handle: 'seven',
      avatarUrl: '/api/kol-avatar/-1007',
      url: 'https://t.me/seven',
    });
  });
});
