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
  Logger,
} from '@nestjs/common';
import { PromptTemplate } from 'telegram/crypto-news-publisher/domain/entities/prompt-template.entity';
import { LlmConfig } from 'telegram/crypto-news-publisher/domain/entities/llm-config.entity';
import { PromptTemplateRepository } from 'telegram/crypto-news-publisher/application/ports/prompt-template.repository';
import { LlmConfigRepository } from 'telegram/crypto-news-publisher/application/ports/llm-config.repository';
import { KeywordRepository } from 'telegram/crypto-news-publisher/application/ports/keyword.repository';
import { GetLlmModelsUseCase } from 'telegram/crypto-news-publisher/application/handlers/get-llm-models.use-case';
import { TelegramPublisherPort } from 'telegram/shared';
import {
  CreatePromptTemplateDto,
  UpdatePromptTemplateDto,
  UpdateLlmConfigDto,
} from 'telegram/crypto-news-publisher/api/input/llm-config.input';
import {
  isUniqueViolation,
  toConfigView,
  toTemplateView,
  type LlmConfigView,
  type PromptTemplateView,
} from 'telegram/crypto-news-publisher/application/mappers/llm-config.mapper';

export type {
  LlmConfigView,
  PromptTemplateView,
} from 'telegram/crypto-news-publisher/application/mappers/llm-config.mapper';

/**
 * REST API for the crypto-news LLM configuration and the prompt
 * template library.
 *
 * Endpoints (all under `/crypto-news-publisher/llm`):
 *  - GET    /models                                Gateway model list
 *  - GET    /templates                             All prompt templates
 *  - GET    /templates/:id                         Single template
 *  - POST   /templates                             Create template
 *  - PATCH  /templates/:id                         Partial update
 *  - DELETE /templates/:id                         Remove (409 if in use)
 *  - GET    /config                                Current LlmConfig
 *  - PATCH  /config                                Partial update
 *
 * All request bodies are validated by `class-validator` (see
 * `../input/llm-config.input.ts`); the global `ValidationPipe`
 * throws 400 on shape violations before this controller is reached.
 *
 * `LlmConfig` owns the global *publishing* knobs (targetChannel,
 * enabled, dailyCap, dailyResetUtcHour, randomDelay*,
 * llmMaxAttempts) and the global *default template binding*. LLM-
 * call knobs (model / maxTokens / temperature / reasoningEffort /
 * promptText) live on `PromptTemplate` and are managed via
 * `/templates`. The split mirrors the T1 separation.
 *
 * The DELETE 409 is enforced here rather than at the repo because
 * the "in use" test needs to read both `LlmConfig.defaultTemplateId`
 * and `Keyword.templateId` — easier to express at the controller
 * boundary than inside the persistence layer.
 */
@Controller('crypto-news-publisher/llm')
export class LlmConfigController {
  private readonly logger = new Logger(LlmConfigController.name);

  public constructor(
    private readonly templateRepo: PromptTemplateRepository,
    private readonly llmConfigRepo: LlmConfigRepository,
    private readonly keywordRepo: KeywordRepository,
    private readonly getLlmModels: GetLlmModelsUseCase,
    private readonly publisher: TelegramPublisherPort,
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
  public async listTemplates(): Promise<ReadonlyArray<PromptTemplateView>> {
    const all = await this.templateRepo.findAll();
    return all.map(toTemplateView);
  }

  @Get('templates/:id')
  public async getTemplate(
    @Param('id') id: string,
  ): Promise<PromptTemplateView> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new NotFoundException(`PromptTemplate ${id} not found`);
    }
    return toTemplateView(template);
  }

  @Post('templates')
  public async createTemplate(
    @Body() dto: CreatePromptTemplateDto,
  ): Promise<PromptTemplateView> {
    const created = PromptTemplate.create({
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
      return toTemplateView(saved);
    } catch (err) {
      if (isUniqueViolation(err)) {
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
    @Body() dto: UpdatePromptTemplateDto,
  ): Promise<PromptTemplateView> {
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
      return toTemplateView(saved);
    } catch (err) {
      if (isUniqueViolation(err)) {
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
    const binding = await this.templateInUseBinding(id, cfg);
    if (binding) {
      throw new ConflictException({
        error: `template in use: ${binding.reason}`,
      });
    }
    await this.templateRepo.delete(id);
  }

  @Get('config')
  public async getConfig(): Promise<LlmConfigView> {
    const cfg = await this.llmConfigRepo.load();
    return toConfigView(cfg);
  }

  @Patch('config')
  public async updateConfig(
    @Body() dto: UpdateLlmConfigDto,
  ): Promise<LlmConfigView> {
    // Validate target channel via Bot API before persisting
    if (
      dto.targetChannel !== undefined &&
      dto.targetChannel.trim().length > 0
    ) {
      const result = await this.publisher.getChat(dto.targetChannel);
      if (!result.ok && result.error !== 'unreachable') {
        throw new BadRequestException({
          error: `targetChannel validation failed: ${result.error}`,
        });
      }
      if (!result.ok) {
        this.logger.warn(
          `targetChannel validation: Bot API unreachable for ${dto.targetChannel}, saving anyway`,
        );
      }
    }
    const cfg = await this.llmConfigRepo.load();
    if (dto.defaultTemplateId !== undefined) {
      cfg.setDefaultTemplateId(dto.defaultTemplateId);
    }
    cfg.update({
      targetChannel: dto.targetChannel,
      enabled: dto.enabled,
      dailyCap: dto.dailyCap,
      dailyResetUtcHour: dto.dailyResetUtcHour,
      randomDelayMinMs: dto.randomDelayMinMs,
      randomDelayMaxMs: dto.randomDelayMaxMs,
      llmMaxAttempts: dto.llmMaxAttempts,
    });
    const saved = await this.llmConfigRepo.save(cfg);
    return toConfigView(saved);
  }

  private async templateInUseBinding(
    id: string,
    cfg: LlmConfig,
  ): Promise<{ reason: string } | null> {
    if (cfg.defaultTemplateId === id) {
      return { reason: 'set as default in LlmConfig' };
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
