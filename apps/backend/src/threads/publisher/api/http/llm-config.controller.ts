import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ThreadsPromptTemplate } from 'threads/publisher/domain/entities/threads-prompt-template.entity';
import { ThreadsPromptTemplateRepository } from 'threads/publisher/application/ports/threads-prompt-template.repository';
import { ThreadsLlmConfigRepository } from 'threads/publisher/application/ports/threads-llm-config.repository';
import { ThreadsKeywordRepository } from 'threads/publisher/application/ports/threads-keyword.repository';
import { GetThreadsLlmModelsUseCase } from 'threads/publisher/application/handlers/get-threads-llm-models.use-case';
import {
  CreateThreadsPromptTemplateDto,
  UpdateThreadsLlmConfigDto,
  UpdateThreadsPromptTemplateDto,
} from 'threads/publisher/api/input/threads-llm-config.input';
import {
  isThreadsUniqueViolation,
  toThreadsConfigView,
  toThreadsTemplateView,
  type ThreadsLlmConfigView,
  type ThreadsPromptTemplateView,
} from 'threads/publisher/application/mappers/threads-llm-config.mapper';

export type {
  ThreadsLlmConfigView,
  ThreadsPromptTemplateView,
} from 'threads/publisher/application/mappers/threads-llm-config.mapper';

/**
 * REST API for the threads LLM configuration and the prompt
 * template library.
 *
 * Threads-typed mirror of the crypto-news `LlmConfigController`
 * (`telegram/crypto-news-publisher/api/http/llm-config.controller.ts`).
 *
 * Endpoints (all under `/threads-publisher/llm`):
 *  - GET    /models                                Gateway model list
 *  - GET    /templates                             All prompt templates
 *  - GET    /templates/:id                         Single template
 *  - POST   /templates                             Create template
 *  - PATCH  /templates/:id                         Partial update
 *  - DELETE /templates/:id                         Remove (409 if in use)
 *  - GET    /config                                Current ThreadsLlmConfig
 *  - PATCH  /config                                Partial update
 *
 * All request bodies are validated by `class-validator` (see
 * `../input/threads-llm-config.input.ts`); the global
 * `ValidationPipe` throws 400 on shape violations before this
 * controller is reached.
 *
 * Differences from the crypto-news mirror (deliberate):
 *  - NO per-config channel target: Threads publishes to the single
 *    authenticated account (token in `threads_oauth_tokens`), there
 *    is no per-config channel to validate.
 *  - NO `matchingEnabled` legacy field at all (not even deprecated):
 *    matching truth lives only in `threads_matching_configs` (T5
 *    `PATCH /threads/matching/config`). A smuggled `matchingEnabled`
 *    key is rejected with 400 + hint, mirroring the crypto-news
 *    deprecation guard.
 *  - PRODUCTION SAFETY: `PATCH /config` with `llmEnabled` returns
 *    400 when `NODE_ENV=production` (mirror of the crypto-news
 *    3-layer defense: backend guard + seed `llmEnabled=true` + T8
 *    frontend hide).
 *
 * The DELETE 409 is enforced here rather than at the repo because
 * the "in use" test needs to read both
 * `ThreadsLlmConfig.defaultTemplateId` and `ThreadsKeyword.templateId`
 * — easier to express at the controller boundary than inside the
 * persistence layer.
 */
@Controller(['threads-publisher/llm', 'feed-threads-publisher/llm'])
export class ThreadsLlmConfigController {
  public constructor(
    private readonly templateRepo: ThreadsPromptTemplateRepository,
    private readonly llmConfigRepo: ThreadsLlmConfigRepository,
    private readonly keywordRepo: ThreadsKeywordRepository,
    private readonly getLlmModels: GetThreadsLlmModelsUseCase,
  ) {}

