import { isBlockingFailureReason } from 'shared/deduplication/domain/constants/blocking-failure-reasons';
import type { LlmPort } from 'shared/llm';
import { ThreadsQueueEntry } from 'threads/publisher/domain/entities/threads-queue-entry.entity';
import { ThreadsPromptTemplate } from 'threads/publisher/domain/entities/threads-prompt-template.entity';
import { ThreadsLlmConfig } from 'threads/publisher/domain/entities/threads-llm-config.entity';
import { ThreadsPromptTemplateRepository } from 'threads/publisher/application/ports/threads-prompt-template.repository';
import { ThreadsLlmConfigRepository } from 'threads/publisher/application/ports/threads-llm-config.repository';
import {
  THREADS_DEFAULT_TEMPLATE_ID,
  THREADS_DEFAULT_TEMPLATE_SEED,
  InMemoryThreadsPromptTemplateRepository,
} from 'threads/publisher/application/repositories/in-memory-threads-prompt-template.repository';
import {
  ThreadsLlmAdapter,
  enforceThreadsConstraints,
  renderPrompt,
} from './threads-llm.adapter';

const buildEntry = (overrides: {
  rawTitle?: string | null;
  rawContent?: string;
  imagePath?: string | null;
  keywordTemplateId?: string | null;
}): ThreadsQueueEntry =>
  ThreadsQueueEntry.create({
    channelId: '-100123',
    messageId: 7,
    rawContent: overrides.rawContent ?? 'Bitcoin hits $100k today',
    rawTitle: overrides.rawTitle === undefined ? 'BTC $100k' : overrides.rawTitle,
    imagePath: overrides.imagePath === undefined ? null : overrides.imagePath,
    groupedId: null,
    messageReceivedAt: new Date('2026-09-15T12:00:00Z'),
    keywordTemplateId:
      overrides.keywordTemplateId === undefined
        ? null
        : overrides.keywordTemplateId,
  });

const buildTemplate = (
  id: string,
  overrides: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    promptText?: string;
    systemPromptText?: string;
  } = {},
): ThreadsPromptTemplate =>
  ThreadsPromptTemplate.create({
    id,
    name: `tpl-${id.slice(-8)}`,
    model: overrides.model ?? 'llm-test-model',
    maxTokens: overrides.maxTokens ?? 1234,
    temperature: overrides.temperature ?? 0.42,
    reasoningEffort: null,
    promptText: overrides.promptText ?? 'Title:{{title}} Body:{{original}}',
    systemPromptText: overrides.systemPromptText ?? '',
  });

const buildConfig = (overrides: {
  defaultTemplateId?: string;
  llmMaxAttempts?: number;
}): ThreadsLlmConfig =>
  ThreadsLlmConfig.load({
    defaultTemplateId:
      overrides.defaultTemplateId ?? THREADS_DEFAULT_TEMPLATE_ID,
    dailyCap: 60,
    dailyResetUtcHour: 4,
    randomDelayMinMs: 60_000,
    randomDelayMaxMs: 300_000,
    llmMaxAttempts: overrides.llmMaxAttempts ?? 3,
  });

