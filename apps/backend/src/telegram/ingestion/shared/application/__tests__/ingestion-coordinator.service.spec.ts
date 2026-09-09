import type { ConfigService } from '@nestjs/config';
import { TelegramListenerPort } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import type { TelegramRawMessage } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { Kol } from 'kol/identity/domain/entities/kol.entity';
import { KolId } from 'kol/identity/domain/value-objects/kol-id.vo';
import { KolIngestionOrchestratorUseCase } from 'kol/identity/application/handlers/kol-ingestion-orchestrator.use-case';

const { IngestionCoordinator } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the static import chain is broken by Jest's inability to map the CJS `telegram/extensions/Logger` subpath (see file header)
  require('telegram/ingestion/shared/application/ingestion-coordinator.service') as {
    IngestionCoordinator: new (...args: unknown[]) => {
      onApplicationBootstrap(): Promise<void>;
    };
  };

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
  public async onMessageReceived(raw: TelegramRawMessage): Promise<void> {
    this.received.push(raw);
  }
}

class MockCryptoNewsHandler {
  public received: TelegramRawMessage[] = [];
  public async handle(raw: TelegramRawMessage): Promise<void> {
    this.received.push(raw);
  }
}

function buildConfig(): ConfigService {
  return {
    get: () => undefined,
  } as unknown as ConfigService;
}

describe('IngestionCoordinator (post db-separation todo 4: KOL-only, crypto-news skipped)', () => {
  let kolRepo: InMemoryKolRepo;
  let listener: FakeListener;
  let orchestrator: CapturingOrchestrator;
  let cryptoNewsHandler: MockCryptoNewsHandler;

  beforeEach(() => {
    kolRepo = new InMemoryKolRepo();
    listener = new FakeListener();
    orchestrator = new CapturingOrchestrator(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    cryptoNewsHandler = new MockCryptoNewsHandler();
  });

  it('subscribes once with active KOL channels only', async () => {
    const kol = Kol.create({
      id: KolId.fromString('100'),
      handle: null,
      title: 'KOL',
    });
    kol.activate();
    kolRepo.seed(kol);

    const coord = new IngestionCoordinator(
      buildConfig(),
      kolRepo,
      orchestrator,
      cryptoNewsHandler,
      listener,
    );
    await coord.onApplicationBootstrap();
    // Allow the async void consumeAll to drain
    await new Promise((r) => setImmediate(r));

    expect(listener.subscribeCalls).toHaveLength(1);
    expect(listener.subscribeCalls[0].sort()).toEqual(['100']);
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
      buildConfig(),
      kolRepo,
      orchestrator,
      cryptoNewsHandler,
      listener,
    );
    await coord.onApplicationBootstrap();
    await new Promise((r) => setImmediate(r));

    expect(orchestrator.received).toHaveLength(1);
    expect(orchestrator.received[0].peerId).toBe('100');
  });

  it('routes unknown (crypto-news) peerIds to KOL orchestrator without persisting', async () => {
    const kol = Kol.create({
      id: KolId.fromString('100'),
      handle: null,
      title: 'KOL',
    });
    kol.activate();
    kolRepo.seed(kol);

    listener.messages = [
      {
        peerId: '200',
        messageId: 1,
        text: 'breaking news',
        occurredAt: new Date('2026-01-01T00:00:00Z'),
      },
    ];

    const coord = new IngestionCoordinator(
      buildConfig(),
      kolRepo,
      orchestrator,
      cryptoNewsHandler,
      listener,
    );
    await coord.onApplicationBootstrap();
    await new Promise((r) => setImmediate(r));

    // No store call exists anymore — ingestion-service owns persistence.
    // The message just flows to the KOL orchestrator (no-op for unknown).
    expect(orchestrator.received).toHaveLength(1);
    expect(orchestrator.received[0].peerId).toBe('200');
  });

  it('does not subscribe when no channels are active', async () => {
    const coord = new IngestionCoordinator(
      buildConfig(),
      kolRepo,
      orchestrator,
      cryptoNewsHandler,
      listener,
    );
    await coord.onApplicationBootstrap();
    await new Promise((r) => setImmediate(r));

    expect(listener.subscribeCalls).toHaveLength(0);
  });
});
