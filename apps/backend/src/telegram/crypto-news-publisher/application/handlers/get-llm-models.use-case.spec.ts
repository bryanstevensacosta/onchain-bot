import { ConfigService } from '@nestjs/config';
import { GetLlmModelsUseCase } from './get-llm-models.use-case';

const buildConfigService = (
  overrides: {
    baseUrl?: string;
    apiKey?: string;
  } = {},
): ConfigService => {
  const cfg = {
    baseUrl: overrides.baseUrl ?? 'http://localhost:4845',
    apiKey: overrides.apiKey ?? 'sk-test',
  };
  return {
    get: jest.fn().mockReturnValue({ llm: { gateway: cfg } }),
  } as unknown as ConfigService;
};

interface MockResponseInit {
  ok: boolean;
  status?: number;
  statusText?: string;
  json?: () => Promise<unknown>;
}

const mockFetch = (init: MockResponseInit): jest.Mock =>
  jest.fn().mockResolvedValue({
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    statusText: init.statusText ?? (init.ok ? 'OK' : 'Internal Server Error'),
    json: init.json ?? (async () => ({ data: [] })),
  });

type FetchCall = readonly [
  string,
  { method?: string; headers?: Record<string, string> },
];

const lastFetchCall = (fn: jest.Mock): FetchCall => {
  const calls = fn.mock.calls as unknown[][];
  const last = calls[calls.length - 1] ?? [];
  return [last[0] as string, last[1] ?? {}];
};

describe('GetLlmModelsUseCase', () => {
  const originalFetch = global.fetch;
  let fakeFetch: jest.Mock;

  beforeEach(() => {
    fakeFetch = jest.fn();
    global.fetch = fakeFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('hits `${baseUrl}/v1/models` with a Bearer token', async () => {
    fakeFetch = mockFetch({
      ok: true,
      json: async () => ({
        data: [
          { id: 'gpt-4o-mini', owned_by: 'openai' },
          { id: 'opencode-zen/deepseek-v4-flash', owned_by: 'opencode' },
        ],
      }),
    });
    global.fetch = fakeFetch;

    const useCase = new GetLlmModelsUseCase(buildConfigService());
    const result = await useCase.execute();

    expect(result).toEqual([
      { id: 'gpt-4o-mini', ownedBy: 'openai' },
      { id: 'opencode-zen/deepseek-v4-flash', ownedBy: 'opencode' },
    ]);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [url, init] = lastFetchCall(fakeFetch);
    expect(url).toBe('http://localhost:4845/v1/models');
    expect(init.method).toBe('GET');
    expect(init.headers?.Authorization).toBe('Bearer sk-test');
  });

  it('trims trailing slashes from the base URL before constructing /v1/models', async () => {
    fakeFetch = mockFetch({ ok: true, json: async () => ({ data: [] }) });
    global.fetch = fakeFetch;

    const useCase = new GetLlmModelsUseCase(
      buildConfigService({ baseUrl: 'http://localhost:4845/' }),
    );
    await useCase.execute();

    const [url] = lastFetchCall(fakeFetch);
    expect(url).toBe('http://localhost:4845/v1/models');
  });

  it('omits the Authorization header when apiKey is empty', async () => {
    fakeFetch = mockFetch({ ok: true, json: async () => ({ data: [] }) });
    global.fetch = fakeFetch;

    const useCase = new GetLlmModelsUseCase(buildConfigService({ apiKey: '' }));
    await useCase.execute();

    const [, init] = lastFetchCall(fakeFetch);
    expect(init.headers?.Authorization).toBeUndefined();
  });

  it('skips the owned_by field when missing from the response', async () => {
    fakeFetch = mockFetch({
      ok: true,
      json: async () => ({ data: [{ id: 'no-owner' }] }),
    });
    global.fetch = fakeFetch;

    const useCase = new GetLlmModelsUseCase(buildConfigService());
    const result = await useCase.execute();

    expect(result).toEqual([{ id: 'no-owner' }]);
  });

  it('returns an empty list when the gateway returns no data array', async () => {
    fakeFetch = mockFetch({ ok: true, json: async () => ({}) });
    global.fetch = fakeFetch;

    const useCase = new GetLlmModelsUseCase(buildConfigService());
    const result = await useCase.execute();

    expect(result).toEqual([]);
  });

  it('throws when the gateway returns a non-2xx response', async () => {
    fakeFetch = mockFetch({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
    });
    global.fetch = fakeFetch;

    const useCase = new GetLlmModelsUseCase(buildConfigService());
    await expect(useCase.execute()).rejects.toThrow(/unreachable/i);
  });

  it('throws when the base URL is not configured', async () => {
    const configService = {
      get: jest.fn().mockReturnValue({ llm: { gateway: { apiKey: 'x' } } }),
    } as unknown as ConfigService;
    const useCase = new GetLlmModelsUseCase(configService);
    await expect(useCase.execute()).rejects.toThrow(/baseUrl/);
  });
});
