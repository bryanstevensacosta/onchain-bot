import { SourcesController } from './sources.controller';

/**
 * P57 `GET /api/feed/sources/resolve?input=` (FAILING-FIRST).
 */
describe('SourcesController.resolveSource', () => {
  const sourceRepo: any = {};
  const registerSourceUseCase: any = { execute: jest.fn() };

  function controllerWith(listener: any) {
    return new SourcesController(sourceRepo, registerSourceUseCase, listener);
  }

  beforeEach(() => jest.clearAllMocks());

  it('resolves a channel handle to kind + canSubscribe=true', async () => {
    const listener = {
      resolveChannelMetadata: jest.fn(async () => ({
        peerId: '-100123',
        title: 'Watcher',
        handle: 'watcher',
        kind: 'channel',
        isBot: false,
      })),
    };
    const controller = controllerWith(listener);
    const res = await controller.resolveSource('@watcher');
    expect(listener.resolveChannelMetadata).toHaveBeenCalledWith('@watcher');
    expect(res).toMatchObject({
      input: '@watcher',
      kind: 'channel',
      canSubscribe: true,
      isBot: false,
    });
  });

  it('resolves a bot to kind=bot + canSubscribe=false', async () => {
    const listener = {
      resolveChannelMetadata: jest.fn(async () => ({
        peerId: '999',
        title: 'Some Bot',
        handle: 'somebot',
        kind: 'bot',
        isBot: true,
      })),
    };
    const controller = controllerWith(listener);
    const res = await controller.resolveSource('@somebot');
    expect(res).toMatchObject({ kind: 'bot', canSubscribe: false });
  });

  it('rejects empty input with 400', async () => {
    const controller = controllerWith({
      resolveChannelMetadata: jest.fn(),
    });
    await expect(controller.resolveSource('')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('maps unresolvable input to 404', async () => {
    const controller = controllerWith({
      resolveChannelMetadata: jest.fn(async () => {
        throw new Error('Could not find the input entity');
      }),
    });
    await expect(
      controller.resolveSource('@nosuchchannel12345'),
    ).rejects.toMatchObject({ status: 404 });
  });
});
