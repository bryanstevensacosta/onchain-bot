import { ConfigService } from '@nestjs/config';
import { LlmGatewayAdapter } from './llm-gateway.adapter';

const configWith = (values: Record<string, string>): ConfigService =>
  ({
    get: (key: string, fallback?: string): string =>
      values[key] ?? fallback ?? '',
  }) as unknown as ConfigService;

describe('LlmGatewayAdapter', () => {
  it('reports unavailable when the gateway is not configured', async () => {
    const adapter = new LlmGatewayAdapter(configWith({}));
    await expect(adapter.isAvailable()).resolves.toBe(false);
  });

  it('reports available when baseUrl + key are configured', async () => {
    const adapter = new LlmGatewayAdapter(
      configWith({
        LLM_GATEWAY_BASE_URL: 'http://127.0.0.1:1',
        LLM_GATEWAY_API_KEY: 'test-key',
      }),
    );
    await expect(adapter.isAvailable()).resolves.toBe(true);
  });

  it('wraps transport failures (gateway down) instead of leaking SDK errors', async () => {
    const adapter = new LlmGatewayAdapter(
      configWith({
        LLM_GATEWAY_BASE_URL: 'http://127.0.0.1:1',
        LLM_GATEWAY_API_KEY: 'test-key',
        LLM_MODEL: 'test-model',
      }),
    );
    await expect(adapter.generateText({ prompt: 'hola' })).rejects.toThrow(
      /LLM gateway request failed/,
    );
  });
});
