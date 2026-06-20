import { ExtractFromMessageUseCase } from 'discovery/extraction/application/handlers/extract-from-message.use-case';
import {
  ExtractorPort,
  ExtractedCandidates,
} from 'discovery/extraction/domain/ports/extractor.port';
import { ExtractionResultRepository } from 'discovery/extraction/application/ports/extraction-result.repository';
import { ExtractionEventPublisher } from 'discovery/extraction/application/ports/extraction-event.publisher';
import { ContractAddress } from 'discovery/extraction/domain/value-objects/contract-address.vo';
import { Ticker } from 'discovery/extraction/domain/value-objects/ticker.vo';
import { Url } from 'discovery/extraction/domain/value-objects/url.vo';
import { ExtractionResult } from 'discovery/extraction/domain/entities/extraction-result.entity';
import type { DomainEvent } from 'shared/kernel/domain-event';

class FakeExtractor extends ExtractorPort {
  public next: ExtractedCandidates = {
    contractAddresses: [],
    tickers: [],
    urls: [],
  };
  public calls = 0;
  public extract(): Promise<ExtractedCandidates> {
    this.calls++;
    return Promise.resolve(this.next);
  }
}

class InMemoryRepo extends ExtractionResultRepository {
  public readonly store = new Map<string, ExtractionResult>();
  public saves: ExtractionResult[] = [];
  public async save(r: ExtractionResult): Promise<void> {
    await Promise.resolve();
    this.store.set(r.id, r);
    this.saves.push(r);
  }
  public async findByChannelAndMessage(
    c: string,
    m: number,
  ): Promise<ExtractionResult | null> {
    await Promise.resolve();
    return this.store.get(`${c}:${m}`) ?? null;
  }
  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<ExtractionResult>> {
    await Promise.resolve();
    return Array.from(this.store.values()).slice(-limit);
  }
}

class InMemoryPublisher extends ExtractionEventPublisher {
  public readonly published: DomainEvent[] = [];
  public async publish(event: DomainEvent): Promise<void> {
    await Promise.resolve();
    this.published.push(event);
  }
}

describe('ExtractFromMessageUseCase', () => {
  let extractor: FakeExtractor;
  let repo: InMemoryRepo;
  let publisher: InMemoryPublisher;
  let useCase: ExtractFromMessageUseCase;

  beforeEach(() => {
    extractor = new FakeExtractor();
    repo = new InMemoryRepo();
    publisher = new InMemoryPublisher();
    useCase = new ExtractFromMessageUseCase(extractor, repo, publisher);
  });

  it('extracts, persists, publishes and returns a view', async () => {
    const ca = ContractAddress.fromEvm(
      '0xabcdef0123456789abcdef0123456789abcdef01',
    );
    const ticker = Ticker.fromString('PEPE');
    const url = Url.fromString('https://example.com');
    extractor.next = {
      contractAddresses: [ca],
      tickers: [ticker],
      urls: [url],
    };

    const view = await useCase.execute({
      channelId: 'chan-1',
      messageId: 42,
      occurredAt: new Date('2026-01-01T00:00:00Z'),
      text: 'PEPE ca 0xabcdef0123456789abcdef0123456789abcdef01',
    });

    expect(extractor.calls).toBe(1);
    expect(view.channelId).toBe('chan-1');
    expect(view.messageId).toBe(42);
    expect(view.contractAddresses[0].value).toBe(ca.value);
    expect(view.tickers[0]).toBe('PEPE');
    expect(view.urls[0].value).toBe('https://example.com');

    expect(repo.saves).toHaveLength(1);
    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0].eventName).toBe(
      'extraction.candidates.extracted',
    );
  });

  it('publishes event even when extraction yields no candidates', async () => {
    extractor.next = { contractAddresses: [], tickers: [], urls: [] };

    const view = await useCase.execute({
      channelId: 'chan-2',
      messageId: 7,
      occurredAt: new Date(),
      text: 'no signals here',
    });

    expect(view.contractAddresses).toEqual([]);
    expect(repo.saves).toHaveLength(1);
    expect(publisher.published).toHaveLength(1);
  });

  it('persists a result that can be retrieved by channel + message id', async () => {
    const ca = ContractAddress.fromEvm(
      '0x1111111111111111111111111111111111111111',
    );
    extractor.next = { contractAddresses: [ca], tickers: [], urls: [] };

    await useCase.execute({
      channelId: 'chan-3',
      messageId: 99,
      occurredAt: new Date(),
      text: 'CA: 0x1111111111111111111111111111111111111111',
    });

    const found = await repo.findByChannelAndMessage('chan-3', 99);
    expect(found).not.toBeNull();
    expect(found!.contractAddresses[0].value).toBe(ca.value);
  });
});
