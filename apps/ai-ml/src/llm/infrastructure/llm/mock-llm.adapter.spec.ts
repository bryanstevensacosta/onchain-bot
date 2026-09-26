import { MockLlmAdapter } from './mock-llm.adapter';

describe('MockLlmAdapter', () => {
  it('is always available and tags output as mock', async () => {
    const adapter = new MockLlmAdapter();
    expect(adapter.providerName).toBe('mock');
    await expect(adapter.isAvailable()).resolves.toBe(true);
    const text = await adapter.generateText({ prompt: 'hello world' });
    expect(text).toContain('[LLM MOCK]');
  });
});
