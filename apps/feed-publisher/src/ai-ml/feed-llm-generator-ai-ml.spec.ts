import { LlmPort } from '../llm/application/ports/llm.port';
import { FeedLlmGenerator } from '../llm/infrastructure/llm/feed-llm-generator.adapter';
import { InMemoryLlmConfigRepository } from '../llm/infrastructure/persistence/in-memory/in-memory-llm-config.repository';
import { InMemoryPromptTemplateRepository } from '../llm/infrastructure/persistence/in-memory/in-memory-prompt-template.repository';
import type { LlmEntryView } from '../llm/domain/llm-entry.view';
import { AiMlParityService } from './application/services/ai-ml-parity.service';
import type { AiMlPromptClient } from './infrastructure/ai-ml-prompt-client';

class StubLlm extends LlmPort {
  public async generateText(request: { prompt: string }): Promise<string> {
    return 'generated:' + request.prompt.slice(0, 20);
  }
  public async isAvailable(): Promise<boolean> {
    return true;
  }
}

const entry = (): LlmEntryView => ({
  rawContent: 'bitcoin surges',
  rawTitle: null,
  imagePaths: [],
  keywordTemplateId: null,
});

const withEnv = async (
  vars: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> => {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
    if (vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(vars)) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
};

describe('FeedLlmGenerator ai-ml prompt dual-compare', () => {
  it('records matched when ai-ml resolves the same prompt content', async () => {
    await withEnv(
      { FEED_AI_ML_MODE: 'dual', USE_MOCK_AI: 'false' },
      async () => {
        const parity = new AiMlParityService();
        const promptClient = {
          resolve: jest.fn(async () => ({
            template: {
              content:
                'Rewrite the following crypto news for a Telegram channel, in Spanish, keeping facts intact:\n\n{{original}}',
              systemContent: 'You are a concise crypto-news editor.',
            },
            source: 'ai-ml',
          })),
        } as unknown as AiMlPromptClient;
        const generator = new FeedLlmGenerator(
          new StubLlm(),
          new InMemoryPromptTemplateRepository(),
          new InMemoryLlmConfigRepository(),
          promptClient,
          parity,
        );
        const generated = await generator.generateForEntry(entry());
        expect(generated.content.startsWith('generated:')).toBe(true);
        expect(parity.summary().prompts.matched).toBe(1);
      },
    );
  });

  it('records diverged on catalog drift but still serves local', async () => {
    await withEnv(
      { FEED_AI_ML_MODE: 'dual', USE_MOCK_AI: 'false' },
      async () => {
        const parity = new AiMlParityService();
        const promptClient = {
          resolve: jest.fn(async () => ({
            template: { content: 'drifted', systemContent: 'drifted' },
            source: 'ai-ml',
          })),
        } as unknown as AiMlPromptClient;
        const generator = new FeedLlmGenerator(
          new StubLlm(),
          new InMemoryPromptTemplateRepository(),
          new InMemoryLlmConfigRepository(),
          promptClient,
          parity,
        );
        const generated = await generator.generateForEntry(entry());
        expect(generated.content.startsWith('generated:')).toBe(true);
        expect(parity.summary().diverged).toBe(1);
        expect(() => parity.assertNoDivergence()).toThrow(
          'ai-ml dual-run diverged',
        );
      },
    );
  });

  it('records skipped when ai-ml is unreachable (serving unaffected)', async () => {
    await withEnv(
      { FEED_AI_ML_MODE: 'dual', USE_MOCK_AI: 'false' },
      async () => {
        const parity = new AiMlParityService();
        const promptClient = {
          resolve: jest.fn(async () => {
            throw new Error('ECONNREFUSED');
          }),
        } as unknown as AiMlPromptClient;
        const generator = new FeedLlmGenerator(
          new StubLlm(),
          new InMemoryPromptTemplateRepository(),
          new InMemoryLlmConfigRepository(),
          promptClient,
          parity,
        );
        const generated = await generator.generateForEntry(entry());
        expect(generated.content.startsWith('generated:')).toBe(true);
        expect(parity.summary().prompts.skipped).toBe(1);
        expect(() => parity.assertNoDivergence()).not.toThrow();
      },
    );
  });
});
