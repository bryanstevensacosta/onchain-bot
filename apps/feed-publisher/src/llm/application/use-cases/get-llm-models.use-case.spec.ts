import { ConfigService } from '@nestjs/config';
import { GetLlmModelsUseCase } from './get-llm-models.use-case';

const configWith = (values: Record<string, string>): ConfigService =>
  ({
    get: (key: string, fallback?: string): string =>
      values[key] ?? fallback ?? '',
  }) as unknown as ConfigService;

describe('GetLlmModelsUseCase', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('throws when the gateway baseUrl is not configured', async () => {
    const uc = new GetLlmModelsUseCase(configWith({}));
    await expect(uc.execute()).rejects.toThrow(/baseUrl not configured/);
  });

  it('projects the gateway model list down to id + owner', async () => {
    global.fetch = (async () =>
      ({
        ok: true,
        json: async () => ({
          data: [
            { id: 'gpt-4o-mini', owned_by: 'openai' },
            { id: 'other' },
          ],
        }),
      })) as unknown as typeof fetch;
    const uc = new GetLlmModelsUseCase(
      configWith({ LLM_GATEWAY_BASE_URL: 'http://gateway:4000' }),
    );
    await expect(uc.execute()).resolves.toEqual([
      { id: 'gpt-4o-mini', ownedBy: 'openai' },
      { id: 'other' },
    ]);
  });

  it('throws on gateway errors so the controller can answer 502', async () => {
    global.fetch = (async () => ({
      ok: false,
      status: 500,
      statusText: 'boom',
    })) as unknown as typeof fetch;
    const uc = new GetLlmModelsUseCase(
      configWith({ LLM_GATEWAY_BASE_URL: 'http://gateway:4000' }),
    );
    await expect(uc.execute()).rejects.toThrow(/unreachable/);
  });
});
