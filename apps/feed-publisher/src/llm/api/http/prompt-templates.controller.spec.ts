import { ConflictException, NotFoundException } from '@nestjs/common';
import { PromptTemplatesController } from './prompt-templates.controller';
import { LlmConfig } from '../../domain/llm-config.entity';
import { PromptTemplate } from '../../domain/prompt-template.entity';
import { Keyword } from '../../../keywords/domain/keyword.entity';
import type { LlmConfigRepository } from '../../domain/ports/llm-config.repository';
import type { PromptTemplateRepository } from '../../domain/ports/prompt-template.repository';
import type { KeywordRepository } from '../../../keywords/application/ports/keyword.repository';

const base = {
  defaultTemplateId: 'default-feed',
  dailyCap: 36,
  dailyResetUtcHour: 0,
  randomDelayMinMs: 1000,
  randomDelayMaxMs: 5000,
  llmMaxAttempts: 3,
};

const template = (name: string): PromptTemplate =>
  PromptTemplate.create({
    name,
    model: 'gpt-4o-mini',
    maxTokens: 800,
    temperature: 0.7,
    promptText: 'Rewrite:\n{{original}}',
  });

const harness = (opts?: {
  keywords?: Keyword[];
}): {
  controller: PromptTemplatesController;
  store: Map<string, PromptTemplate>;
} => {
  const store = new Map<string, PromptTemplate>();
  const seeded = template('default-feed');
  (seeded as { id?: string }).id = 'default-feed';
  store.set('default-feed', PromptTemplate.reconstitute({
    id: 'default-feed',
    name: 'default-feed',
    description: null,
    contentType: 'global',
    model: 'gpt-4o-mini',
    supportsVision: true,
    maxTokens: 800,
    temperature: 0.7,
    reasoningEffort: null,
    promptText: 'Rewrite:\n{{original}}',
    systemPromptText: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  const templateRepo = {
    findAll: async (): Promise<ReadonlyArray<PromptTemplate>> => [...store.values()],
    findById: async (id: string): Promise<PromptTemplate | null> =>
      store.get(id) ?? null,
    save: async (t: PromptTemplate): Promise<PromptTemplate> => {
      store.set(t.id, t);
      return t;
    },
    delete: async (id: string): Promise<boolean> => store.delete(id),
  } as PromptTemplateRepository;
  const llmRepo = {
    load: async (): Promise<LlmConfig> => LlmConfig.load({ ...base }),
    save: async (cfg: LlmConfig): Promise<LlmConfig> => cfg,
  } as LlmConfigRepository;
  const keywordRepo = {
    findAll: async (): Promise<ReadonlyArray<Keyword>> => opts?.keywords ?? [],
    findEnabled: async (): Promise<ReadonlyArray<Keyword>> => opts?.keywords ?? [],
    save: async (): Promise<void> => undefined,
    delete: async (): Promise<void> => undefined,
  } as KeywordRepository;
  return {
    controller: new PromptTemplatesController(templateRepo, llmRepo, keywordRepo),
    store,
  };
};

describe('PromptTemplatesController', () => {
  it('lists and reads templates', async () => {
    const { controller } = harness();
    await expect(controller.listTemplates()).resolves.toHaveLength(1);
    await expect(controller.getTemplate('default-feed')).resolves.toMatchObject({
      id: 'default-feed',
    });
    await expect(controller.getTemplate('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('creates templates and rejects duplicate names with 409', async () => {
    const { controller } = harness();
    const created = await controller.createTemplate({
      name: 'threads-digest',
      model: 'gpt-4o-mini',
      maxTokens: 800,
      temperature: 0.7,
      promptText: 'Digest:\n{{original}}',
    });
    expect(created.name).toBe('threads-digest');
    await expect(
      controller.createTemplate({
        name: 'threads-digest',
        model: 'gpt-4o-mini',
        maxTokens: 800,
        temperature: 0.7,
        promptText: 'Digest:\n{{original}}',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to delete the default-bound template (409)', async () => {
    const { controller } = harness();
    await expect(controller.deleteTemplate('default-feed')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses to delete a keyword-bound template (409)', async () => {
    const bound = Keyword.create({
      phrase: 'bitcoin',
      matchMode: 'substring',
      templateId: 'kw-bound',
    });
    const store = new Map<string, PromptTemplate>();
    store.set(
      'kw-bound',
      PromptTemplate.reconstitute({
        id: 'kw-bound',
        name: 'kw-bound',
        description: null,
        contentType: 'global',
        model: 'gpt-4o-mini',
        supportsVision: true,
        maxTokens: 800,
        temperature: 0.7,
        reasoningEffort: null,
        promptText: 'x {{original}}',
        systemPromptText: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const templateRepo = {
      findAll: async (): Promise<ReadonlyArray<PromptTemplate>> => [...store.values()],
      findById: async (id: string): Promise<PromptTemplate | null> =>
        store.get(id) ?? null,
      save: async (t: PromptTemplate): Promise<PromptTemplate> => t,
      delete: async (id: string): Promise<boolean> => store.delete(id),
    } as PromptTemplateRepository;
    const llmRepo = {
      load: async (): Promise<LlmConfig> => LlmConfig.load({ ...base }),
      save: async (cfg: LlmConfig): Promise<LlmConfig> => cfg,
    } as LlmConfigRepository;
    const keywordRepo = {
      findAll: async (): Promise<ReadonlyArray<Keyword>> => [bound],
      findEnabled: async (): Promise<ReadonlyArray<Keyword>> => [bound],
      save: async (): Promise<void> => undefined,
      delete: async (): Promise<void> => undefined,
    } as KeywordRepository;
    const controller = new PromptTemplatesController(templateRepo, llmRepo, keywordRepo);
    await expect(controller.deleteTemplate('kw-bound')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
