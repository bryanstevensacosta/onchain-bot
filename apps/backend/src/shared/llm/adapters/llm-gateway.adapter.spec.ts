import { ConfigService } from '@nestjs/config';
import { LlmGatewayAdapter } from './llm-gateway.adapter';

interface MockChatCompletions {
  create: jest.Mock;
}

interface MockOpenAIClient {
  chat: { completions: MockChatCompletions };
}

interface ChatCompletionCallArgs {
  model: string;
  messages: Array<{
    role: string;
    content:
      | string
      | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  }>;
  max_tokens?: number;
  temperature?: number;
  reasoning_effort?: string;
}

// Mock the official `openai` SDK. The gateway adapter only needs
// `client.chat.completions.create(...)`; we expose it as a jest.fn so
// each test can configure the resolved value or rejection.
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    })),
  };
});

// Pull the mocked constructor so we can assert it was called with the
// expected { apiKey, baseURL }.
import OpenAI from 'openai';
const OpenAIConstructor = OpenAI as unknown as jest.Mock;

const buildConfig = (overrides: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): ConfigService => {
  const cfg = {
    apiKey: 'sk-test',
    baseUrl: 'http://localhost:4845',
    model: 'opencode-zen/deepseek-v4-flash',
    ...overrides,
  };
  return {
    get: jest.fn().mockReturnValue({ llm: { gateway: cfg } }),
  } as unknown as ConfigService;
};

