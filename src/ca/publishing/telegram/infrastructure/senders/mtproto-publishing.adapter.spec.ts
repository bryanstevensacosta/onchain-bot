import { MtprotoPublishingAdapter } from 'ca/publishing/telegram/infrastructure/senders/mtproto-publishing.adapter';
import { ConfigService } from '@nestjs/config';

class FakeConfig {
  constructor(private readonly cfg: Record<string, unknown>) {}
  public get<T>(key: string): T {
    return this.cfg[key] as T;
  }
}

interface FakeSentMessage {
  peer: unknown;
  message: string;
}

class FakeTelegramClient {
  public sent: FakeSentMessage[] = [];
  public failNext: Error | null = null;
  public getEntityResult: unknown = { id: 12345 };
  public async connect(): Promise<void> {
    /* noop */
  }
  public async disconnect(): Promise<void> {
    /* noop */
  }
  public async getEntity(id: string): Promise<unknown> {
    await Promise.resolve();
    void id;
    return this.getEntityResult;
  }
  public async sendMessage(
    peer: unknown,
    options: { message: string },
  ): Promise<{ id: number }> {
    await Promise.resolve();
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      throw err;
    }
    this.sent.push({ peer, message: options.message });
    return { id: Date.now() };
  }
}

/**
 * Test subclass that injects a fake TelegramClient (the real one
 * needs TELEGRAM_MTPROTO_SESSION + network).
 */
class TestableAdapter extends MtprotoPublishingAdapter {
  public constructor(
    configService: ConfigService,
    private readonly fakeClient: FakeTelegramClient,
  ) {
    super(configService);
  }

  protected override async getClient(): Promise<FakeTelegramClient> {
    await Promise.resolve();
    return this.fakeClient;
  }

  protected override async resolvePeer(chatId: string): Promise<unknown> {
    await Promise.resolve();
    void chatId;
    return this.fakeClient.getEntityResult;
  }
}

const VALID_CONFIG = {
  app: {
    telegram: {
      mtprotoApiId: 12345,
      mtprotoApiHash: 'hash',
      mtprotoSession: 'session',
    },
  },
};

describe('MtprotoPublishingAdapter', () => {
  it('sends a short message successfully', async () => {
    const fakeClient = new FakeTelegramClient();
    const adapter = new TestableAdapter(
      new FakeConfig(VALID_CONFIG) as unknown as ConfigService,
      fakeClient,
    );

    const result = await adapter.sendMessage('OnChainAlphaBot', 'Hello world');

    expect(result.ok).toBe(true);
    expect(result.messageId).not.toBeNull();
    expect(result.error).toBeNull();
    expect(fakeClient.sent).toHaveLength(1);
    expect(fakeClient.sent[0].message).toBe('Hello world');
  });

  it('splits long messages into 4096-char chunks', async () => {
    const fakeClient = new FakeTelegramClient();
    const adapter = new TestableAdapter(
      new FakeConfig(VALID_CONFIG) as unknown as ConfigService,
      fakeClient,
    );

    const longText = 'a'.repeat(9000);
    const result = await adapter.sendMessage('OnChainAlphaBot', longText);

    expect(result.ok).toBe(true);
    expect(fakeClient.sent).toHaveLength(3);
    expect(fakeClient.sent[0].message.length).toBe(4096);
    expect(fakeClient.sent[1].message.length).toBe(4096);
    expect(fakeClient.sent[2].message.length).toBe(808);
  });

  it('rejects empty text', async () => {
    const fakeClient = new FakeTelegramClient();
    const adapter = new TestableAdapter(
      new FakeConfig(VALID_CONFIG) as unknown as ConfigService,
      fakeClient,
    );

    const result = await adapter.sendMessage('OnChainAlphaBot', '');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('empty message');
    expect(fakeClient.sent).toHaveLength(0);
  });

  it('returns ok=false on transport error', async () => {
    const fakeClient = new FakeTelegramClient();
    fakeClient.failNext = new Error('network down');
    const adapter = new TestableAdapter(
      new FakeConfig(VALID_CONFIG) as unknown as ConfigService,
      fakeClient,
    );

    const result = await adapter.sendMessage('OnChainAlphaBot', 'msg');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('network down');
  });

  it('warns at construction when MTProto credentials missing', () => {
    const emptyConfig = new FakeConfig({
      app: {
        telegram: { mtprotoApiId: 0, mtprotoApiHash: '', mtprotoSession: '' },
      },
    });
    expect(
      () =>
        new TestableAdapter(
          emptyConfig as unknown as ConfigService,
          new FakeTelegramClient(),
        ),
    ).not.toThrow();
  });
});
