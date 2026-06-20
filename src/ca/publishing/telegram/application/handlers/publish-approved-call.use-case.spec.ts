import { PublishApprovedCallUseCase } from 'ca/publishing/telegram/application/handlers/publish-approved-call.use-case';
import {
  MessageFormatterPort,
  ApprovedCallInput,
} from 'ca/publishing/telegram/domain/ports/message-formatter.port';
import { OutputChannelResolverPort } from 'ca/publishing/telegram/domain/ports/output-channel-resolver.port';
import { TelegramPublisherPort } from 'ca/publishing/telegram/domain/ports/telegram-publisher.port';
import { PublishedCallRepository } from 'ca/publishing/telegram/application/ports/published-call.repository';
import { PublishingEventPublisher } from 'ca/publishing/telegram/application/ports/publishing-event.publisher';
import { PublishedCall } from 'ca/publishing/telegram/domain/entities/published-call.entity';
import { OutputChannel } from 'ca/publishing/telegram/domain/value-objects/output-channel.vo';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import type { DomainEvent } from 'shared/kernel/domain-event';

class FakeFormatter extends MessageFormatterPort {
  public format(input: ApprovedCallInput): string {
    return `ALPHA: $${input.ticker ?? '?'} | score=${input.score}`;
  }
}

class FakeResolver extends OutputChannelResolverPort {
  public constructor(private readonly channels: ReadonlyArray<OutputChannel>) {
    super();
  }
  public listAll(): ReadonlyArray<OutputChannel> {
    return this.channels;
  }
  public listForScore(score: number): ReadonlyArray<OutputChannel> {
    void score;
    return this.channels;
  }
}

class FakePublisher extends TelegramPublisherPort {
  public constructor(private readonly failing: Set<string> = new Set()) {
    super();
  }
  public async sendMessage(
    chatId: string,
    text: string,
  ): Promise<{ ok: boolean; messageId: number | null; error: string | null }> {
    await Promise.resolve();
    if (text.length === 0)
      return { ok: false, messageId: null, error: 'empty text' };
    if (this.failing.has(chatId)) {
      return { ok: false, messageId: null, error: 'send failed' };
    }
    return { ok: true, messageId: Date.now(), error: null };
  }
}

class InMemoryRepo extends PublishedCallRepository {
  public readonly store = new Map<string, PublishedCall>();
  public async save(c: PublishedCall): Promise<void> {
    await Promise.resolve();
    this.store.set(c.id, c);
  }
  public async findByChainAndAddress(
    c: ChainId,
    a: string,
  ): Promise<PublishedCall | null> {
    await Promise.resolve();
    return this.store.get(`${c.value}:${a.toLowerCase()}`) ?? null;
  }
  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>> {
    await Promise.resolve();
    return Array.from(this.store.values()).slice(-limit).reverse();
  }
  public async findPublished(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .filter((c) => c.isPublished)
      .slice(0, limit);
  }
  public async findFailed(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .filter((c) => c.isFailed)
      .slice(0, limit);
  }
}

class InMemoryPublisher extends PublishingEventPublisher {
  public readonly published: DomainEvent[] = [];
  public async publish(e: DomainEvent): Promise<void> {
    await Promise.resolve();
    this.published.push(e);
  }
}

const EVM = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