describe('ThreadsLlmAdapter llm', () => {
  let llmPort: jest.Mocked<LlmPort>;
  let templateRepo: jest.Mocked<ThreadsPromptTemplateRepository>;
  let llmConfigRepo: jest.Mocked<ThreadsLlmConfigRepository>;
  let adapter: ThreadsLlmAdapter;

  beforeEach(() => {
    delete process.env.USE_MOCK_AI;
    llmPort = {
      generateText: jest.fn(),
      isAvailable: jest.fn(),
    };
    llmPort.generateText.mockResolvedValue('short refined post');
    templateRepo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByIds: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    templateRepo.findById.mockImplementation(async (id: string) =>
      id === THREADS_DEFAULT_TEMPLATE_ID
        ? buildTemplate(THREADS_DEFAULT_TEMPLATE_ID)
        : null,
    );
    llmConfigRepo = {
      load: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    llmConfigRepo.load.mockResolvedValue(buildConfig({}));
    adapter = new ThreadsLlmAdapter(llmPort, templateRepo, llmConfigRepo);
  });

  it('llm resolves templateId=null fallback to cfg.defaultTemplateId', async () => {
    const entry = buildEntry({ keywordTemplateId: null });
    const result = await adapter.generateForEntry(entry);
    expect(templateRepo.findById).toHaveBeenCalledWith(
      THREADS_DEFAULT_TEMPLATE_ID,
    );
    expect(result.content).toBe('short refined post');
    expect(result.model).toBe('llm-test-model');
  });

  it('llm prefers the keyword-bound templateId when set', async () => {
    const overrideId = '11111111-1111-4111-8111-111111111111';
    templateRepo.findById.mockImplementation(async (id: string) => {
      if (id === overrideId) {
        return buildTemplate(overrideId, { model: 'override-model' });
      }
      return buildTemplate(THREADS_DEFAULT_TEMPLATE_ID);
    });
    const entry = buildEntry({ keywordTemplateId: overrideId });
    const result = await adapter.generateForEntry(entry);
    expect(templateRepo.findById).toHaveBeenCalledWith(overrideId);
    expect(result.model).toBe('override-model');
  });

  it('llm falls back to the threads-default seed when the row is missing', async () => {
    templateRepo.findById.mockResolvedValue(null);
    const entry = buildEntry({ keywordTemplateId: null });
    const result = await adapter.generateForEntry(entry);
    expect(result.content).toBe('short refined post');
    expect(result.model).toBe(THREADS_DEFAULT_TEMPLATE_SEED.model);
  });

  it('llm output is truncated to ≤500 chars (never rejected)', async () => {
    llmPort.generateText.mockResolvedValue('x'.repeat(600));
    const result = await adapter.generateForEntry(buildEntry({}));
    expect(result.content.length).toBeLessThanOrEqual(500);
    expect(result.content.endsWith('…')).toBe(true);
  });

  it('llm output strips Telegram HTML markup', async () => {
    llmPort.generateText.mockResolvedValue(
      '<b>Bitcoin</b> hits <a href="https://x.example">$100k</a> today',
    );
    const result = await adapter.generateForEntry(buildEntry({}));
    expect(result.content).toBe('Bitcoin hits $100k today');
    expect(result.content).not.toMatch(/<[^>]+>/);
  });

  it('llm forwards template knobs (model/maxTokens/temperature) to LlmPort', async () => {
    await adapter.generateForEntry(buildEntry({}));
    expect(llmPort.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'llm-test-model',
        maxTokens: 1234,
        temperature: 0.42,
        imageBase64: undefined,
      }),
    );
  });

  it('llm TEXT-only: media present logs media_skipped and never sends vision payload', async () => {
    await adapter.generateForEntry(
      buildEntry({ imagePath: '/tmp/photo.jpg' }),
    );
    const call = llmPort.generateText.mock.calls[0]?.[0] as
      | { imageBase64?: string; prompt?: string }
      | undefined;
    expect(call?.imageBase64).toBeUndefined();
    expect(adapter.renderPromptFor('img:{{hasImage}}', buildEntry({}))).toBe(
      'img:no',
    );
  });

  it('llm timeout is reintentable: retries up to llmMaxAttempts then throws (not blocking)', async () => {
    const timeout = new Error('LLM gateway request failed: timeout');
    llmPort.generateText.mockRejectedValue(timeout);
    await expect(adapter.generateForEntry(buildEntry({}))).rejects.toThrow(
      'timeout',
    );
    expect(llmPort.generateText).toHaveBeenCalledTimes(3);
    expect(isBlockingFailureReason('LLM gateway request failed: timeout')).toBe(
      false,
    );
  });

  it('llm blocking failure throws immediately without retry', async () => {
    llmPort.generateText.mockRejectedValue(
      new Error('Content violates policy'),
    );
    await expect(adapter.generateForEntry(buildEntry({}))).rejects.toThrow(
      'Content violates policy',
    );
    expect(llmPort.generateText).toHaveBeenCalledTimes(1);
  });

  it('llm USE_MOCK_AI returns raw content without calling the gateway', async () => {
    process.env.USE_MOCK_AI = 'true';
    const entry = buildEntry({ rawContent: 'raw crypto update' });
    const result = await adapter.generateForEntry(entry);
    expect(result.content).toBe('raw crypto update');
    expect(result.model).toBe('mock');
    expect(llmPort.generateText).not.toHaveBeenCalled();
    delete process.env.USE_MOCK_AI;
  });

  it('llm renderPrompt substitutes title/original in one pass', () => {
    const prompt = renderPrompt('T:{{title}} O:{{original}}', buildEntry({}));
    expect(prompt).toBe('T:BTC $100k O:Bitcoin hits $100k today');
  });

  it('llm enforceThreadsConstraints keeps short text untouched', () => {
    expect(enforceThreadsConstraints('  hello  ')).toBe('hello');
  });
});

describe('threads-default llm seed', () => {
  it('llm seed threads-default pins model/maxTokens/temperature/vision', async () => {
    const repo = new InMemoryThreadsPromptTemplateRepository();
    const seed = await repo.findById(THREADS_DEFAULT_TEMPLATE_ID);
    expect(seed).not.toBeNull();
    expect(seed?.model).toBe('opencode-zen/deepseek-v4-flash');
    expect(seed?.maxTokens).toBe(2000);
    expect(seed?.temperature).toBe(0.7);
    expect(seed?.supportsVision).toBe(false);
    expect(seed?.reasoningEffort).toBeNull();
  });

  it('llm seed promptText demands <500 chars plain text with no Telegram formatting', async () => {
    const repo = new InMemoryThreadsPromptTemplateRepository();
    const seed = await repo.findById(THREADS_DEFAULT_TEMPLATE_ID);
    expect(seed?.promptText).toContain('<500');
    expect(seed?.promptText).toMatch(/plain text/i);
    expect(seed?.promptText).toMatch(/NO.*Telegram formatting|no .*Telegram formatting/i);
  });

  it('llm seed renders a prompt demanding <500 chars', async () => {
    const repo = new InMemoryThreadsPromptTemplateRepository();
    const seed = await repo.findById(THREADS_DEFAULT_TEMPLATE_ID);
    const rendered = renderPrompt(seed?.promptText ?? '', buildEntry({}));
    expect(rendered).toContain('<500');
    expect(rendered).toContain('Bitcoin hits $100k today');
  });
});
