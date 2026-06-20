import { ConfigService } from '@nestjs/config';
import { TelegramChannelSeeder } from 'ca/ingestion/telegram/infrastructure/seeders/telegram-channel.seeder';
import { TelegramChannelRepository } from 'ca/ingestion/telegram/application/ports/telegram-channel.repository';
import { ResolvedChannelMetadataRepository } from 'ca/ingestion/telegram/application/ports/resolved-channel-metadata.repository';
import type { TelegramListenerPort } from 'ca/ingestion/telegram/domain/ports/telegram-listener.port';
import type { AddChannelUseCase } from 'ca/ingestion/telegram/application/handlers/add-channel.use-case';
import type { StartListeningUseCase } from 'ca/ingestion/telegram/application/handlers/start-listening.use-case';
import { TelegramChannel } from 'ca/ingestion/telegram/domain/entities/telegram-channel.entity';
import { ChannelId } from 'ca/ingestion/telegram/domain/value-objects/channel-id.vo';
import { ChannelUsername } from 'ca/ingestion/telegram/domain/value-objects/channel-username.vo';
import type { AppConfig } from 'shared/common/config/app.config';
import type { CachedChannelMetadata } from 'ca/ingestion/telegram/application/ports/resolved-channel-metadata.repository';

class InMemoryChannelRepo extends TelegramChannelRepository {
  public readonly store = new Map<string, TelegramChannel>();
  public async save(channel: TelegramChannel): Promise<void> {
    this.store.set(channel.channelId.value, channel);
  }
  public async findById(id: ChannelId): Promise<TelegramChannel | null> {
    return this.store.get(id.value) ?? null;
  }
  public async findAll(): Promise<ReadonlyArray<TelegramChannel>> {
    return Array.from(this.store.values());
  }
  public async delete(id: ChannelId): Promise<void> {
    this.store.delete(id.value);
  }
  public async updateTitle(id: ChannelId, newTitle: string): Promise<boolean> {
    const channel = this.store.get(id.value);
    if (!channel) return false;
    channel.updateTitle(newTitle);
    return true;
  }
}

class FakeMetadataCache extends ResolvedChannelMetadataRepository {
  public readonly entries = new Map<string, CachedChannelMetadata>();
  public async find(channelId: string): Promise<CachedChannelMetadata | null> {
    return this.entries.get(channelId) ?? null;
  }
  public async findAll(): Promise<ReadonlyArray<CachedChannelMetadata>> {
    return Array.from(this.entries.values());
  }
  public async upsert(entry: CachedChannelMetadata): Promise<void> {
    this.entries.set(entry.channelId, entry);
  }
}

class FakeListener implements Partial<TelegramListenerPort> {
  public resolveCalls: string[] = [];
  constructor(
    private readonly byId: Map<
      string,
      { title: string; username: string | null }
    >,
    private readonly throwOnIds: Set<string> = new Set(),
  ) {}

  public async resolveChannelMetadata(channelId: string): Promise<{
    channelId: string;
    title: string;
    username: string | null;
  }> {
    this.resolveCalls.push(channelId);
    if (this.throwOnIds.has(channelId)) {
      throw new Error('Cannot send requests while disconnected');
    }
    const meta = this.byId.get(channelId);
    if (!meta) {
      throw new Error(`no metadata for ${channelId}`);
    }
    return { channelId, title: meta.title, username: meta.username };
  }
}

class FakeAddChannel {
  constructor(private readonly repo: InMemoryChannelRepo) {}
  public async execute(input: {
    channelId: string;
    username?: string | null;
    title: string;
  }): Promise<void> {
    const existing = await this.repo.findById(
      ChannelId.fromString(input.channelId),
    );
    if (existing) throw new Error('duplicate');
    const ch = TelegramChannel.create({
      id: ChannelId.fromString(input.channelId),
      username: input.username
        ? ChannelUsername.fromString(input.username)
        : null,
      title: input.title,
    });
    await this.repo.save(ch);
  }
}

class FakeStartListening {
  public calledWith: string[][] = [];
  public async execute(input: { channelIds: string[] }): Promise<void> {
    this.calledWith.push(input.channelIds);
  }
}

