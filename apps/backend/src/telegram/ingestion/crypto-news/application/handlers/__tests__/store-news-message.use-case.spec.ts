import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';
import { CryptoNewsMessageIngestedEvent } from 'telegram/ingestion/crypto-news/domain/events/crypto-news-message-ingested.event';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { StoreNewsMessageUseCase } from 'telegram/ingestion/crypto-news/application/handlers/store-news-message.use-case';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';
import { CryptoNewsEventPublisher } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-event.publisher';

class InMemoryMessageRepo extends CryptoNewsMessageRepository {
  private readonly store = new Map<string, CryptoNewsMessage>();

  public async save(message: CryptoNewsMessage): Promise<void> {
    this.store.set(message.id, message);
  }
  public async findById(id: string): Promise<CryptoNewsMessage | null> {
    return this.store.get(id) ?? null;
  }
  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<CryptoNewsMessage>> {
    return Array.from(this.store.values())
      .sort((a, b) => b.ingestedAt.getTime() - a.ingestedAt.getTime())
      .slice(0, limit);
  }
  public async findByChannelId(
    channelId: string,
    limit: number,
  ): Promise<ReadonlyArray<CryptoNewsMessage>> {
    return Array.from(this.store.values())
      .filter((m) => m.channelId === channelId)
      .slice(0, limit);
  }
}

class RecordingPublisher extends CryptoNewsEventPublisher {
  public readonly published: DomainEvent[] = [];
  public async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
  }
}

describe('StoreNewsMessageUseCase', () => {
  let repo: InMemoryMessageRepo;
  let publisher: RecordingPublisher;
  let useCase: StoreNewsMessageUseCase;

  beforeEach(() => {
    repo = new InMemoryMessageRepo();
    publisher = new RecordingPublisher();
    useCase = new StoreNewsMessageUseCase(repo, publisher);
  });

  it('persists a new message', async () => {
    const occurredAt = new Date('2026-01-01T12:00:00Z');
    const message = await useCase.execute({
      channelId: '1234567890',
      messageId: 42,
      title: 'Breaking News',
      content: 'Bitcoin hits $100k',
      occurredAt,
    });
    expect(message.channelId).toBe('1234567890');
    expect(message.messageId).toBe(42);
    expect(message.content).toBe('Bitcoin hits $100k');
    expect(await repo.findById(message.id)).toBe(message);
  });

  it('emits a CryptoNewsMessageIngestedEvent', async () => {
    await useCase.execute({
      channelId: '123',
      messageId: 1,
      title: null,
      content: 'body',
      occurredAt: new Date(),
    });
    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0]).toBeInstanceOf(
      CryptoNewsMessageIngestedEvent,
    );
  });

  it('event payload does NOT include raw content (fix-1 compliance)', async () => {
    await useCase.execute({
      channelId: '123',
      messageId: 1,
      title: 'Title',
      content: 'SECRET RAW CONTENT',
      occurredAt: new Date('2026-01-01T00:00:00Z'),
    });
    const event = publisher.published[0] as CryptoNewsMessageIngestedEvent;
    const payload = event.toPayload();
    expect(payload).not.toHaveProperty('content');
    expect(payload).not.toHaveProperty('text');
    expect(JSON.stringify(payload)).not.toContain('SECRET RAW CONTENT');
  });

  it('event payload preserves title and metadata', async () => {
    const occurredAt = new Date('2026-01-01T00:00:00Z');
    await useCase.execute({
      channelId: '123',
      messageId: 1,
      title: 'Bitcoin hits $100k',
      content: 'irrelevant raw text',
      occurredAt,
    });
    const event = publisher.published[0] as CryptoNewsMessageIngestedEvent;
    const payload = event.toPayload();
    expect(payload).toEqual({
      channelId: '123',
      messageId: 1,
      title: 'Bitcoin hits $100k',
      occurredAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('stores content in DB even though event does not carry it', async () => {
    const message = await useCase.execute({
      channelId: '123',
      messageId: 1,
      title: null,
      content: 'raw body for DB',
      occurredAt: new Date(),
    });
    expect(message.content).toBe('raw body for DB');
  });

  it('rejects invalid input via the domain entity', async () => {
    await expect(
      useCase.execute({
        channelId: '',
        messageId: 1,
        title: null,
        content: 'body',
        occurredAt: new Date(),
      }),
    ).rejects.toThrow();
  });
});
