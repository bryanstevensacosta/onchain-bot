import { ConfigService } from '@nestjs/config';
import { IngestionCoordinator } from 'telegram/ingestion/shared/application/ingestion-coordinator.service';
import { TelegramListenerPort } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import type { TelegramRawMessage } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import { KolSeeder } from 'telegram/ingestion/kol/seeders/kol.seeder';
import { CryptoNewsSeeder } from 'telegram/ingestion/crypto-news/infrastructure/seeders/crypto-news.seeder';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { Kol } from 'kol/identity/domain/entities/kol.entity';
import { KolId } from 'kol/identity/domain/value-objects/kol-id.vo';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';
import { CryptoNewsSource } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity';
import { KolIngestionOrchestratorUseCase } from 'kol/identity/application/handlers/kol-ingestion-orchestrator.use-case';
import { StoreNewsMessageUseCase } from 'telegram/ingestion/crypto-news/application/handlers/store-news-message.use-case';
import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';

// --- In-memory fakes ---

class InMemoryKolRepo extends KolRepository {
  private readonly store = new Map<string, Kol>();
  public async save(kol: Kol): Promise<void> {
    this.store.set(kol.kolId.value, kol);
  }
  public async findById(id: KolId): Promise<Kol | null> {
    return this.store.get(id.value) ?? null;
  }
  public async findAll(): Promise<ReadonlyArray<Kol>> {
    return Array.from(this.store.values());
  }
  public async delete(id: KolId): Promise<void> {
    this.store.delete(id.value);
  }
  public async updateTitle(): Promise<boolean> {
    return false;
  }
  // Test helper
  public seed(kol: Kol): void {
    this.store.set(kol.kolId.value, kol);
  }
}

class InMemorySourceRepo extends CryptoNewsSourceRepository {
  private readonly store = new Map<string, CryptoNewsSource>();
  public async save(source: CryptoNewsSource): Promise<void> {
    this.store.set(source.channelId, source);
  }
  public async findByChannelId(
    channelId: string,
  ): Promise<CryptoNewsSource | null> {
    return this.store.get(channelId) ?? null;
  }
  public async findAll(): Promise<ReadonlyArray<CryptoNewsSource>> {
    return Array.from(this.store.values());
  }
  public async findActive(): Promise<ReadonlyArray<CryptoNewsSource>> {
    return Array.from(this.store.values()).filter((s) => s.isActive);
  }
  public async delete(channelId: string): Promise<void> {
    this.store.delete(channelId);
  }
  public seed(source: CryptoNewsSource): void {
    this.store.set(source.channelId, source);
  }
}

class FakeListener extends TelegramListenerPort {
  public subscribeCalls: string[][] = [];
  public messages: TelegramRawMessage[] = [];
  public async *subscribe(
    channelIds: string[],
  ): AsyncIterable<TelegramRawMessage> {
    this.subscribeCalls.push([...channelIds]);
    for (const msg of this.messages) {
      yield msg;
    }
  }
  public async backfill(): Promise<TelegramRawMessage[]> {
    return [];
  }
  public async disconnect(): Promise<void> {}
  public async resolveChannelMetadata() {
    return { peerId: '0', title: 't', handle: null, kind: 'channel' as const };
  }
  public async joinChannel() {
    return { joined: true, wasAlreadyMember: false };
  }
}

class CapturingOrchestrator extends KolIngestionOrchestratorUseCase {
  public received: TelegramRawMessage[] = [];
  public async onMessageReceived(
    raw: TelegramRawMessage,
  ): Promise<void> {
    this.received.push(raw);
  }
}

class CapturingStoreUseCase extends StoreNewsMessageUseCase {
  public stored: Array<{
    channelId: string;
    messageId: number;
    title: string | null;
    content: string;
    occurredAt: Date;
  }> = [];
  public async execute(input: {
    channelId: string;
    messageId: number;
    title: string | null;
    content: string;
    occurredAt: Date;
  }): Promise<CryptoNewsMessage> {
    this.stored.push(input);
    return CryptoNewsMessage.create(input);
  }
}

class FakeKolSeeder extends KolSeeder {
  public async seed(): Promise<{ added: number; skipped: number; failed: number; notAKol: number }> {
    return { added: 0, skipped: 0, failed: 0, notAKol: 0 };
  }
}

class FakeNewsSeeder extends CryptoNewsSeeder {
  public async seed(): Promise<{ added: number; skipped: number; failed: number }> {
    return { added: 0, skipped: 0, failed: 0 };
  }
}

function buildConfig(overrides: {
  seedEnabled?: boolean;
  newsSeedEnabled?: boolean;
  autoStart?: boolean;
}): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'app') {
        return {
          ingestion: {
            telegram: {
              seed: {
                enabled: overrides.seedEnabled ?? true,
                autoStartListening: overrides.autoStart ?? true,
                channels: [],
              },
              newsSeed: {
                enabled: overrides.newsSeedEnabled ?? true,
                channels: [],
              },
            },
          },
        };
      }
      return undefined;
    },
  } as unknown as ConfigService;
}