describe('PublishApprovedCallUseCase', () => {
  let repo: InMemoryRepo;
  let eventPublisher: InMemoryPublisher;

  beforeEach(() => {
    repo = new InMemoryRepo();
    eventPublisher = new InMemoryPublisher();
  });

  it('publishes to all primary channels', async () => {
    const channels = [
      OutputChannel.create({ channelId: 'OnChainAlphaBot', tier: 'PRIMARY' }),
    ];
    const useCase = new PublishApprovedCallUseCase(
      new FakeFormatter(),
      new FakeResolver(channels),
      new FakePublisher(),
      repo,
      eventPublisher,
    );

    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      ticker: 'WIF',
      name: null,
      score: 92,
      classification: 'TOKEN',
      marketCapUsd: 100_000,
      liquidityUsd: 50_000,
      holders: 1000,
      sourceCount: 2,
      mentionCount: 3,
      chart: null,
    });

    expect(view.status).toBe('PUBLISHED');
    expect(view.publishedChannelIds).toContain('OnChainAlphaBot');
    expect(view.successCount).toBe(1);
    expect(view.failedChannelIds).toEqual([]);
    expect(view.tier).toBe('STRONG');
    expect(eventPublisher.published[0].eventName).toBe(
      'publishing.telegram.published',
    );
  });

  it('reports FAILED when all channels fail', async () => {
    const channels = [
      OutputChannel.create({ channelId: 'OnChainAlphaBot', tier: 'PRIMARY' }),
    ];
    const useCase = new PublishApprovedCallUseCase(
      new FakeFormatter(),
      new FakeResolver(channels),
      new FakePublisher(new Set(['OnChainAlphaBot'])),
      repo,
      eventPublisher,
    );

    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      ticker: null,
      name: null,
      score: 80,
      classification: 'TOKEN',
      marketCapUsd: null,
      liquidityUsd: null,
      holders: null,
      sourceCount: 1,
      mentionCount: 1,
      chart: null,
    });

    expect(view.status).toBe('FAILED');
    expect(view.publishedChannelIds).toEqual([]);
    expect(view.failedChannelIds).toContain('OnChainAlphaBot');
    expect(eventPublisher.published[0].eventName).toBe(
      'publishing.telegram.failed',
    );
  });

  it('partially succeeds when only some channels fail', async () => {
    const channels = [
      OutputChannel.create({ channelId: 'AlphaChannel1', tier: 'PRIMARY' }),
      OutputChannel.create({ channelId: 'AlphaChannel2', tier: 'PRIMARY' }),
    ];
    const useCase = new PublishApprovedCallUseCase(
      new FakeFormatter(),
      new FakeResolver(channels),
      new FakePublisher(new Set(['AlphaChannel2'])),
      repo,
      eventPublisher,
    );

    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      ticker: null,
      name: null,
      score: 80,
      classification: 'TOKEN',
      marketCapUsd: null,
      liquidityUsd: null,
      holders: null,
      sourceCount: 1,
      mentionCount: 1,
      chart: null,
    });

    expect(view.status).toBe('PUBLISHED');
    expect(view.publishedChannelIds).toEqual(['AlphaChannel1']);
    expect(view.failedChannelIds).toEqual(['AlphaChannel2']);
  });

  it('returns FAILED when no channels resolve for the score', async () => {
    const useCase = new PublishApprovedCallUseCase(
      new FakeFormatter(),
      new FakeResolver([]),
      new FakePublisher(),
      repo,
      eventPublisher,
    );

    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      ticker: null,
      name: null,
      score: 50,
      classification: 'TOKEN',
      marketCapUsd: null,
      liquidityUsd: null,
      holders: null,
      sourceCount: 1,
      mentionCount: 1,
      chart: null,
    });

    expect(view.status).toBe('FAILED');
    expect(view.successCount).toBe(0);
  });

  it('persists PublishedCall', async () => {
    const channels = [
      OutputChannel.create({ channelId: 'OnChainAlphaBot', tier: 'PRIMARY' }),
    ];
    const useCase = new PublishApprovedCallUseCase(
      new FakeFormatter(),
      new FakeResolver(channels),
      new FakePublisher(),
      repo,
      eventPublisher,
    );

    await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      ticker: null,
      name: null,
      score: 80,
      classification: 'TOKEN',
      marketCapUsd: null,
      liquidityUsd: null,
      holders: null,
      sourceCount: 1,
      mentionCount: 1,
      chart: null,
    });

    expect(repo.store.size).toBe(1);
    expect(
      repo.store.get('ethereum:0xd8da6bf26964af9d7eed9e03e53415d37aa96045'),
    ).toBeDefined();
  });

  it('tier maps score correctly', async () => {
    const channels = [
      OutputChannel.create({ channelId: 'OnChainAlphaBot', tier: 'PRIMARY' }),
    ];
    const useCase = new PublishApprovedCallUseCase(
      new FakeFormatter(),
      new FakeResolver(channels),
      new FakePublisher(),
      repo,
      eventPublisher,
    );

    const strong = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      ticker: null,
      name: null,
      score: 85,
      classification: 'TOKEN',
      marketCapUsd: null,
      liquidityUsd: null,
      holders: null,
      sourceCount: 1,
      mentionCount: 1,
      chart: null,
    });
    expect(strong.tier).toBe('STRONG');

    const decent = await useCase.execute({
      chain: 'ethereum',
      address: '0x2222222222222222222222222222222222222222',
      ticker: null,
      name: null,
      score: 65,
      classification: 'TOKEN',
      marketCapUsd: null,
      liquidityUsd: null,
      holders: null,
      sourceCount: 1,
      mentionCount: 1,
      chart: null,
    });
    expect(decent.tier).toBe('DECENT');
  });
});
