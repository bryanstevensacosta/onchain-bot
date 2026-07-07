import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { LlmConfigController } from './llm-config.controller';
import { PromptTemplateRepository } from 'telegram/crypto-news-publisher/application/ports/prompt-template.repository';
import { LlmConfigRepository } from 'telegram/crypto-news-publisher/application/ports/llm-config.repository';
import { KeywordRepository } from 'telegram/crypto-news-publisher/application/ports/keyword.repository';
import { GetLlmModelsUseCase } from 'telegram/crypto-news-publisher/application/handlers/get-llm-models.use-case';
import { PromptTemplate } from 'telegram/crypto-news-publisher/domain/entities/prompt-template.entity';
import { LlmConfig } from 'telegram/crypto-news-publisher/domain/entities/llm-config.entity';
import { Keyword } from 'telegram/crypto-news-publisher/domain/entities/keyword.entity';

const DEFAULT_TEMPLATE_ID = '00000000-0000-4000-8000-000000000001';

const buildTemplate = (overrides: {
  id?: string;
  name?: string;
}): PromptTemplate =>
  PromptTemplate.create({
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? `tpl-${Math.random().toString(36).slice(2, 6)}`,
    model: 'gpt-test',
    maxTokens: 1000,
    temperature: 0.5,
    promptText: 'hello',
  });

const buildLlmConfig = (defaultTemplateId: string): LlmConfig =>
  LlmConfig.load({
    defaultTemplateId,
    targetChannel: '@ch',
    enabled: true,
    dailyCap: 12,
    dailyResetUtcHour: 4,
    randomDelayMinMs: 60_000,
    randomDelayMaxMs: 600_000,
    llmMaxAttempts: 3,
  });

