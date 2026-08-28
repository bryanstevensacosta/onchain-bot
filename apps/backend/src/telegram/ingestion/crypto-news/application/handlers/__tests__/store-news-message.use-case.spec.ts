import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';
import { CryptoNewsMessageIngestedEvent } from 'telegram/ingestion/crypto-news/domain/events/crypto-news-message-ingested.event';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { StoreNewsMessageUseCase } from 'telegram/ingestion/crypto-news/application/handlers/store-news-message.use-case';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';
import { CryptoNewsEventPublisher } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-event.publisher';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';
import { ContentFilterService } from 'telegram/ingestion/crypto-news/application/services/content-filter.service';
import { FilterRule } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';

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
  public async findByChannelAndMessageId(
    channelId: string,
    messageId: number,
  ): Promise<CryptoNewsMessage | null> {
    for (const m of this.store.values()) {
      if (m.channelId === channelId && m.messageId === messageId) {
        return m;
      }
    }
    return null;
  }
  public async findMediaById(): Promise<null> {
    return null;
  }
}

class RecordingPublisher extends CryptoNewsEventPublisher {
  public readonly published: DomainEvent[] = [];
  public async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
  }
}

class MockSourceRepo extends CryptoNewsSourceRepository {
  private readonly filters = new Map<string, FilterRule[]>();

  public setFilters(channelId: string, filters: FilterRule[]): void {
    this.filters.set(channelId, [...filters]);
  }

  public async findFiltersByChannelId(
    channelId: string,
  ): Promise<ReadonlyArray<FilterRule>> {
    const filters = this.filters.get(channelId) ?? [];
    return [...filters].sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  // Required abstract methods - no-op for tests
  public async save(): Promise<void> {}
  public async findByChannelId(): Promise<null> {
    return null;
  }
  public async findAll(): Promise<ReadonlyArray<any>> {
    return [];
  }
  public async findActive(): Promise<ReadonlyArray<any>> {
    return [];
  }
  public async delete(): Promise<void> {}
}

const now = new Date('2026-01-01T00:00:00Z');
const makeFilter = (overrides: Partial<FilterRule> = {}): FilterRule => ({
  pattern: '',
  replacement: '',
  flags: 'g',
  priority: 0,
  isActive: true,
  createdAt: now,
  ...overrides,
});

describe('StoreNewsMessageUseCase', () => {
  let repo: InMemoryMessageRepo;
  let publisher: RecordingPublisher;
  let sourceRepo: MockSourceRepo;
  let contentFilter: ContentFilterService;
  let useCase: StoreNewsMessageUseCase;

  beforeEach(() => {
    repo = new InMemoryMessageRepo();
    publisher = new RecordingPublisher();
    sourceRepo = new MockSourceRepo();
    contentFilter = new ContentFilterService();
    useCase = new StoreNewsMessageUseCase(
      repo,
      publisher,
      sourceRepo,
      contentFilter,
    );
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

  describe('content filter integration', () => {
    it('applies filters to title and content before persistence (Cointelegraph case)', async () => {
      const channelId = '1001';
      sourceRepo.setFilters(channelId, [
        makeFilter({
          pattern: 'News \\| Markets \\| YouTube:?\\s*',
          replacement: '',
          flags: 'gi',
          priority: 0,
        }),
      ]);

      const occurredAt = new Date('2026-01-01T12:00:00Z');
      const message = await useCase.execute({
        channelId,
        messageId: 1,
        title: 'News | Markets | YouTube: Bitcoin pumps',
        content:
          'Full article: News | Markets | YouTube: Bitcoin pumps to new highs',
        occurredAt,
      });

      expect(message.title).toBe('Bitcoin pumps');
      expect(message.content).toBe('Full article: Bitcoin pumps to new highs');
    });

    it('applies multiple filters in priority order (lower priority first)', async () => {
      const channelId = '1002';
      sourceRepo.setFilters(channelId, [
        makeFilter({ pattern: 'quick', replacement: 'slow', priority: 10 }),
        makeFilter({
          pattern: 'slow brown',
          replacement: 'fast red',
          priority: 5,
        }),
      ]);

      const message = await useCase.execute({
        channelId,
        messageId: 1,
        title: 'The quick brown fox',
        content: 'The quick brown fox jumps',
        occurredAt: new Date(),
      });

      // Priority 5 runs first: 'slow brown' -> 'fast red' (no match yet)
      // Priority 10 runs second: 'quick' -> 'slow' => 'The slow brown fox'
      expect(message.title).toBe('The slow brown fox');
      expect(message.content).toBe('The slow brown fox jumps');
    });

    it('returns original content when no filters exist for channel', async () => {
      const channelId = '1003';
      // No filters set for this channel

      const message = await useCase.execute({
        channelId,
        messageId: 1,
        title: 'Original Title',
        content: 'Original content',
        occurredAt: new Date(),
      });

      expect(message.title).toBe('Original Title');
      expect(message.content).toBe('Original content');
    });

    it('skips inactive filters', async () => {
      const channelId = '1004';
      sourceRepo.setFilters(channelId, [
        makeFilter({
          pattern: 'REMOVE',
          replacement: '',
          priority: 0,
          isActive: false,
        }),
        makeFilter({
          pattern: 'KEEP',
          replacement: 'REPLACED',
          priority: 1,
          isActive: true,
        }),
      ]);

      const message = await useCase.execute({
        channelId,
        messageId: 1,
        title: 'REMOVE KEEP',
        content: 'REMOVE KEEP',
        occurredAt: new Date(),
      });

      // Inactive filter skipped, only active filter applied
      expect(message.title).toBe('REMOVE REPLACED');
      expect(message.content).toBe('REMOVE REPLACED');
    });

    it('includes filtered title in emitted event', async () => {
      const channelId = '1005';
      sourceRepo.setFilters(channelId, [
        makeFilter({ pattern: 'PREFIX: ', replacement: '', priority: 0 }),
      ]);

      const occurredAt = new Date('2026-01-01T00:00:00Z');
      await useCase.execute({
        channelId,
        messageId: 1,
        title: 'PREFIX: Filtered Title',
        content: 'body',
        occurredAt,
      });

      const event = publisher.published[0] as CryptoNewsMessageIngestedEvent;
      const payload = event.toPayload();
      expect(payload.title).toBe('Filtered Title');
    });

    it('uses createdAt as tiebreaker for same priority', async () => {
      const channelId = '1006';
      const baseTime = new Date('2026-01-01T00:00:00Z');
      sourceRepo.setFilters(channelId, [
        makeFilter({
          pattern: 'A',
          replacement: '1',
          priority: 0,
          createdAt: new Date(baseTime.getTime() + 1000),
        }),
        makeFilter({
          pattern: '1',
          replacement: '2',
          priority: 0,
          createdAt: baseTime,
        }),
      ]);

      const message = await useCase.execute({
        channelId,
        messageId: 1,
        title: 'A',
        content: 'A',
        occurredAt: new Date(),
      });

      // Earlier createdAt runs first: '1' -> '2' (no match), then 'A' -> '1' => '1'
      expect(message.title).toBe('1');
      expect(message.content).toBe('1');
    });
  });
});
