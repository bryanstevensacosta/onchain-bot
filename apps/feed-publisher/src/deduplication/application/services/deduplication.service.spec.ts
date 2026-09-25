import { ConfigService } from '@nestjs/config';
import { DeduplicationService } from './deduplication.service';
import { ContentNormalizerService } from './content-normalizer.service';
import { UrlNormalizerService } from './url-normalizer.service';
import { ContentHashService } from './content-hash.service';
import { DedupScorerService } from './dedup-scorer.service';
import { SemanticScorerService } from './semantic-scorer.service';
import { InMemoryDeduplicationStore } from '../../infrastructure/repositories/in-memory-deduplication.store';
import { MockEmbeddingAdapter } from '../../infrastructure/ml/mock-embedding.adapter';

function build(
  opts: {
    dedupEnabled?: string;
    embed?: (text: string) => Promise<number[] | null>;
  } = {},
) {
  const store = new InMemoryDeduplicationStore();
  const embedding = {
    isAvailable: () => true,
    embed: jest.fn(
      opts.embed ??
        (async (text: string) => new MockEmbeddingAdapter().embed(text)),
    ),
  };
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'DEDUP_ENABLED') {
        return opts.dedupEnabled ?? 'true';
      }
      return fallback;
    }),
  } as unknown as ConfigService;
  const service = new DeduplicationService(
    store,
    embedding,
    new ContentNormalizerService(),
    new UrlNormalizerService(),
    new ContentHashService(),
    new DedupScorerService(),
    new SemanticScorerService(),
    config,
  );
  return { service, store, embedding };
}

const INPUT = {
  source: 'feed-publisher',
  channelId: '-1001',
  messageId: 1,
  content: 'ETF inflows hit record highs as Bitcoin surges',
};

describe('DeduplicationService', () => {
  it('passes fresh content as not-duplicate', async () => {
    const { service } = build();
    const result = await service.checkDuplicate(INPUT);
    expect(result.isDuplicate).toBe(false);
    expect(result.strategy).toBe('none');
  });

  it('catches exact channel+message replays', async () => {
    const { service } = build();
    await service.markAsSeen(INPUT);
    const result = await service.checkDuplicate(INPUT);
    expect(result.isDuplicate).toBe(true);
    expect(result.strategy).toBe('exact');
  });

  it('catches identical content from another message', async () => {
    const { service } = build();
    await service.markAsSeen(INPUT);
    const result = await service.checkDuplicate({
      ...INPUT,
      messageId: 2,
    });
    expect(result.isDuplicate).toBe(true);
    expect(result.strategy).toBe('content');
  });

  it('catches near-duplicate paraphrases via the semantic stage', async () => {
    const { service } = build({
      embed: jest.fn(async () => [1, 0, 0, 0]),
    });
    await service.markAsSeen(INPUT);
    const result = await service.checkDuplicate({
      ...INPUT,
      messageId: 9,
      content: 'Record ETF inflows as Bitcoin rallies hard',
    });
    expect(result.isDuplicate).toBe(true);
    expect(result.strategy).toBe('semantic');
  });

  it('fail-open: unrelated content is not blocked', async () => {
    const { service } = build();
    await service.markAsSeen(INPUT);
    const result = await service.checkDuplicate({
      ...INPUT,
      messageId: 5,
      content: 'Completely different weather report for Lisbon',
    });
    expect(result.isDuplicate).toBe(false);
  });

  it('fail-open: embedding failures never block enqueue', async () => {
    const { service } = build({
      embed: jest.fn().mockRejectedValue(new Error('model down')),
    });
    await service.markAsSeen(INPUT);
    const result = await service.checkDuplicate({
      ...INPUT,
      messageId: 6,
      content: 'Fresh market commentary nobody has seen',
    });
    expect(result.isDuplicate).toBe(false);
  });

  it('fail-open: checkDuplicate never throws, even when the store is down', async () => {
    const { service, store } = build();
    jest.spyOn(store, 'findExact').mockRejectedValue(new Error('db down'));
    const result = await service.checkDuplicate(INPUT);
    expect(result.isDuplicate).toBe(false);
    expect(result.strategy).toBe('none');
  });

  it('fail-open: markAsSeen never throws', async () => {
    const { service, store } = build();
    jest.spyOn(store, 'save').mockRejectedValue(new Error('db down'));
    await expect(service.markAsSeen(INPUT)).resolves.toBeUndefined();
  });

  it('skips the semantic stage when DEDUP_ENABLED is false', async () => {
    const { service, embedding } = build({ dedupEnabled: 'false' });
    await service.markAsSeen(INPUT);
    (embedding.embed as jest.Mock).mockClear();
    const result = await service.checkDuplicate({
      ...INPUT,
      messageId: 7,
      content: 'Fresh market commentary nobody has seen',
    });
    expect(result.isDuplicate).toBe(false);
    expect(embedding.embed).not.toHaveBeenCalled();
  });
});
