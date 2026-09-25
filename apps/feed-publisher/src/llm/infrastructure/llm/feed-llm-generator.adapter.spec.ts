import { FeedLlmGenerator } from './feed-llm-generator.adapter';
import { LlmPort, type LlmGenerateRequest } from '../../application/ports/llm.port';
import { LlmFailedError } from 'shared/exceptions/feed-publisher.error';
import { LlmConfig } from '../../domain/llm-config.entity';
import { PromptTemplate } from '../../domain/prompt-template.entity';
import { PublisherQueueEntry } from '../../../queue/domain/publisher-queue-entry.entity';
import type { LlmConfigRepository } from '../../domain/ports/llm-config.repository';
import type { PromptTemplateRepository } from '../../domain/ports/prompt-template.repository';

class FakeLlmPort extends LlmPort {
  public calls: LlmGenerateRequest[] = [];
  public constructor(private readonly handler: (req: LlmGenerateRequest) => Promise<string>) {
    super();
  }
  public async generateText(request: LlmGenerateRequest): Promise<string> {
    this.calls.push(request);
    return this.handler(request);
  }
  public async isAvailable(): Promise<boolean> {
    return true;
  }
}

const seedConfig = (): LlmConfig =>
  LlmConfig.load({
    defaultTemplateId: 'default-feed',
    dailyCap: 36,
    dailyResetUtcHour: 0,
    randomDelayMinMs: 1000,
    randomDelayMaxMs: 5000,
    llmMaxAttempts: 3,
  });

const seedTemplate = (): PromptTemplate =>
  PromptTemplate.create({
    id: 'default-feed',
    name: 'default-feed',
    model: 'gpt-4o-mini',
    maxTokens: 800,
    temperature: 0.7,
    promptText: 'Title: {{title}}\nBody: {{original}}\nImage: {{hasImage}}',
  });

const entry = (overrides?: {
  rawContent?: string;
  rawTitle?: string | null;
  imagePaths?: string[];
  keywordTemplateId?: string | null;
}): PublisherQueueEntry =>
  PublisherQueueEntry.create({
    contentType: 'crypto-news',
    channelId: 'playground-preview',
    messageId: 0,
    rawContent: overrides?.rawContent ?? 'Bitcoin rompe maximos',
    rawTitle: overrides?.rawTitle ?? 'Mercado',
    imagePaths: overrides?.imagePaths ?? [],
    keywordTemplateId: overrides?.keywordTemplateId ?? null,
  });

const repos = (template: PromptTemplate | null, failWith?: Error) => {
  const configRepo = {
    load: async (): Promise<LlmConfig> => seedConfig(),
    save: async (cfg: LlmConfig): Promise<LlmConfig> => cfg,
  } as LlmConfigRepository;
  const templateRepo = {
    findById: async (): Promise<PromptTemplate | null> => {
      if (failWith) throw failWith;
      return template;
    },
    findAll: async (): Promise<ReadonlyArray<PromptTemplate>> =>
      template ? [template] : [],
    save: async (t: PromptTemplate): Promise<PromptTemplate> => t,
    delete: async (): Promise<boolean> => true,
  } as PromptTemplateRepository;
  return { configRepo, templateRepo };
};

describe('FeedLlmGenerator', () => {
  const OLD_ENV = process.env.USE_MOCK_AI;
  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.USE_MOCK_AI;
    else process.env.USE_MOCK_AI = OLD_ENV;
  });

  it('short-circuits to raw content in mock mode without touching the gateway', async () => {
    process.env.USE_MOCK_AI = 'true';
    const port = new FakeLlmPort(async () => {
      throw new Error('must not be called');
    });
    const { configRepo, templateRepo } = repos(null);
    const generator = new FeedLlmGenerator(port, templateRepo, configRepo);
    const result = await generator.generateForEntry(entry());
    expect(result.content).toBe('Bitcoin rompe maximos');
    expect(result.model).toBe('mock');
    expect(port.calls).toHaveLength(0);
  });

  it('resolves the keyword-bound template over the default and renders placeholders', async () => {
    process.env.USE_MOCK_AI = 'false';
    const keyword = PromptTemplate.create({
      id: 'kw-1',
      name: 'kw-1',
      model: 'custom-model',
      maxTokens: 100,
      temperature: 0.2,
      promptText: 'T:{{title}} O:{{original}} I:{{hasImage}}',
    });
    const port = new FakeLlmPort(async () => 'GENERATED');
    const { configRepo, templateRepo } = repos(seedTemplate());
    (templateRepo.findById as unknown as (id: string) => Promise<PromptTemplate | null>) =
      async (id: string) => (id === 'kw-1' ? keyword : seedTemplate());
    const generator = new FeedLlmGenerator(port, templateRepo, configRepo);
    const result = await generator.generateForEntry(
      entry({ keywordTemplateId: 'kw-1' }),
    );
    expect(result.model).toBe('custom-model');
    expect(result.userPrompt).toBe('T:Mercado O:Bitcoin rompe maximos I:no');
    expect(result.content).toBe('GENERATED');
    expect(port.calls[0].maxTokens).toBe(100);
  });

  it('throws LlmFailedError when the resolved template is missing', async () => {
    process.env.USE_MOCK_AI = 'false';
    const port = new FakeLlmPort(async () => 'x');
    const { configRepo, templateRepo } = repos(null);
    const generator = new FeedLlmGenerator(port, templateRepo, configRepo);
    await expect(generator.generateForEntry(entry())).rejects.toBeInstanceOf(
      LlmFailedError,
    );
  });

  it('wraps gateway failures in LlmFailedError (FAILED + cron retry downstream)', async () => {
    process.env.USE_MOCK_AI = 'false';
    const port = new FakeLlmPort(async () => {
      throw new Error('gateway down');
    });
    const { configRepo, templateRepo } = repos(seedTemplate());
    const generator = new FeedLlmGenerator(port, templateRepo, configRepo);
    await expect(generator.generateForEntry(entry())).rejects.toBeInstanceOf(
      LlmFailedError,
    );
  });

  it('skips unreadable images fail-open instead of failing generation', async () => {
    process.env.USE_MOCK_AI = 'false';
    const port = new FakeLlmPort(async () => 'GENERATED');
    const { configRepo, templateRepo } = repos(seedTemplate());
    const generator = new FeedLlmGenerator(port, templateRepo, configRepo);
    const result = await generator.generateForEntry(
      entry({ imagePaths: ['/does/not/exist.jpg'] }),
    );
    expect(result.content).toBe('GENERATED');
    expect(port.calls[0].imageBase64).toBeUndefined();
  });
});