function makeConfig(
  overrides: Partial<AppConfig['ingestion']['telegram']> = {},
): ConfigService {
  const base: AppConfig = {
    port: 3000,
    nodeEnv: 'test',
    alchemy: { apiKey: '' },
    birdeye: { apiKey: '' },
    fluxrpc: { apiKey: '', rpcUrl: '' },
    helius: {
      apiKey: '',
      mainnet: {
        rpcUrl: '',
        parseTransaction: '',
        parseTransactionHistory: '',
        wsUrl: '',
      },
      devnet: {
        rpcUrl: '',
        parseTransaction: '',
        parseTransactionHistory: '',
        wsUrl: '',
      },
    },
    mobula: { apiKey: '' },
    moralis: { apiKey: '' },
    pumpdev: { apiKey: '', walletPublic: '', walletPrivate: '' },
    telegram: {
      botToken: '',
      mtprotoApiId: 0,
      mtprotoApiHash: '',
      mtprotoSession: '',
    },
    ingestion: {
      telegram: {
        seed: {
          enabled: true,
          autoStartListening: false,
          channels: [],
        },
        metadataCache: { filePath: '/tmp/x.json' },
        backfill: { enabled: true },
      },
    },
    publishing: { telegram: { useRealMtproto: false } },
    analytics: {
      evaluationHorizonsHours: [24, 168, 720],
      schedulerCron: '*/5 * * * *',
      schedulerEnabled: false,
      schedulerBatchSize: 50,
    },
  };
  const merged = {
    ...base,
    ingestion: {
      ...base.ingestion,
      telegram: {
        ...base.ingestion.telegram,
        ...overrides,
        seed: {
          ...base.ingestion.telegram.seed,
          ...(overrides.seed ?? {}),
        },
        backfill: {
          ...base.ingestion.telegram.backfill,
          ...(overrides.backfill ?? {}),
        },
      },
    },
  };
  return {
    get: (token: string) => (token === 'app' ? merged : undefined),
  } as unknown as ConfigService;
}

