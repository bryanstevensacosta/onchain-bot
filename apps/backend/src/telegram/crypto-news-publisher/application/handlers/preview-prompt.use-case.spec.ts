import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmPort } from 'shared/llm';
import { PromptTemplate } from 'telegram/crypto-news-publisher/domain/entities/prompt-template.entity';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';
import { PromptTemplateRepository } from 'telegram/crypto-news-publisher/application/ports/prompt-template.repository';
import { CryptoNewsLlmAdapter } from 'telegram/crypto-news-publisher/infrastructure/llm/crypto-news-llm.adapter';
import { PreviewPromptUseCase } from './preview-prompt.use-case';

describe('PreviewPromptUseCase', () => {
  let useCase: PreviewPromptUseCase;
  let llmAdapter: {
    renderPromptFor: jest.Mock;
    generateForEntry: jest.Mock;
  };
  let templateRepo: { findById: jest.Mock };
  let llmPort: { generateText: jest.Mock; isAvailable: jest.Mock };
  let configService: { get: jest.Mock };

  const buildTemplate = (): PromptTemplate =>
    PromptTemplate.create({
      id: 'tpl-1',
      name: 'tpl',
      model: 'tpl-model',
      maxTokens: 1500,
      temperature: 0.3,
      reasoningEffort: 'low',
      promptText: 'Title: {{title}} Body: {{original}}',
      systemPromptText: 'persona',
    });

  beforeEach(() => {
    llmAdapter = {
      renderPromptFor: jest.fn(
        (promptText: string, entry: PublisherQueueEntry) =>
          `${promptText} :: ${entry.rawContent}`,
      ),
      generateForEntry: jest.fn(),
    };
    templateRepo = { findById: jest.fn() };
    llmPort = {
      generateText: jest.fn().mockResolvedValue('generated'),
      isAvailable: jest.fn(),
    };
    configService = {
      get: jest
        .fn()
        .mockReturnValue({ llm: { gateway: { model: 'gateway-model' } } }),
    };
    useCase = new PreviewPromptUseCase(
      llmAdapter as unknown as CryptoNewsLlmAdapter,
      templateRepo as unknown as PromptTemplateRepository,
      llmPort,
      configService as unknown as ConfigService,
    );
  });

  it('render-only with templateId returns the prompt without calling llmPort', async () => {
    const template = buildTemplate();
    templateRepo.findById.mockResolvedValue(template);

    const result = await useCase.execute({
      templateId: 'tpl-1',
      rawTitle: 'T',
      rawContent: 'hello world',
    });

    expect(templateRepo.findById).toHaveBeenCalledWith('tpl-1');
    expect(llmAdapter.renderPromptFor).toHaveBeenCalledTimes(1);
    const entry = llmAdapter.renderPromptFor.mock
      .calls[0][1] as PublisherQueueEntry;
    expect(entry.channelId).toBe('playground-preview');
    expect(entry.messageId).toBe(0);
    expect(llmPort.generateText).not.toHaveBeenCalled();
    expect(llmAdapter.generateForEntry).not.toHaveBeenCalled();
    expect(result).toEqual({
      renderedUserPrompt: expect.stringContaining('hello world'),
      systemPrompt: 'persona',
      model: 'tpl-model',
      maxTokens: 1500,
      temperature: 0.3,
      reasoningEffort: 'low',
      content: null,
    });
  });

  it('generate with templateId calls the adapter and returns content', async () => {
    const template = buildTemplate();
    templateRepo.findById.mockResolvedValue(template);
    llmAdapter.generateForEntry.mockResolvedValue({
      content: 'refined',
      systemPrompt: 'persona',
      userPrompt: 'rendered-user',
      temperature: 0.3,
      reasoningEffort: 'low',
      model: 'tpl-model',
    });

    const result = await useCase.execute({
      templateId: 'tpl-1',
      rawContent: 'hello world',
      generate: true,
    });

    expect(llmAdapter.generateForEntry).toHaveBeenCalledTimes(1);
    expect(llmPort.generateText).not.toHaveBeenCalled();
    expect(result.content).toBe('refined');
    expect(result.renderedUserPrompt).toBe('rendered-user');
    expect(result.maxTokens).toBe(1500);
  });

  it('draft generate calls llmPort directly with the draft knobs', async () => {
    const result = await useCase.execute({
      draft: {
        promptText: 'Draft {{original}}',
        systemPromptText: 'draft-persona',
        model: 'draft-model',
        maxTokens: 500,
        temperature: 0.9,
        reasoningEffort: 'high',
      },
      rawContent: 'raw body',
      generate: true,
    });

    expect(templateRepo.findById).not.toHaveBeenCalled();
    expect(llmAdapter.generateForEntry).not.toHaveBeenCalled();
    expect(llmPort.generateText).toHaveBeenCalledTimes(1);
    expect(llmPort.generateText).toHaveBeenCalledWith({
      prompt: expect.stringContaining('raw body'),
      systemPrompt: 'draft-persona',
      imageUrl: undefined,
      imageBase64: undefined,
      mimeType: undefined,
      model: 'draft-model',
      maxTokens: 500,
      temperature: 0.9,
      reasoningEffort: 'high',
    });
    expect(result.content).toBe('generated');
    expect(result.model).toBe('draft-model');
  });

  it('draft render-only falls back to gateway defaults for missing knobs', async () => {
    const result = await useCase.execute({
      draft: { promptText: 'Draft {{original}}' },
      rawContent: 'raw body',
    });

    expect(llmPort.generateText).not.toHaveBeenCalled();
    expect(result).toEqual({
      renderedUserPrompt: expect.stringContaining('raw body'),
      systemPrompt: null,
      model: 'gateway-model',
      maxTokens: 2000,
      temperature: 0.7,
      reasoningEffort: null,
      content: null,
    });
  });

  it('rejects with 400 when both templateId and draft are absent', async () => {
    await expect(
      useCase.execute({ rawContent: 'hello' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects with 400 when both templateId and draft are present', async () => {
    await expect(
      useCase.execute({
        templateId: 'tpl-1',
        draft: { promptText: 'x' },
        rawContent: 'hello',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects with 400 for empty rawContent', async () => {
    await expect(
      useCase.execute({ templateId: 'tpl-1', rawContent: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws 404 for an unknown templateId', async () => {
    templateRepo.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({ templateId: 'missing', rawContent: 'hello' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      useCase.execute({
        templateId: 'missing',
        rawContent: 'hello',
        generate: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(llmPort.generateText).not.toHaveBeenCalled();
    expect(llmAdapter.generateForEntry).not.toHaveBeenCalled();
  });

  it('never touches queue/throttle/publisher state (no such deps exist)', () => {
    const record = useCase as unknown as Record<string, unknown>;
    expect(record.queueRepo).toBeUndefined();
    expect(record.throttleRepo).toBeUndefined();
    expect(record.throttleScheduler).toBeUndefined();
    expect(record.slotArbitrator).toBeUndefined();
    expect(record.publisher).toBeUndefined();
    expect(record.queueRepository).toBeUndefined();
  });
});
