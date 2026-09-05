import { CryptoNewsSource } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity';
import { CryptoNewsSourceSeededEvent } from 'telegram/ingestion/crypto-news/domain/events/crypto-news-source-seeded.event';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { RegisterNewsSourceUseCase } from 'telegram/ingestion/crypto-news/application/handlers/register-news-source.use-case';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';
import { CryptoNewsEventPublisher } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-event.publisher';

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
}

class RecordingPublisher extends CryptoNewsEventPublisher {
  public readonly published: DomainEvent[] = [];
  public async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
  }
}

describe('RegisterNewsSourceUseCase', () => {
  let repo: InMemorySourceRepo;
  let publisher: RecordingPublisher;
  let useCase: RegisterNewsSourceUseCase;

  beforeEach(() => {
    repo = new InMemorySourceRepo();
    publisher = new RecordingPublisher();
    useCase = new RegisterNewsSourceUseCase(repo, publisher);
  });

  it('registers a new source and persists it', async () => {
    const source = await useCase.execute({
      channelId: '1234567890',
      handle: '@cryptosource',
      title: 'Crypto News Daily',
    });
    expect(source.channelId).toBe('-1001234567890'); // normalized with -100 prefix
    expect(await repo.findByChannelId('-1001234567890')).toBe(source);
  });

  it('emits a CryptoNewsSourceSeededEvent', async () => {
    await useCase.execute({
      channelId: '1234567890',
      handle: null,
      title: 'Test',
    });
    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0]).toBeInstanceOf(CryptoNewsSourceSeededEvent);
  });

  it('throws CONFLICT when channelId is already registered', async () => {
    await useCase.execute({
      channelId: '1234567890',
      handle: null,
      title: 'First',
    });
    publisher.published.length = 0;

    await expect(
      useCase.execute({
        channelId: '1234567890',
        handle: null,
        title: 'Duplicate',
      }),
    ).rejects.toThrow(DomainError);
    try {
      await useCase.execute({
        channelId: '1234567890',
        handle: null,
        title: 'Duplicate',
      });
    } catch (err) {
      expect((err as DomainError).code).toBe(ErrorCode.CONFLICT);
    }
  });

  it('does not emit events on CONFLICT', async () => {
    await useCase.execute({
      channelId: '1234567890',
      handle: null,
      title: 'First',
    });
    publisher.published.length = 0;

    await expect(
      useCase.execute({
        channelId: '1234567890',
        handle: null,
        title: 'Dup',
      }),
    ).rejects.toThrow();
    expect(publisher.published).toHaveLength(0);
  });

  it('propagates DomainError from invalid input', async () => {
    await expect(
      useCase.execute({
        channelId: 'not-a-number',
        handle: null,
        title: 'Test',
      }),
    ).rejects.toThrow(DomainError);
  });
});