describe('TelegramChannelSeeder (cache + backfill)', () => {
  let repo: InMemoryChannelRepo;
  let cache: FakeMetadataCache;

  beforeEach(() => {
    repo = new InMemoryChannelRepo();
    cache = new FakeMetadataCache();
  });

  it('uses the seed-supplied title and caches it as source=seed', async () => {
    const listener = new FakeListener(new Map(), new Set());
    const config = makeConfig({
      seed: {
        enabled: true,
        autoStartListening: false,
        channels: [
          { channelId: '111', username: 'seedchan', title: 'Seed Channel' },
        ],
      },
    });
    const seeder = new TelegramChannelSeeder(
      config,
      repo,
      new FakeAddChannel(repo) as unknown as AddChannelUseCase,
      new FakeStartListening() as unknown as StartListeningUseCase,
      listener as unknown as TelegramListenerPort,
      cache,
    );

    await seeder.onApplicationBootstrap();

    const ch = repo.store.get('111');
    expect(ch?.title).toBe('Seed Channel');
    expect(listener.resolveCalls).toEqual([]);
    expect(cache.entries.get('111')).toEqual(
      expect.objectContaining({
        channelId: '111',
        title: 'Seed Channel',
        username: 'seedchan',
        source: 'seed',
      }),
    );
  });

  it('uses cached metadata when available and skips MTProto', async () => {
    cache.entries.set('222', {
      channelId: '222',
      title: 'Cached Title',
      username: 'cachedch',
      resolvedAt: '2026-06-19T00:00:00.000Z',
      source: 'mtproto',
    });
    const listener = new FakeListener(new Map(), new Set());
    const config = makeConfig({
      seed: {
        enabled: true,
        autoStartListening: false,
        channels: [{ channelId: '222' }],
      },
    });
    const seeder = new TelegramChannelSeeder(
      config,
      repo,
      new FakeAddChannel(repo) as unknown as AddChannelUseCase,
      new FakeStartListening() as unknown as StartListeningUseCase,
      listener as unknown as TelegramListenerPort,
      cache,
    );

    await seeder.onApplicationBootstrap();

    expect(repo.store.get('222')?.title).toBe('Cached Title');
    expect(listener.resolveCalls).toEqual([]);
  });

  it('falls through to MTProto, then caches the result', async () => {
    const listener = new FakeListener(
      new Map([['333', { title: 'Live Title', username: 'livechan' }]]),
    );
    const config = makeConfig({
      seed: {
        enabled: true,
        autoStartListening: false,
        channels: [{ channelId: '333' }],
      },
    });
    const seeder = new TelegramChannelSeeder(
      config,
      repo,
      new FakeAddChannel(repo) as unknown as AddChannelUseCase,
      new FakeStartListening() as unknown as StartListeningUseCase,
      listener as unknown as TelegramListenerPort,
      cache,
    );

    await seeder.onApplicationBootstrap();

    expect(repo.store.get('333')?.title).toBe('Live Title');
    expect(listener.resolveCalls).toEqual(['333']);
    expect(cache.entries.get('333')).toEqual(
      expect.objectContaining({
        channelId: '333',
        title: 'Live Title',
        username: 'livechan',
        source: 'mtproto',
      }),
    );
  });

  it('uses peerId fallback when both cache and MTProto fail', async () => {
    const listener = new FakeListener(new Map(), new Set(['444']));
    const config = makeConfig({
      seed: {
        enabled: true,
        autoStartListening: false,
        channels: [{ channelId: '444' }],
      },
    });
    const seeder = new TelegramChannelSeeder(
      config,
      repo,
      new FakeAddChannel(repo) as unknown as AddChannelUseCase,
      new FakeStartListening() as unknown as StartListeningUseCase,
      listener as unknown as TelegramListenerPort,
      cache,
    );

    await seeder.onApplicationBootstrap();

    expect(repo.store.get('444')?.title).toBe('Telegram channel 444');
    // failed resolutions must NOT pollute the cache
    expect(cache.entries.has('444')).toBe(false);
  });

  it('backfill replaces fallback titles using cache', async () => {
    repo.store.set(
      '555',
      TelegramChannel.create({
        id: ChannelId.fromString('555'),
        username: null,
        title: 'Telegram channel 555',
      }),
    );
    cache.entries.set('555', {
      channelId: '555',
      title: 'Real Title',
      username: null,
      resolvedAt: '2026-06-19T00:00:00.000Z',
      source: 'mtproto',
    });

    const listener = new FakeListener(new Map(), new Set());
    const config = makeConfig({
      seed: {
        enabled: false,
        autoStartListening: false,
        channels: [],
      },
    });
    const seeder = new TelegramChannelSeeder(
      config,
      repo,
      new FakeAddChannel(repo) as unknown as AddChannelUseCase,
      new FakeStartListening() as unknown as StartListeningUseCase,
      listener as unknown as TelegramListenerPort,
      cache,
    );

    await seeder.onApplicationBootstrap();

    expect(repo.store.get('555')?.title).toBe('Real Title');
    expect(listener.resolveCalls).toEqual([]);
  });

  it('backfill replaces fallback titles via MTProto when cache misses', async () => {
    repo.store.set(
      '666',
      TelegramChannel.create({
        id: ChannelId.fromString('666'),
        username: null,
        title: 'Telegram channel 666',
      }),
    );
    const listener = new FakeListener(
      new Map([['666', { title: 'Live Backfill', username: 'liveback' }]]),
    );
    const config = makeConfig({
      seed: {
        enabled: false,
        autoStartListening: false,
        channels: [],
      },
    });
    const seeder = new TelegramChannelSeeder(
      config,
      repo,
      new FakeAddChannel(repo) as unknown as AddChannelUseCase,
      new FakeStartListening() as unknown as StartListeningUseCase,
      listener as unknown as TelegramListenerPort,
      cache,
    );

    await seeder.onApplicationBootstrap();

    expect(repo.store.get('666')?.title).toBe('Live Backfill');
    expect(listener.resolveCalls).toEqual(['666']);
    expect(cache.entries.get('666')).toEqual(
      expect.objectContaining({
        channelId: '666',
        title: 'Live Backfill',
        source: 'mtproto',
      }),
    );
  });

  it('skips backfill entirely when INGESTION_TELEGRAM_BACKFILL_ENABLED=false', async () => {
    repo.store.set(
      '777',
      TelegramChannel.create({
        id: ChannelId.fromString('777'),
        username: null,
        title: 'Telegram channel 777',
      }),
    );
    const listener = new FakeListener(new Map(), new Set());
    const config = makeConfig({
      seed: {
        enabled: false,
        autoStartListening: false,
        channels: [],
      },
      backfill: { enabled: false },
    });
    const seeder = new TelegramChannelSeeder(
      config,
      repo,
      new FakeAddChannel(repo) as unknown as AddChannelUseCase,
      new FakeStartListening() as unknown as StartListeningUseCase,
      listener as unknown as TelegramListenerPort,
      cache,
    );

    await seeder.onApplicationBootstrap();

    expect(repo.store.get('777')?.title).toBe('Telegram channel 777');
    expect(listener.resolveCalls).toEqual([]);
  });
});
