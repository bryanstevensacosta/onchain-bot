import { ConfigService } from '@nestjs/config';
import { LlmGatewayAdapter } from './llm-gateway.adapter';
import { OpenAiAdapter } from './openai.adapter';

const configWith = (env: Record<string, string>): ConfigService =>
  new ConfigService(env);

describe('provider availability (no network)', () => {
  it('gateway reports unavailable without baseUrl/key', async () => {
    const adapter = new LlmGatewayAdapter(configWith({}));
    expect(adapter.providerName).toBe('gateway');
    await expect(adapter.isAvailable()).resolves.toBe(false);
  });

  it('gateway reports available with baseUrl + key', async () => {
    const adapter = new LlmGatewayAdapter(
      configWith({ LLM_GATEWAY_BASE_URL: 'http://localhost:4000', LLM_GATEWAY_API_KEY: 'k' }),
    );
    await expect(adapter.isAvailable()).resolves.toBe(true);
  });

  it('gateway falls back to OPENAI_API_KEY when no gateway key', async () => {
    const adapter = new LlmGatewayAdapter(
      configWith({ LLM_GATEWAY_BASE_URL: 'http://localhost:4000', OPENAI_API_KEY: 'sk-x' }),
    );
    await expect(adapter.isAvailable()).resolves.toBe(true);
  });

  it('openai reports unavailable without OPENAI_API_KEY', async () => {
    const adapter = new OpenAiAdapter(configWith({}));
    expect(adapter.providerName).toBe('openai');
    await expect(adapter.isAvailable()).resolves.toBe(false);
  });

  it('openai reports available with OPENAI_API_KEY', async () => {
    const adapter = new OpenAiAdapter(configWith({ OPENAI_API_KEY: 'sk-x' }));
    await expect(adapter.isAvailable()).resolves.toBe(true);
  });
});