describe('LlmGatewayAdapter', () => {
  beforeEach(() => {
    OpenAIConstructor.mockClear();
  });

  describe('isAvailable', () => {
    it('returns false when apiKey is empty', async () => {
      const adapter = new LlmGatewayAdapter(buildConfig({ apiKey: '' }));
      await expect(adapter.isAvailable()).resolves.toBe(false);
    });

    it('returns false when baseUrl is empty', async () => {
      const adapter = new LlmGatewayAdapter(buildConfig({ baseUrl: '' }));
      await expect(adapter.isAvailable()).resolves.toBe(false);
    });

    it('returns true when both apiKey and baseUrl are set', async () => {
      const adapter = new LlmGatewayAdapter(buildConfig({}));
      await expect(adapter.isAvailable()).resolves.toBe(true);
    });
  });

  describe('generateText', () => {
    it('constructs the OpenAI client with the configured baseURL', () => {
      new LlmGatewayAdapter(buildConfig({}));
      expect(OpenAIConstructor).toHaveBeenCalledWith({
        apiKey: 'sk-test',
        baseURL: 'http://localhost:4845',
      });
    });

    it('calls chat.completions.create with the gateway model and a text-only message', async () => {
      const adapter = new LlmGatewayAdapter(buildConfig({}));
      const instance = OpenAIConstructor.mock.results[0]
        .value as MockOpenAIClient;
      instance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'hello world' } }],
      });

      const result = await adapter.generateText({ prompt: 'say hi' });

      expect(result).toBe('hello world');
      expect(instance.chat.completions.create).toHaveBeenCalledTimes(1);
      const callArg = instance.chat.completions.create.mock
        .calls[0][0] as ChatCompletionCallArgs;
      expect(callArg.model).toBe('opencode-zen/deepseek-v4-flash');
      expect(callArg.messages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'say hi' }],
        },
      ]);
      expect(callArg.max_tokens).toBe(2000);
      expect(callArg.temperature).toBe(0.7);
    });

    it('prepends a system message when systemPrompt is provided', async () => {
      const adapter = new LlmGatewayAdapter(buildConfig({}));
      const instance = OpenAIConstructor.mock.results[0]
        .value as MockOpenAIClient;
      instance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      await adapter.generateText({
        prompt: 'say hi',
        systemPrompt: 'You are a journalist.',
      });

      const callArg = instance.chat.completions.create.mock
        .calls[0][0] as ChatCompletionCallArgs;
      expect(callArg.messages).toEqual([
        { role: 'system', content: 'You are a journalist.' },
        { role: 'user', content: [{ type: 'text', text: 'say hi' }] },
      ]);
    });

    it('trims whitespace from systemPrompt before sending', async () => {
      const adapter = new LlmGatewayAdapter(buildConfig({}));
      const instance = OpenAIConstructor.mock.results[0]
        .value as MockOpenAIClient;
      instance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      await adapter.generateText({
        prompt: 'say hi',
        systemPrompt: '  You are a journalist.  ',
      });

      const callArg = instance.chat.completions.create.mock.calls[0][0];
      expect(callArg.messages).toEqual([
        { role: 'system', content: 'You are a journalist.' },
        { role: 'user', content: [{ type: 'text', text: 'say hi' }] },
      ]);
    });

    it('omits the system message when systemPrompt is empty', async () => {
      const adapter = new LlmGatewayAdapter(buildConfig({}));
      const instance = OpenAIConstructor.mock.results[0]
        .value as MockOpenAIClient;
      instance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      await adapter.generateText({
        prompt: 'say hi',
        systemPrompt: '',
      });

      const callArg = instance.chat.completions.create.mock.calls[0][0];
      expect(callArg.messages).toEqual([
        { role: 'user', content: [{ type: 'text', text: 'say hi' }] },
      ]);
    });

    it('omits the system message when systemPrompt is only whitespace', async () => {
      const adapter = new LlmGatewayAdapter(buildConfig({}));
      const instance = OpenAIConstructor.mock.results[0]
        .value as MockOpenAIClient;
      instance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      await adapter.generateText({
        prompt: 'say hi',
        systemPrompt: '   \n  ',
      });

      const callArg = instance.chat.completions.create.mock.calls[0][0];
      expect(callArg.messages).toEqual([
        { role: 'user', content: [{ type: 'text', text: 'say hi' }] },
      ]);
    });

    it('builds a multimodal content array when imageBase64 + mimeType are provided', async () => {
      const adapter = new LlmGatewayAdapter(buildConfig({}));
      const instance = OpenAIConstructor.mock.results[0]
        .value as MockOpenAIClient;
      instance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      await adapter.generateText({
        prompt: 'describe this',
        imageBase64: 'AAAA',
        mimeType: 'image/png',
        maxTokens: 100,
        temperature: 0.2,
      });

      const callArg = instance.chat.completions.create.mock.calls[0][0];
      expect(callArg.messages).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'describe this' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,AAAA' },
            },
          ],
        },
      ]);
      expect(callArg.max_tokens).toBe(100);
      expect(callArg.temperature).toBe(0.2);
    });

    it('forwards reasoningEffort as reasoning_effort when provided', async () => {
      const adapter = new LlmGatewayAdapter(buildConfig({}));
      const instance = OpenAIConstructor.mock.results[0]
        .value as MockOpenAIClient;
      instance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });
      await adapter.generateText({
        prompt: 'think less',
        reasoningEffort: 'low',
      });
      const callArg = instance.chat.completions.create.mock
        .calls[0][0] as ChatCompletionCallArgs;
      expect(callArg.reasoning_effort).toBe('low');
    });

    it('omits reasoning_effort when not provided', async () => {
      const adapter = new LlmGatewayAdapter(buildConfig({}));
      const instance = OpenAIConstructor.mock.results[0]
        .value as MockOpenAIClient;
      instance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });
      await adapter.generateText({ prompt: 'think default' });
      const callArg = instance.chat.completions.create.mock
        .calls[0][0] as ChatCompletionCallArgs;
      expect(callArg.reasoning_effort).toBeUndefined();
    });

    it('returns an empty string when the response has no content', async () => {
      const adapter = new LlmGatewayAdapter(buildConfig({}));
      const instance = OpenAIConstructor.mock.results[0]
        .value as MockOpenAIClient;
      instance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const result = await adapter.generateText({ prompt: 'say nothing' });
      expect(result).toBe('');
    });

    it('wraps errors with a descriptive message', async () => {
      const adapter = new LlmGatewayAdapter(buildConfig({}));
      const instance = OpenAIConstructor.mock.results[0]
        .value as MockOpenAIClient;
      instance.chat.completions.create.mockRejectedValue(
        new Error('connection refused'),
      );

      await expect(adapter.generateText({ prompt: 'fail' })).rejects.toThrow(
        'LLM gateway request failed: connection refused',
      );
    });

    it('uses request.model when provided, overriding the adapter configured model', async () => {
      const adapter = new LlmGatewayAdapter(buildConfig({}));
      const instance = OpenAIConstructor.mock.results[0]
        .value as MockOpenAIClient;
      instance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      await adapter.generateText({
        prompt: 'use this model',
        model: 'anthropic/claude-3-opus',
      });

      const callArg = instance.chat.completions.create.mock.calls[0][0];
      expect(callArg.model).toBe('anthropic/claude-3-opus');
    });

    it('falls back to the adapter configured model when request.model is omitted', async () => {
      const adapter = new LlmGatewayAdapter(
        buildConfig({ model: 'gateway-default-model' }),
      );
      const instance = OpenAIConstructor.mock.results[0]
        .value as MockOpenAIClient;
      instance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      await adapter.generateText({ prompt: 'no override' });

      const callArg = instance.chat.completions.create.mock.calls[0][0];
      expect(callArg.model).toBe('gateway-default-model');
    });
  });
});
