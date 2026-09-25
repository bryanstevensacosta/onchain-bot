import { LlmArticleRendererAdapter } from './llm-article-renderer.adapter';
import { LlmFailedError } from 'shared/exceptions/feed-publisher.error';
import { LlmConfig } from '../../domain/llm-config.entity';
import { PublisherQueueEntry } from '../../../queue/domain/publisher-queue-entry.entity';
import type { LlmConfigRepository } from '../../domain/ports/llm-config.repository';

const base = {
  defaultTemplateId: 'default-feed',
  dailyCap: 36,
  dailyResetUtcHour: 0,
  randomDelayMinMs: 1000,
  randomDelayMaxMs: 5000,
  llmMaxAttempts: 3,
};

const entry = (rawContent: string): PublisherQueueEntry =>
  PublisherQueueEntry.create({
    contentType: 'crypto-news',
    channelId: '-1001',
    messageId: 7,
    rawContent,
    rawTitle: null,
    imagePaths: [],
  });

const configRepo = (cfg: LlmConfig): LlmConfigRepository =>
  ({
    load: async (): Promise<LlmConfig> => cfg,
    save: async (next: LlmConfig): Promise<LlmConfig> => next,
  }) as LlmConfigRepository;

describe('LlmArticleRendererAdapter (drain-path flags)', () => {
  it('passes raw content through when the LLM flag is off (no generation)', async () => {
    const generator = {
      generateForEntry: async (): Promise<never> => {
        throw new Error('must not be called');
      },
    } as never;
    const renderer = new LlmArticleRendererAdapter(
      generator,
      configRepo(LlmConfig.load({ ...base, llmEnabled: false, publishingEnabled: true })),
    );
    await expect(renderer.render(entry('crudo'))).resolves.toEqual({
      content: 'crudo',
    });
  });

  it('passes raw content through when publishing is off (LLM inactive)', async () => {
    const generator = {
      generateForEntry: async (): Promise<never> => {
        throw new Error('must not be called');
      },
    } as never;
    const renderer = new LlmArticleRendererAdapter(
      generator,
      configRepo(LlmConfig.load({ ...base, llmEnabled: true, publishingEnabled: false })),
    );
    await expect(renderer.render(entry('crudo'))).resolves.toEqual({
      content: 'crudo',
    });
  });

  it('generates via the gateway when llm AND publishing are on', async () => {
    const generator = {
      generateForEntry: async (): Promise<{ content: string }> => ({
        content: 'Noticia refinada',
      }),
    } as never;
    const renderer = new LlmArticleRendererAdapter(
      generator,
      configRepo(LlmConfig.load({ ...base, llmEnabled: true, publishingEnabled: true })),
    );
    await expect(renderer.render(entry('crudo'))).resolves.toEqual({
      content: 'Noticia refinada',
    });
  });

  it('rejects non-Latin generation when rejectNonLatin is on', async () => {
    const generator = {
      generateForEntry: async (): Promise<{ content: string }> => ({
        content: '价格上涨 hoy',
      }),
    } as never;
    const renderer = new LlmArticleRendererAdapter(
      generator,
      configRepo(
        LlmConfig.load({ ...base, llmEnabled: true, publishingEnabled: true }),
      ),
    );
    await expect(renderer.render(entry('crudo'))).rejects.toBeInstanceOf(
      LlmFailedError,
    );
  });

  it('rejects empty generation so the drain retries instead of publishing blank', async () => {
    const generator = {
      generateForEntry: async (): Promise<{ content: string }> => ({
        content: '   ',
      }),
    } as never;
    const renderer = new LlmArticleRendererAdapter(
      generator,
      configRepo(
        LlmConfig.load({ ...base, llmEnabled: true, publishingEnabled: true }),
      ),
    );
    await expect(renderer.render(entry('crudo'))).rejects.toBeInstanceOf(
      LlmFailedError,
    );
  });
});