describe('IngestionCoordinator', () => {
  let kolRepo: InMemoryKolRepo;
  let sourceRepo: InMemorySourceRepo;
  let listener: FakeListener;
  let orchestrator: CapturingOrchestrator;
  let store: CapturingStoreUseCase;
  let kolSeeder: FakeKolSeeder;
  let newsSeeder: FakeNewsSeeder;

  beforeEach(() => {
    kolRepo = new InMemoryKolRepo();
    sourceRepo = new InMemorySourceRepo();
    listener = new FakeListener();
    orchestrator = new CapturingOrchestrator(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    store = new CapturingStoreUseCase({} as never, {} as never);
    kolSeeder = new FakeKolSeeder({} as never, {} as never, {} as never, {} as never, {} as never);
    newsSeeder = new FakeNewsSeeder({} as never, {} as never, {} as never, {} as never);
  });

  it('subscribes once with all active channels (KOL + news)', async () => {
    const kol = Kol.create({
      id: KolId.fromString('100'),
      handle: null,
      title: 'KOL',
    });
    kol.activate();
    kolRepo.seed(kol);
    const news = CryptoNewsSource.create({
      channelId: '200',
      handle: null,
      title: 'News',
    });
    news.activate();
    sourceRepo.seed(news);

    const coord = new IngestionCoordinator(
      buildConfig({}),
      kolSeeder,
      newsSeeder,
      kolRepo,
      sourceRepo,
      orchestrator,
      store,
      listener,
    );
    await coord.onApplicationBootstrap();
    // Allow the async void consumeAll to drain
    await new Promise((r) => setImmediate(r));

    expect(listener.subscribeCalls).toHaveLength(1);
    expect(listener.subscribeCalls[0].sort()).toEqual(['100', '200']);
  });

  it('routes a message to KOL orchestrator when peerId is a KOL', async () => {
    const kol = Kol.create({
      id: KolId.fromString('100'),
      handle: null,
      title: 'KOL',
    });
    kol.activate();
    kolRepo.seed(kol);

    listener.messages = [
      {
        peerId: '100',
        messageId: 1,
        text: 'kol message',
        occurredAt: new Date('2026-01-01T00:00:00Z'),
      },
    ];

    const coord = new IngestionCoordinator(
      buildConfig({}),
      kolSeeder,
      newsSeeder,
      kolRepo,
      sourceRepo,
      orchestrator,
      store,
      listener,
    );
    await coord.onApplicationBootstrap();
    await new Promise((r) => setImmediate(r));

    expect(orchestrator.received).toHaveLength(1);
    expect(orchestrator.received[0].peerId).toBe('100');
    expect(store.stored).toHaveLength(0);
  });

  it('routes a message to StoreNewsMessageUseCase when peerId is a news source', async () => {
    const news = CryptoNewsSource.create({
      channelId: '200',
      handle: null,
      title: 'News',
    });
    news.activate();
    sourceRepo.seed(news);

    listener.messages = [
      {
        peerId: '200',
        messageId: 1,
        text: 'breaking news',
        occurredAt: new Date('2026-01-01T00:00:00Z'),
      },
    ];

    const coord = new IngestionCoordinator(
      buildConfig({}),
      kolSeeder,
      newsSeeder,
      kolRepo,
      sourceRepo,
      orchestrator,
      store,
      listener,
    );
    await coord.onApplicationBootstrap();
    await new Promise((r) => setImmediate(r));

    expect(store.stored).toHaveLength(1);
    expect(store.stored[0].channelId).toBe('200');
    expect(store.stored[0].content).toBe('breaking news');
    expect(orchestrator.received).toHaveLength(0);
  });

  it('does not subscribe when autoStart is disabled', async () => {
    const kol = Kol.create({
      id: KolId.fromString('100'),
      handle: null,
      title: 'KOL',
    });
    kol.activate();
    kolRepo.seed(kol);

    const coord = new IngestionCoordinator(
      buildConfig({ autoStart: false }),
      kolSeeder,
      newsSeeder,
      kolRepo,
      sourceRepo,
      orchestrator,
      store,
      listener,
    );
    await coord.onApplicationBootstrap();
    await new Promise((r) => setImmediate(r));

    expect(listener.subscribeCalls).toHaveLength(0);
  });

  it('does not subscribe when no channels are active', async () => {
    const coord = new IngestionCoordinator(
      buildConfig({}),
      kolSeeder,
      newsSeeder,
      kolRepo,
      sourceRepo,
      orchestrator,
      store,
      listener,
    );
    await coord.onApplicationBootstrap();
    await new Promise((r) => setImmediate(r));

    expect(listener.subscribeCalls).toHaveLength(0);
  });

  it('calls KolSeeder and CryptoNewsSeeder during bootstrap', async () => {
    const kolSpy = { called: false };
    const newsSpy = { called: false };
    const ks = new FakeKolSeeder({} as never, {} as never, {} as never, {} as never, {} as never);
    const ns = new FakeNewsSeeder({} as never, {} as never, {} as never, {} as never);
    const seedMethod = jest
      .spyOn(ks, 'seed')
      .mockImplementation(async () => {
        kolSpy.called = true;
        return { added: 0, skipped: 0, failed: 0, notAKol: 0 };
      });
    const newsSeedMethod = jest
      .spyOn(ns, 'seed')
      .mockImplementation(async () => {
        newsSpy.called = true;
        return { added: 0, skipped: 0, failed: 0 };
      });

    const coord = new IngestionCoordinator(
      buildConfig({}),
      ks,
      ns,
      kolRepo,
      sourceRepo,
      orchestrator,
      store,
      listener,
    );
    await coord.onApplicationBootstrap();

    expect(seedMethod).toHaveBeenCalled();
    expect(newsSeedMethod).toHaveBeenCalled();
  });
});
