import { MockEmbeddingAdapter } from './mock-embedding.adapter';
import { OpenAiEmbeddingAdapter } from './openai-embedding.adapter';
import { ConfigService } from '@nestjs/config';

describe('MockEmbeddingAdapter', () => {
  it('is always available and deterministic', async () => {
    const adapter = new MockEmbeddingAdapter();
    expect(adapter.isAvailable()).toBe(true);
    const a = await adapter.embed('hello world');
    const b = await adapter.embed('hello world');
    expect(a).toEqual(b);
    expect(a?.length).toBe(64);
    const norm = Math.sqrt((a ?? []).reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1);
  });

  it('separates distinct texts', async () => {
    const adapter = new MockEmbeddingAdapter();
    const a = await adapter.embed('bitcoin surges to new highs');
    const b = await adapter.embed('weather in lisbon is mild today indeed');
    expect(a).not.toEqual(b);
  });
});

describe('OpenAiEmbeddingAdapter', () => {
  function configWith(vars: Record<string, string | undefined>) {
    return {
      get: jest.fn((key: string, fallback?: unknown) => vars[key] ?? fallback),
    } as unknown as ConfigService;
  }

  it('is unavailable without an API key (fail-open)', async () => {
    const adapter = new OpenAiEmbeddingAdapter(
      configWith({ USE_MOCK_AI: 'false', OPENAI_API_KEY: undefined }),
    );
    expect(adapter.isAvailable()).toBe(false);
    await expect(adapter.embed('hello')).resolves.toBeNull();
  });

  it('is unavailable in mock mode even with a key', async () => {
    const adapter = new OpenAiEmbeddingAdapter(
      configWith({ USE_MOCK_AI: 'true', OPENAI_API_KEY: 'sk-x' }),
    );
    expect(adapter.isAvailable()).toBe(false);
  });
});
