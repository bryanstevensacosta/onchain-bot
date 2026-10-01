import { MockLlmAdapter } from './mock-llm.adapter';

describe('MockLlmAdapter', () => {
  it('is always available and tags output without calling any provider', async () => {
    const adapter = new MockLlmAdapter();
    await expect(adapter.isAvailable()).resolves.toBe(true);
    const text = await adapter.generateText({ prompt: 'Hola mundo' });
    expect(text).toContain('[LLM MOCK]');
  });
});
