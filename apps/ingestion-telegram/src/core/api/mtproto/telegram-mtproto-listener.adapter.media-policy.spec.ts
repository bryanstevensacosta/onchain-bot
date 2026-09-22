import { TelegramMtprotoListenerAdapter } from './telegram-mtproto-listener.adapter';

const KOL_CHANNEL = 'channel_kol_media_gate';
const NEWS_CHANNEL = '-1009998887771';

function buildAdapter(deps: {
  activeNewsChannels: string[];
  extractAndDownload: jest.Mock;
  transform: jest.Mock;
}): {
  adapter: TelegramMtprotoListenerAdapter;
  extractAndDownload: jest.Mock;
} {
  const extractAndDownload: jest.Mock = deps.extractAndDownload;
  const adapter = new TelegramMtprotoListenerAdapter(
    { get: jest.fn().mockReturnValue({}) } as never,
    { ensureClient: jest.fn().mockReturnValue({ client: 'stub' }) } as never,
    {} as never,
    {} as never,
    {
      findAllActive: jest
        .fn()
        .mockResolvedValue(
          deps.activeNewsChannels.map((channelId) => ({ channelId })),
        ),
    } as never,
    { transform: deps.transform } as never,
    { extractAndDownload } as never,
  );
  return { adapter, extractAndDownload };
}

async function primeChannelCache(
  adapter: TelegramMtprotoListenerAdapter,
): Promise<void> {
  await (
    adapter as unknown as {
      refreshCryptoNewsChannelCache: () => Promise<void>;
    }
  ).refreshCryptoNewsChannelCache();
}

function transformMessage(
  adapter: TelegramMtprotoListenerAdapter,
  peerId: string,
  id: number,
): Promise<{
  media?: ReadonlyArray<{ filePath?: string }>;
}> {
  return (
    adapter as unknown as {
      transformMessage: (
        peerId: string,
        msg: {
          id: number;
          message?: string;
          date: number;
          media?: unknown;
          entities?: unknown[];
        },
      ) => Promise<{ media?: ReadonlyArray<{ filePath?: string }> }>;
    }
  ).transformMessage(peerId, {
    id,
    message: 'alpha with photo attached',
    date: Math.floor(Date.now() / 1000),
    media: { _: 'MessageMediaPhoto', photo: { id: 'p1' } },
    entities: [],
  });
}

function metadataOnlyTransform(): jest.Mock {
  return jest
    .fn()
    .mockImplementation((raw: { peerId: string; id: number }) => ({
      id: raw.id,
      peerId: raw.peerId,
      text: 'alpha with photo attached',
      media: [
        {
          type: 'photo',
          fileId: 'f1',
          accessHash: 'h1',
          fileReference: 'r1',
          mimeType: 'image/jpeg',
        },
      ],
      entities: [],
      groupedId: null,
      occurredAt: new Date(),
      webpagePreview: null,
    }));
}

describe('TelegramMtprotoListenerAdapter media policy (item 9: KOL never downloads)', () => {
  it('KOL message WITH media attachments triggers 0 downloads (type-branch gate)', async () => {
    const extractAndDownload = jest.fn();
    const { adapter } = buildAdapter({
      activeNewsChannels: [NEWS_CHANNEL],
      extractAndDownload,
      transform: metadataOnlyTransform(),
    });
    await primeChannelCache(adapter);

    const result = await transformMessage(adapter, KOL_CHANNEL, 11);

    expect(extractAndDownload).not.toHaveBeenCalled();
    expect(result.media).toBeDefined();
    for (const slot of result.media ?? []) {
      expect('filePath' in slot).toBe(false);
    }
  });

  it('crypto-news message WITH media triggers exactly 1 download (same payload, only type differs)', async () => {
    const downloaded = [
      {
        type: 'photo',
        index: 0,
        filePath: '/uploads/feed/media/x.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1234,
      },
    ];
    const extractAndDownload = jest.fn().mockResolvedValue(downloaded);
    const { adapter } = buildAdapter({
      activeNewsChannels: [NEWS_CHANNEL],
      extractAndDownload,
      transform: metadataOnlyTransform(),
    });
    await primeChannelCache(adapter);

    const result = await transformMessage(adapter, NEWS_CHANNEL, 12);

    expect(extractAndDownload).toHaveBeenCalledTimes(1);
    expect(result.media).toEqual(downloaded);
  });

  it('KOL message WITHOUT media never reaches the downloader either', async () => {
    const extractAndDownload = jest.fn();
    const transform = jest
      .fn()
      .mockImplementation((raw: { peerId: string; id: number }) => ({
        id: raw.id,
        peerId: raw.peerId,
        text: 'text only',
        media: [],
        entities: [],
        groupedId: null,
        occurredAt: new Date(),
        webpagePreview: null,
      }));
    const { adapter } = buildAdapter({
      activeNewsChannels: [NEWS_CHANNEL],
      extractAndDownload,
      transform,
    });
    await primeChannelCache(adapter);

    await (
      adapter as unknown as {
        transformMessage: (
          peerId: string,
          msg: Record<string, unknown>,
        ) => Promise<unknown>;
      }
    ).transformMessage(KOL_CHANNEL, {
      id: 13,
      message: 'text only',
      date: Math.floor(Date.now() / 1000),
      entities: [],
    });

    expect(extractAndDownload).not.toHaveBeenCalled();
  });
});
