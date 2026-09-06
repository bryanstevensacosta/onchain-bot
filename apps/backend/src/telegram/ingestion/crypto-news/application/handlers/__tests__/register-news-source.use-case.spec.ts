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

// Backend RegisterNewsSourceUseCase deprecated after 2026-09-05 migration
// Use case now throws error on execute() - verify deprecated behavior
describe('RegisterNewsSourceUseCase - DEPRECATED', () => {
  let repo: InMemorySourceRepo;
  let publisher: RecordingPublisher;
  let useCase: RegisterNewsSourceUseCase;

  beforeEach(() => {
    repo = new InMemorySourceRepo();
    publisher = new RecordingPublisher();
    useCase = new RegisterNewsSourceUseCase(repo, publisher);
  });

  it('throws error indicating deprecated functionality', async () => {
    await expect(
      useCase.execute({
        channelId: '1234567890',
        handle: '@cryptosource',
        title: 'Crypto News Daily',
      }),
    ).rejects.toThrow(/deprecated|ingestion-service/i);
  });
});
