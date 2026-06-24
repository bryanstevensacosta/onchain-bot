import { ParseFromCandidatesUseCase } from 'token/intake/parsing/application/handlers/parse-from-candidates.use-case';
import {
  ParserPort,
  ParsedCallFields,
} from 'token/intake/parsing/domain/ports/parser.port';
import { TokenCallRepository } from 'token/intake/parsing/application/ports/token-call.repository';
import { ParsingEventPublisher } from 'token/intake/parsing/application/ports/parsing-event.publisher';
import { TokenMetrics } from 'shared/common/value-objects/token-metrics.vo';
import { ContractAddress } from 'token/intake/extraction/domain/value-objects/contract-address.vo';
import { TokenCall } from 'token/intake/parsing/domain/entities/token-call.entity';
import { DomainError } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';

class FakeParser extends ParserPort {
  public next: ParsedCallFields = {
    ticker: null,
    name: null,
    metrics: TokenMetrics.empty(),
    chart: null,
  };
  public calls = 0;
  public parse(): Promise<ParsedCallFields> {
    this.calls++;
    return Promise.resolve(this.next);
  }
}

class InMemoryRepo extends TokenCallRepository {
  public readonly store = new Map<string, TokenCall>();
  public saves: TokenCall[] = [];
  public async save(c: TokenCall): Promise<void> {
    await Promise.resolve();
    this.store.set(c.id, c);
    this.saves.push(c);
  }
  public async findByChannelAndMessage(
    ch: string,
    m: number,
  ): Promise<TokenCall | null> {
    await Promise.resolve();
    return this.store.get(`${ch}:${m}`) ?? null;
  }
  public async findRecent(limit: number): Promise<ReadonlyArray<TokenCall>> {
    await Promise.resolve();
    return Array.from(this.store.values()).slice(-limit);
  }
}

class InMemoryPublisher extends ParsingEventPublisher {
  public readonly published: DomainEvent[] = [];
  public async publish(event: DomainEvent): Promise<void> {
    await Promise.resolve();
    this.published.push(event);
  }
}

describe('ParseFromCandidatesUseCase', () => {
  let parser: FakeParser;
  let repo: InMemoryRepo;
  let publisher: InMemoryPublisher;
  let useCase: ParseFromCandidatesUseCase;

  const EVM = '0xabcdef0123456789abcdef0123456789abcdef01';

  beforeEach(() => {
    parser = new FakeParser();
    repo = new InMemoryRepo();
    publisher = new InMemoryPublisher();
    useCase = new ParseFromCandidatesUseCase(parser, repo, publisher);
  });

  it('parses, persists, publishes and returns a view', async () => {
    parser.next = {
      ticker: 'WIF',
      name: 'dogwifhat',
      metrics: TokenMetrics.create({
        marketCapUsd: 180_000,
        liquidityUsd: 45_000,
        fdvUsd: 1_800_000,
        holders: 1230,
      }),
      chart: 'https://dexscreener.com/solana/abc',
    };

    const view = await useCase.execute({
      kolId: 'chan-1',
      messageId: 7,
      occurredAt: new Date('2026-01-01T00:00:00Z'),
      rawText: 'PEPE 0xabc...',
      contractAddresses: [ContractAddress.fromEvm(EVM)],
    });

    expect(parser.calls).toBe(1);
    expect(view.ticker).toBe('WIF');
    expect(view.name).toBe('dogwifhat');
    expect(view.contractAddress).toBe(EVM);
    expect(view.contractChainHint).toBe('evm');
    expect(view.metrics.marketCapUsd).toBe(180_000);
    expect(view.metrics.liquidityUsd).toBe(45_000);
    expect(view.confidence).toBeGreaterThan(0.7);

    expect(repo.saves).toHaveLength(1);
    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0].eventName).toBe('parsing.call.parsed');
  });

  it('throws NO_CONTRACT_ADDRESS when no addresses are provided', async () => {
    await expect(
      useCase.execute({
        kolId: 'chan-x',
        messageId: 1,
        occurredAt: new Date(),
        rawText: 'no CA here',
        contractAddresses: [],
      }),
    ).rejects.toMatchObject({ code: 'NO_CONTRACT_ADDRESS' });
  });

  it('assigns lower confidence when no metrics are parsed', async () => {
    parser.next = {
      ticker: null,
      name: null,
      metrics: TokenMetrics.empty(),
      chart: null,
    };

    const view = await useCase.execute({
      kolId: 'chan-2',
      messageId: 1,
      occurredAt: new Date(),
      rawText: 'just a CA',
      contractAddresses: [ContractAddress.fromEvm(EVM)],
    });

    // contract=0.4, ticker=0, metrics=0, name=0 → 0.4
    expect(view.confidence).toBe(0.4);
  });

  it('picks the first CA when multiple are provided', async () => {
    const SECOND = '0x1111111111111111111111111111111111111111';
    parser.next = {
      ticker: 'X',
      name: null,
      metrics: TokenMetrics.empty(),
      chart: null,
    };

    const view = await useCase.execute({
      kolId: 'chan-3',
      messageId: 1,
      occurredAt: new Date(),
      rawText: 'X CA: 0xabc... and 0x111...',
      contractAddresses: [
        ContractAddress.fromEvm(EVM),
        ContractAddress.fromEvm(SECOND),
      ],
    });

    expect(view.contractAddress).toBe(EVM);
    expect(view.confidence).toBeLessThanOrEqual(0.8); // multiple CAs reduce confidence
  });

  it('returns DomainError for invalid kolId', async () => {
    await expect(
      useCase.execute({
        kolId: '',
        messageId: 1,
        occurredAt: new Date(),
        rawText: 'text',
        contractAddresses: [ContractAddress.fromEvm(EVM)],
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('propagates the KOL username to the persisted TokenCall and emitted event', async () => {
    parser.next = {
      ticker: 'WIF',
      name: null,
      metrics: TokenMetrics.empty(),
      chart: null,
    };

    await useCase.execute({
      kolId: 'chan-9',
      messageId: 99,
      occurredAt: new Date('2026-01-01T00:00:00Z'),
      rawText: 'WIF 0xabc...',
      contractAddresses: [ContractAddress.fromEvm(EVM)],
      username: 'alpha_whale',
    });

    expect(repo.saves).toHaveLength(1);
    expect(repo.saves[0].username).toBe('alpha_whale');

    expect(publisher.published).toHaveLength(1);
    const payload = (
      publisher.published[0] as { payload: { username: string | null } }
    ).payload;
    expect(payload.username).toBe('alpha_whale');
  });
});
