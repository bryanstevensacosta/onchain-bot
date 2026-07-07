import OpenAI from 'openai';
import { OpenAiAdapter } from './openai.adapter';

interface MockChatCompletions {
  create: jest.Mock;
}

interface MockOpenAIClient {
  chat: { completions: MockChatCompletions };
}

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

import OpenAIMocked from 'openai';
const OpenAIConstructor = OpenAIMocked as unknown as jest.Mock;

describe('OpenAiAdapter', () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  let previousApiKey: string | undefined;

  beforeAll(() => {
    previousApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test';
  });

  afterAll(() => {
    if (previousApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousApiKey;
    }
    void originalApiKey;
  });

  beforeEach(() => {
    OpenAIConstructor.mockClear();
  });

  describe('generateText', () => {
    it('uses request.model when provided, overriding the hard-coded default', async () => {
      const adapter = new OpenAiAdapter();
      const instance = OpenAIConstructor.mock.results[0]
        .value as MockOpenAIClient;
      instance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      await adapter.generateText({
        prompt: 'switch me',
        model: 'gpt-4o',
      });

      const callArg = instance.chat.completions.create.mock.calls[0][0];
      expect(callArg.model).toBe('gpt-4o');
    });

    it('falls back to the hard-coded gpt-4o-mini when request.model is omitted', async () => {
      const adapter = new OpenAiAdapter();
      const instance = OpenAIConstructor.mock.results[0]
        .value as MockOpenAIClient;
      instance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      await adapter.generateText({ prompt: 'default model please' });

      const callArg = instance.chat.completions.create.mock.calls[0][0];
      expect(callArg.model).toBe('gpt-4o-mini');
    });

    it('builds a multimodal content array when imageBase64 is provided', async () => {
      const adapter = new OpenAiAdapter();
      const instance = OpenAIConstructor.mock.results[0]
        .value as MockOpenAIClient;
      instance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      await adapter.generateText({
        prompt: 'describe this',
        imageBase64: 'AAAA',
        mimeType: 'image/png',
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
    });

    it('returns an empty string when the response has no content', async () => {
      const adapter = new OpenAiAdapter();
      const instance = OpenAIConstructor.mock.results[0]
        .value as MockOpenAIClient;
      instance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const result = await adapter.generateText({ prompt: 'say nothing' });
      expect(result).toBe('');
    });
  });

  describe('isAvailable', () => {
    it('returns true when OPENAI_API_KEY is set', async () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      const adapter = new OpenAiAdapter();
      await expect(adapter.isAvailable()).resolves.toBe(true);
    });

    it('returns false when OPENAI_API_KEY is empty', async () => {
      process.env.OPENAI_API_KEY = '';
      const adapter = new OpenAiAdapter();
      await expect(adapter.isAvailable()).resolves.toBe(false);
    });
  });
});
