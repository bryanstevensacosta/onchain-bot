import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import { EmbeddingCache } from '../domain/embedding-cache';
import type { EmbeddingPort } from '../domain/ports/embedding.port';

const makeAdapter = (
  modelName: string,
  provider: 'mock' | 'openai' | 'local',
  available: boolean,
  vector: ReadonlyArray<number> = [1, 0],
): EmbeddingPort & { embed: jest.Mock } => {
  const adapter = {
    providerName: provider,
    modelName,
    isAvailable: jest.fn().mockResolvedValue(available),
    embed: jest.fn().mockResolvedValue([...vector]),
  } as unknown as EmbeddingPort & { embed: jest.Mock };
  return adapter;
};

const makeConfig = (values: Record<string, string> = {}) =>
  ({
    get: (key: string, def?: string): string => values[key] ?? def ?? '',
  }) as never;

describe('EmbeddingsService (ai-ml todo 2, failing-first)', () => {
  it('rejects empty text with an explicit error', async () => {
    const service = new EmbeddingsService(
      makeConfig({ USE_MOCK_AI: 'true' }),
      makeAdapter('mock-deterministic-64', 'mock', true),
      makeAdapter('text-embedding-3-small', 'openai', false),
      makeAdapter('Xenova/all-MiniLM-L6-v2', 'local', false),
      new EmbeddingCache(),
    );
    await expect(service.embed('   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('uses the mock adapter by default when USE_MOCK_AI=true', async () => {
    const mock = makeAdapter('mock-deterministic-64', 'mock', true, [0.5, 0.5]);
    const service = new EmbeddingsService(
      makeConfig({ USE_MOCK_AI: 'true' }),
      mock,
      makeAdapter('text-embedding-3-small', 'openai', false),
      makeAdapter('Xenova/all-MiniLM-L6-v2', 'local', false),
      new EmbeddingCache(),
    );
    const vector = await service.embed('hello');
    expect([...vector]).toEqual([0.5, 0.5]);
    expect(mock.embed).toHaveBeenCalledTimes(1);
  });

  it('routes model-per-call: text-embedding-* goes to OpenAI', async () => {
    const openai = makeAdapter(
      'text-embedding-3-small',
      'openai',
      true,
      [1, 0],
    );
    const service = new EmbeddingsService(
      makeConfig({ USE_MOCK_AI: 'true' }),
      makeAdapter('mock-deterministic-64', 'mock', true),
      openai,
      makeAdapter('Xenova/all-MiniLM-L6-v2', 'local', false),
      new EmbeddingCache(),
    );
    await service.embed('hello', 'text-embedding-3-small');
    expect(openai.embed).toHaveBeenCalledWith(
      'hello',
      'text-embedding-3-small',
    );
  });

  it('routes model-per-call: *MiniLM* goes to the local adapter', async () => {
    const local = makeAdapter('Xenova/all-MiniLM-L6-v2', 'local', true, [0, 1]);
    const service = new EmbeddingsService(
      makeConfig({ USE_MOCK_AI: 'true' }),
      makeAdapter('mock-deterministic-64', 'mock', true),
      makeAdapter('text-embedding-3-small', 'openai', false),
      local,
      new EmbeddingCache(),
    );
    await service.embed('hello', 'Xenova/all-MiniLM-L6-v2');
    expect(local.embed).toHaveBeenCalledWith(
      'hello',
      'Xenova/all-MiniLM-L6-v2',
    );
  });

  it('rejects unknown models with an explicit error (no silent fallback)', async () => {
    const service = new EmbeddingsService(
      makeConfig({ USE_MOCK_AI: 'true' }),
      makeAdapter('mock-deterministic-64', 'mock', true),
      makeAdapter('text-embedding-3-small', 'openai', true),
      makeAdapter('Xenova/all-MiniLM-L6-v2', 'local', true),
      new EmbeddingCache(),
    );
    await expect(service.embed('hello', 'cohere-embed-v9')).rejects.toThrow(
      "Unknown embedding model 'cohere-embed-v9'",
    );
  });

  it('serves the second identical call from cache (provider hit once)', async () => {
    const mock = makeAdapter('mock-deterministic-64', 'mock', true, [1, 0]);
    const service = new EmbeddingsService(
      makeConfig({ USE_MOCK_AI: 'true' }),
      mock,
      makeAdapter('text-embedding-3-small', 'openai', false),
      makeAdapter('Xenova/all-MiniLM-L6-v2', 'local', false),
      new EmbeddingCache(),
    );
    await service.embed('hello');
    await service.embed('hello');
    expect(mock.embed).toHaveBeenCalledTimes(1);
  });

  it('fails LOUD when no provider is available (adversarial: provider down)', async () => {
    const service = new EmbeddingsService(
      makeConfig({ USE_MOCK_AI: 'false', OPENAI_API_KEY: '' }),
      makeAdapter('mock-deterministic-64', 'mock', false),
      makeAdapter('text-embedding-3-small', 'openai', false),
      makeAdapter('Xenova/all-MiniLM-L6-v2', 'local', false),
      new EmbeddingCache(),
    );
    await expect(service.embed('hello')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('surfaces a pinned-model outage explicitly (openai down, mock up)', async () => {
    const service = new EmbeddingsService(
      makeConfig({ USE_MOCK_AI: 'true' }),
      makeAdapter('mock-deterministic-64', 'mock', true),
      makeAdapter('text-embedding-3-small', 'openai', false),
      makeAdapter('Xenova/all-MiniLM-L6-v2', 'local', false),
      new EmbeddingCache(),
    );
    await expect(
      service.embed('hello', 'text-embedding-3-small'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('embedBatch embeds every text and rejects an empty batch', async () => {
    const mock = makeAdapter('mock-deterministic-64', 'mock', true, [1, 0]);
    const service = new EmbeddingsService(
      makeConfig({ USE_MOCK_AI: 'true' }),
      mock,
      makeAdapter('text-embedding-3-small', 'openai', false),
      makeAdapter('Xenova/all-MiniLM-L6-v2', 'local', false),
      new EmbeddingCache(),
    );
    const vectors = await service.embedBatch(['a', 'b']);
    expect(vectors).toHaveLength(2);
    await expect(service.embedBatch([])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