  @Get('models')
  public async listModels(): Promise<
    ReadonlyArray<{ id: string; ownedBy?: string }>
  > {
    try {
      return await this.getLlmModels.execute();
    } catch (err) {
      throw new HttpException(
        {
          error: 'gateway unreachable',
          cause: err instanceof Error ? err.message : String(err),
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Get('templates')
  public async listTemplates(): Promise<
    ReadonlyArray<ThreadsPromptTemplateView>
  > {
    const all = await this.templateRepo.findAll();
    return all.map(toThreadsTemplateView);
  }

  @Get('templates/:id')
  public async getTemplate(
    @Param('id') id: string,
  ): Promise<ThreadsPromptTemplateView> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new NotFoundException(`PromptTemplate ${id} not found`);
    }
    return toThreadsTemplateView(template);
  }

  @Post('templates')
  public async createTemplate(
    @Body() dto: CreateThreadsPromptTemplateDto,
  ): Promise<ThreadsPromptTemplateView> {
    const created = ThreadsPromptTemplate.create({
      name: dto.name,
      description: dto.description ?? null,
      model: dto.model,
      supportsVision: dto.supportsVision ?? true,
      maxTokens: dto.maxTokens,
      temperature: dto.temperature,
      reasoningEffort: dto.reasoningEffort ?? null,
      promptText: dto.promptText,
      systemPromptText: dto.systemPromptText ?? '',
    });
    try {
      const saved = await this.templateRepo.save(created);
      return toThreadsTemplateView(saved);
    } catch (err) {
      if (isThreadsUniqueViolation(err)) {
        throw new ConflictException(
          `PromptTemplate name already exists: ${dto.name}`,
        );
      }
      throw err;
    }
  }

  @Patch('templates/:id')
  public async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateThreadsPromptTemplateDto,
  ): Promise<ThreadsPromptTemplateView> {
    const existing = await this.templateRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`PromptTemplate ${id} not found`);
    }
    existing.update({
      name: dto.name,
      description: dto.description,
      model: dto.model,
      supportsVision: dto.supportsVision,
      maxTokens: dto.maxTokens,
      temperature: dto.temperature,
      reasoningEffort: dto.reasoningEffort,
      promptText: dto.promptText,
      systemPromptText: dto.systemPromptText,
    });
    try {
      const saved = await this.templateRepo.save(existing);
      return toThreadsTemplateView(saved);
    } catch (err) {
      if (isThreadsUniqueViolation(err)) {
        throw new ConflictException(
          `PromptTemplate name already exists: ${dto.name ?? existing.name}`,
        );
      }
      throw err;
    }
  }

  @Delete('templates/:id')
  public async deleteTemplate(@Param('id') id: string): Promise<void> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new NotFoundException(`PromptTemplate ${id} not found`);
    }
    const cfg = await this.llmConfigRepo.load();
    const binding = await this.templateInUseBinding(id, cfg.defaultTemplateId);
    if (binding) {
      throw new ConflictException({
        error: `template in use: ${binding.reason}`,
      });
    }
    await this.templateRepo.delete(id);
  }

  @Get('config')
  public async getConfig(): Promise<ThreadsLlmConfigView> {
    const cfg = await this.llmConfigRepo.load();
    return toThreadsConfigView(cfg);
  }

  @Patch('config')
  public async updateConfig(
    @Body() dto: UpdateThreadsLlmConfigDto & { matchingEnabled?: unknown },
  ): Promise<ThreadsLlmConfigView> {
    // NO matchingEnabled legacy field on this endpoint: matching truth
    // lives only in `threads_matching_configs` (T5
    // `PATCH /threads/matching/config`). Reject smuggled values with a
    // hint so callers migrate (mirrors the crypto-news deprecation
    // guard; here the field never existed, not even as deprecated).
    if (dto.matchingEnabled !== undefined) {
      throw new BadRequestException({
        error:
          'matchingEnabled is not owned by this endpoint (single source of truth is threads_matching_configs)',
        hint: 'Use PATCH /threads/matching/config with { enabled } instead',
      });
    }

    // PRODUCTION SAFETY: Block llmEnabled changes in production.
    // In production, LLM generation must always be active to maintain
    // content quality. Only matching and publishing can be toggled.
    if (dto.llmEnabled !== undefined && process.env.NODE_ENV === 'production') {
      throw new BadRequestException({
        error:
          'llmEnabled cannot be changed in production (always enabled for quality)',
        hint: 'Use publishingEnabled to control pipeline (matching is owned by PATCH /threads/matching/config)',
      });
    }

    const cfg = await this.llmConfigRepo.load();
    if (dto.defaultTemplateId !== undefined) {
      cfg.setDefaultTemplateId(dto.defaultTemplateId);
    }
    cfg.update({
      llmEnabled: dto.llmEnabled,
      publishingEnabled: dto.publishingEnabled,
      rejectNonLatin: dto.rejectNonLatin,
      dailyCap: dto.dailyCap,
      dailyResetUtcHour: dto.dailyResetUtcHour,
      randomDelayMinMs: dto.randomDelayMinMs,
      randomDelayMaxMs: dto.randomDelayMaxMs,
      llmMaxAttempts: dto.llmMaxAttempts,
    });
    const saved = await this.llmConfigRepo.save(cfg);
    return toThreadsConfigView(saved);
  }

  private async templateInUseBinding(
    id: string,
    defaultTemplateId: string,
  ): Promise<{ reason: string } | null> {
    if (defaultTemplateId === id) {
      return { reason: 'set as default in ThreadsLlmConfig' };
    }
    const keywords = await this.keywordRepo.findAll();
    const bound = keywords.filter((kw) => kw.templateId === id);
    if (bound.length > 0) {
      const label =
        bound.length === 1 ? '1 keyword' : `${bound.length} keywords`;
      return { reason: `bound to ${label}` };
    }
    return null;
  }
}
