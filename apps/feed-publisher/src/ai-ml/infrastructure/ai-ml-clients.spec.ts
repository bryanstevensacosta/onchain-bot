import { ConfigService } from '@nestjs/config';
import { AiMlEmbeddingClientAdapter } from './ai-ml-embedding-client.adapter';
import { AiMlLlmClientAdapter } from './ai-ml-llm-client.adapter';
import { AiMlPromptClient } from './ai-ml-prompt-client';
import { AiMlHttpError } from './ai-ml-http';

function configWith(vars: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: unknown) => vars[key] ?? fallback),
  } as unknown as ConfigService;
}

const jsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Response;

describe('AiMlLlmClientAdapter', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('posts generate and returns text with the key header', async () => {
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    global.fetch = jest.fn(async (url: unknown, init: unknown) => {
      const headers = (init as { headers: Record<string, string> }).headers;
      seen.push({ url: String(url), headers });
      return jsonResponse(200, { text: 'rewritten' });
    }) as unknown as typeof fetch;
    const client = new AiMlLlmClientAdapter(
      configWith({ AI_ML_URL: 'http://127.0.0.1:4090/', AI_ML_API_KEY: 'k' }),
    );
    await expect(
      client.generateText({ prompt: 'hello', model: 'gpt-4o-mini' }),
    ).resolves.toBe('rewritten');
    expect(seen[0]?.url).toBe('http://127.0.0.1:4090/api/llm/generate');
    expect(seen[0]?.headers['x-api-key']).toBe('k');
  });

  it('throws AiMlHttpError with status on provider failure (loud, never null)', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(500, { error: 'boom' }),
    ) as unknown as typeof fetch;
    const client = new AiMlLlmClientAdapter(configWith({}));
    await expect(client.generateText({ prompt: 'hello' })).rejects.toThrow(
      AiMlHttpError,
    );
    await expect(client.generateText({ prompt: 'hello' })).rejects.toThrow(
      'status=500',
    );
  });

  it('throws on network failure and reports unavailable', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const client = new AiMlLlmClientAdapter(configWith({}));
    await expect(client.isAvailable()).resolves.toBe(false);
    await expect(client.generateText({ prompt: 'hello' })).rejects.toThrow(
      'ECONNREFUSED',
    );
  });
});

describe('AiMlEmbeddingClientAdapter', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('posts embed and returns the vector', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(200, { vector: [0.5, 0.5], model: 'mock' }),
    ) as unknown as typeof fetch;
    const client = new AiMlEmbeddingClientAdapter(configWith({}));
    await expect(client.embed('hello')).resolves.toEqual([0.5, 0.5]);
    expect(client.isAvailable()).toBe(true);
  });

  it('is unavailable only when explicitly blanked, throws loud on 503', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(503, { error: 'no provider' }),
    ) as unknown as typeof fetch;
    const client = new AiMlEmbeddingClientAdapter(configWith({}));
    await expect(client.embed('hello')).rejects.toThrow(AiMlHttpError);
    const blanked = new AiMlEmbeddingClientAdapter(
      configWith({ AI_ML_URL: '' }),
    );
    expect(blanked.isAvailable()).toBe(false);
  });
});

describe('AiMlPromptClient', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('resolves a template with its source tag', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(200, {
        template: {
          name: 'default-feed',
          content: 'Rewrite {{original}}',
          systemContent: 'Editor',
          contentType: 'global',
          version: 1,
        },
        source: 'ai-ml',
      }),
    ) as unknown as typeof fetch;
    const client = new AiMlPromptClient(configWith({}));
    const resolved = await client.resolve('default-feed');
    expect(resolved?.template.content).toBe('Rewrite {{original}}');
    expect(resolved?.source).toBe('ai-ml');
  });

  it('returns null on 404 (unknown name) but throws on 500', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(404, { error: 'not found' }),
    ) as unknown as typeof fetch;
    const client = new AiMlPromptClient(configWith({}));
    await expect(client.resolve('nope')).resolves.toBeNull();
    global.fetch = jest.fn(async () =>
      jsonResponse(500, { error: 'boom' }),
    ) as unknown as typeof fetch;
    await expect(client.resolve('nope')).rejects.toThrow(AiMlHttpError);
  });
});
