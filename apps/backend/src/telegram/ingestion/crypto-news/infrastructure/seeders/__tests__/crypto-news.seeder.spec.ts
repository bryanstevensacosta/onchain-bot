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

  // All tests updated to reflect deprecated behavior (2026-09-05 migration)
  // Backend seeder is DEPRECATED - ingestion-service owns crypto-news sources
  // Seeder returns early with warning, no DB writes

  it('returns early with deprecation warning (no longer activates sources)', async () => {
    const seeder = new CryptoNewsSeeder(
      buildConfig([{ channelId: '100', handle: '@a', title: 'A' }]),
      repo,
      registerSource,
      listener,
    );

    const result = await seeder.seed();

    // Seeder is deprecated - returns 0 for all counts
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);

    // No DB writes - repo remains empty
    const active = await repo.findActive();
    expect(active).toHaveLength(0);
  });

  it('returns early even with pre-existing sources (no longer activates)', async () => {
    // Pre-populate repo with stale source
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

    // Seeder is deprecated - returns 0 for all counts
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(0);

    // Stale source remains inactive (seeder no longer touches it)
    const active = await repo.findActive();
    expect(active).toHaveLength(0);
    expect(stale.isActive).toBe(false);
  });

  it('returns early even with CRYPTO_NEWS_SEED fallback (no longer activates)', async () => {
    const seeder = new CryptoNewsSeeder(
      buildConfig([], true),
      repo,
      registerSource,
      listener,
    );

    const result = await seeder.seed();

    // Seeder is deprecated - returns 0 for all counts
    expect(result.added).toBe(0);
    expect(result.failed).toBe(0);

    // No DB writes - repo remains empty despite seed data
    const active = await repo.findActive();
    expect(active).toHaveLength(0);
  });

  it('does not call registerSource in deprecated mode', async () => {
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

    // Seeder is deprecated - returns 0 for all counts
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(0);

    // registerSource never called (seeder returns early)
    expect(registerSpy).not.toHaveBeenCalled();

    // Existing source unchanged
    const active = await repo.findActive();
    expect(active).toHaveLength(1);
    expect(active[0].isActive).toBe(true);
  });
});
