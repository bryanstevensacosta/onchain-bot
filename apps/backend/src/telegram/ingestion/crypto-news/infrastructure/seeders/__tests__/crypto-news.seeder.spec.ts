import type { ConfigService } from '@nestjs/config';
import { CryptoNewsSource } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity';
import type { SeedCryptoNewsChannel } from 'telegram/ingestion/crypto-news/infrastructure/seeds/crypto-news.seed';
import { CRYPTO_NEWS_SEED } from 'telegram/ingestion/crypto-news/infrastructure/seeds/crypto-news.seed';
import { CryptoNewsSeeder } from 'telegram/ingestion/crypto-news/infrastructure/seeders/crypto-news.seeder';
import { RegisterNewsSourceUseCase } from 'telegram/ingestion/crypto-news/application/handlers/register-news-source.use-case';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';
import { CryptoNewsEventPublisher } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-event.publisher';
import type { DomainEvent } from 'shared/kernel/domain-event';
import {
  TelegramListenerPort,
  type TelegramRawMessage,
} from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';

class InMemorySourceRepo extends CryptoNewsSourceRepository {
  public readonly store = new Map<string, CryptoNewsSource>();

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
}

class NoopEventPublisher extends CryptoNewsEventPublisher {
  public async publish(_event: DomainEvent): Promise<void> {
    return;
  }
}

class StubListener extends TelegramListenerPort {
  public async resolveChannelMetadata(channelId: string): Promise<{
    peerId: string;
    title: string;
    handle: string | null;
    kind: 'channel';
  }> {
    return {
      peerId: channelId,
      title: `Channel ${channelId}`,
      handle: null,
      kind: 'channel',
    };
  }

  public async joinChannel(): Promise<{
    joined: boolean;
    wasAlreadyMember: boolean;
  }> {
    return { joined: true, wasAlreadyMember: false };
  }

  public async disconnect(): Promise<void> {
    return;
  }

  public async backfill(): Promise<TelegramRawMessage[]> {
    return [];
  }

  public async *subscribe(): AsyncIterable<TelegramRawMessage> {
    yield* [];
  }
}

function buildConfig(
  channels: ReadonlyArray<SeedCryptoNewsChannel>,
  enabled = true,
): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'app') {
        return {
          ingestion: {
            telegram: {
              newsSeed: {
                enabled,
                channels,
              },
            },
          },
        };
      }
      return undefined;
    },
  } as unknown as ConfigService;
}

describe('CryptoNewsSeeder', () => {
  let repo: InMemorySourceRepo;
  let registerSource: RegisterNewsSourceUseCase;
  let listener: StubListener;

  beforeEach(() => {
    repo = new InMemorySourceRepo();
    registerSource = new RegisterNewsSourceUseCase(
      repo,
      new NoopEventPublisher(),
    );
    listener = new StubListener();
  });

  it('activates newly registered sources so IngestionCoordinator.findActive() picks them up', async () => {
    const seeder = new CryptoNewsSeeder(
      buildConfig([{ channelId: '100', handle: '@a', title: 'A' }]),
      repo,
      registerSource,
      listener,
    );

    const result = await seeder.seed();

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);

    const active = await repo.findActive();
    expect(active).toHaveLength(1);
    expect(active[0].channelId).toBe('100');
    expect(active[0].isActive).toBe(true);
    expect(active[0].lifecycleStatus).toBe('ACTIVE');
  });

  it('activates pre-existing sources left with isActive=false by an earlier deploy', async () => {
    // Reproduce the production state that triggered this fix: a row
    // registered by a previous seeder version with isActive=false.
    const stale = CryptoNewsSource.create({
      channelId: '200',
      handle: '@b',
      title: 'B',
    });
    expect(stale.isActive).toBe(false);
    await repo.save(stale);

    const seeder = new CryptoNewsSeeder(
      buildConfig([{ channelId: '200', handle: '@b', title: 'B' }]),
      repo,
      registerSource,
      listener,
    );

    const result = await seeder.seed();

    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);

    const active = await repo.findActive();
    expect(active).toHaveLength(1);
    expect(active[0].channelId).toBe('200');
    expect(active[0].isActive).toBe(true);
  });

  it('activates every channel from CRYPTO_NEWS_SEED when no env list is supplied', async () => {
    const seeder = new CryptoNewsSeeder(
      buildConfig([], true),
      repo,
      registerSource,
      listener,
    );

    const result = await seeder.seed();

    expect(result.added).toBe(CRYPTO_NEWS_SEED.length);
    expect(result.failed).toBe(0);

    const active = await repo.findActive();
    expect(active).toHaveLength(CRYPTO_NEWS_SEED.length);
    expect(active.map((s) => s.channelId).sort()).toEqual(
      CRYPTO_NEWS_SEED.map((s) => s.channelId).sort(),
    );
  });

  it('does not call registerSource when the source already exists (idempotent re-run)', async () => {
    const existing = CryptoNewsSource.create({
      channelId: '300',
      handle: '@c',
      title: 'C',
    });
    existing.activate();
    await repo.save(existing);

    const registerSpy = jest
      .spyOn(registerSource, 'execute')
      .mockRejectedValue(new Error('should not be called'));

    const seeder = new CryptoNewsSeeder(
      buildConfig([{ channelId: '300', handle: '@c', title: 'C' }]),
      repo,
      registerSource,
      listener,
    );

    const result = await seeder.seed();

    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
    expect(registerSpy).not.toHaveBeenCalled();

    const active = await repo.findActive();
    expect(active).toHaveLength(1);
    expect(active[0].isActive).toBe(true);
  });
});