describe('LlmConfigController', () => {
  let controller: LlmConfigController;
  let templateRepo: jest.Mocked<PromptTemplateRepository>;
  let llmConfigRepo: jest.Mocked<LlmConfigRepository>;
  let keywordRepo: jest.Mocked<KeywordRepository>;
  let getLlmModels: jest.Mocked<GetLlmModelsUseCase>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LlmConfigController],
      providers: [
        {
          provide: PromptTemplateRepository,
          useValue: {
            findAll: jest.fn(),
            findById: jest.fn(),
            findByIds: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: LlmConfigRepository,
          useValue: {
            load: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: KeywordRepository,
          useValue: {
            findAll: jest.fn(),
            findEnabled: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: GetLlmModelsUseCase,
          useValue: {
            execute: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(LlmConfigController);
    templateRepo = module.get(PromptTemplateRepository);
    llmConfigRepo = module.get(LlmConfigRepository);
    keywordRepo = module.get(KeywordRepository);
    getLlmModels = module.get(GetLlmModelsUseCase);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listModels', () => {
    it('returns the gateway model list', async () => {
      getLlmModels.execute.mockResolvedValue([
        { id: 'gpt-4o-mini', ownedBy: 'openai' },
        { id: 'opencode-zen/deepseek-v4-flash' },
      ]);
      const result = await controller.listModels();
      expect(result).toHaveLength(2);
    });

    it('wraps gateway errors as 502 with a clear message', async () => {
      getLlmModels.execute.mockRejectedValue(new Error('connection refused'));
      await expect(controller.listModels()).rejects.toBeInstanceOf(
        HttpException,
      );
      try {
        await controller.listModels();
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        const httpErr = err as HttpException;
        expect(httpErr.getStatus()).toBe(502);
        const body = httpErr.getResponse() as { error: string };
        expect(body.error).toBe('gateway unreachable');
      }
    });
  });

  describe('listTemplates', () => {
    it('returns views for every template', async () => {
      const tpls = [
        buildTemplate({ name: 'Alpha' }),
        buildTemplate({ name: 'Bravo' }),
      ];
      templateRepo.findAll.mockResolvedValue(tpls);
      const result = await controller.listTemplates();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Alpha');
      expect(result[1].name).toBe('Bravo');
    });
  });

  describe('getTemplate', () => {
    it('returns the template view when found', async () => {
      const tpl = buildTemplate({ name: 'Alpha' });
      templateRepo.findById.mockResolvedValue(tpl);
      const result = await controller.getTemplate(tpl.id);
      expect(result.id).toBe(tpl.id);
      expect(result.name).toBe('Alpha');
    });

    it('throws 404 when missing', async () => {
      templateRepo.findById.mockResolvedValue(null);
      await expect(controller.getTemplate('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('createTemplate', () => {
    it('builds + persists a new template and returns the view', async () => {
      templateRepo.save.mockImplementation(async (t) => t);
      const result = await controller.createTemplate({
        name: 'Alpha',
        model: 'gpt-test',
        maxTokens: 1500,
        temperature: 0.3,
        reasoningEffort: 'high',
        promptText: 'Hi {{original}}',
      });
      expect(result.name).toBe('Alpha');
      expect(result.maxTokens).toBe(1500);
      expect(result.reasoningEffort).toBe('high');
      expect(templateRepo.save).toHaveBeenCalledTimes(1);
    });

    it('maps a unique-name violation to 409', async () => {
      templateRepo.save.mockRejectedValue({ code: '23505' });
      await expect(
        controller.createTemplate({
          name: 'Alpha',
          model: 'gpt-test',
          maxTokens: 1500,
          temperature: 0.3,
          promptText: 'Hi {{original}}',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('updateTemplate', () => {
    it('returns 404 when the template is missing', async () => {
      templateRepo.findById.mockResolvedValue(null);
      await expect(
        controller.updateTemplate('nope', { name: 'Whatever' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('applies the patch and persists', async () => {
      const existing = buildTemplate({ name: 'Old' });
      templateRepo.findById.mockResolvedValue(existing);
      templateRepo.save.mockImplementation(async (t) => t);
      const result = await controller.updateTemplate(existing.id, {
        name: 'Renamed',
        temperature: 0.9,
      });
      expect(result.name).toBe('Renamed');
      expect(result.temperature).toBe(0.9);
    });

    it('maps unique-name violation to 409', async () => {
      const existing = buildTemplate({ name: 'Original' });
      templateRepo.findById.mockResolvedValue(existing);
      templateRepo.save.mockRejectedValue({ code: '23505' });
      await expect(
        controller.updateTemplate(existing.id, { name: 'Duplicate' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('deleteTemplate', () => {
    it('returns 404 when missing', async () => {
      templateRepo.findById.mockResolvedValue(null);
      await expect(controller.deleteTemplate('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses when the template is the LlmConfig default', async () => {
      const tpl = buildTemplate({ id: DEFAULT_TEMPLATE_ID });
      templateRepo.findById.mockResolvedValue(tpl);
      llmConfigRepo.load.mockResolvedValue(buildLlmConfig(DEFAULT_TEMPLATE_ID));
      keywordRepo.findAll.mockResolvedValue([]);

      await expect(
        controller.deleteTemplate(DEFAULT_TEMPLATE_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(templateRepo.delete).not.toHaveBeenCalled();
    });

    it('refuses when N keywords bind to the template', async () => {
      const tplId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const tpl = buildTemplate({ id: tplId });
      templateRepo.findById.mockResolvedValue(tpl);
      llmConfigRepo.load.mockResolvedValue(buildLlmConfig('different-default'));
      keywordRepo.findAll.mockResolvedValue([
        Keyword.create({ phrase: 'btc', templateId: tplId }),
        Keyword.create({ phrase: 'eth', templateId: tplId }),
        Keyword.create({ phrase: 'sol' }),
      ]);

      await expect(controller.deleteTemplate(tplId)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(templateRepo.delete).not.toHaveBeenCalled();
    });

    it('deletes when no references exist', async () => {
      const tpl = buildTemplate({});
      templateRepo.findById.mockResolvedValue(tpl);
      llmConfigRepo.load.mockResolvedValue(buildLlmConfig('different-default'));
      keywordRepo.findAll.mockResolvedValue([]);

      await controller.deleteTemplate(tpl.id);
      expect(templateRepo.delete).toHaveBeenCalledWith(tpl.id);
    });
  });

  describe('getConfig / updateConfig', () => {
    it('returns the live config view', async () => {
      llmConfigRepo.load.mockResolvedValue(buildLlmConfig(DEFAULT_TEMPLATE_ID));
      const view = await controller.getConfig();
      expect(view.id).toBe(1);
      expect(view.defaultTemplateId).toBe(DEFAULT_TEMPLATE_ID);
    });

    it('patches the config and persists', async () => {
      const cfg = buildLlmConfig(DEFAULT_TEMPLATE_ID);
      llmConfigRepo.load.mockResolvedValue(cfg);
      llmConfigRepo.save.mockImplementation(async (c) => c);
      const newDefault = '11111111-1111-4111-8111-111111111111';
      const view = await controller.updateConfig({
        defaultTemplateId: newDefault,
        enabled: true,
        dailyCap: 7,
        llmMaxAttempts: 5,
      });
      expect(view.defaultTemplateId).toBe(newDefault);
      expect(view.dailyCap).toBe(7);
      expect(view.llmMaxAttempts).toBe(5);
      expect(llmConfigRepo.save).toHaveBeenCalled();
    });
  });
});
