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
import {
  PreviewPromptUseCase,
  type PreviewPromptResult,
} from 'telegram/crypto-news-publisher/application/handlers/preview-prompt.use-case';
import { TelegramPublisherPort } from 'telegram/shared';
import {
  CreatePromptTemplateDto,
  PreviewPromptDto,
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
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

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
 *  - POST   /preview                               Dry-run prompt preview (render or one LLM call; never persists)
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
@Controller(['crypto-news-publisher/llm', 'feed-publisher/llm'])
export class LlmConfigController {
  private readonly logger = new Logger(LlmConfigController.name);

  public constructor(
    private readonly templateRepo: PromptTemplateRepository,
    private readonly llmConfigRepo: LlmConfigRepository,
    private readonly keywordRepo: KeywordRepository,
    private readonly getLlmModels: GetLlmModelsUseCase,
    private readonly publisher: TelegramPublisherPort,
    private readonly previewPromptUseCase: PreviewPromptUseCase,
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

  @Post('preview')
  public async previewPrompt(
    @Body() dto: PreviewPromptDto,
  ): Promise<PreviewPromptResult> {
    return this.previewPromptUseCase.execute({
      templateId: dto.templateId,
      draft: dto.draft,
      rawTitle: dto.rawTitle ?? null,
      rawContent: dto.rawContent,
      hasImage: dto.hasImage,
      generate: dto.generate,
    });
  }

  @Get('config')
  @ApiOperation({ summary: 'Get the current LLM/publisher config' })
  @ApiResponse({ status: 200, description: 'Current LlmConfig' })
  public async getConfig(): Promise<LlmConfigView> {
    const cfg = await this.llmConfigRepo.load();
    return toConfigView(cfg);
  }

  @Patch('config')
  @ApiOperation({
    summary:
      'Partially update the LLM/publisher config (controller-direct pattern; llmEnabled locked in production)',
  })
  @ApiResponse({ status: 200, description: 'LlmConfig updated' })
  @ApiResponse({
    status: 400,
    description: 'Validation error or guarded flag combination',
  })
  public async updateConfig(
    @Body() dto: UpdateLlmConfigDto & { matchingEnabled?: unknown },
  ): Promise<LlmConfigView> {
    // matchingEnabled is not owned by this endpoint: the single source of
    // truth is `crypto_news_matching_config` (id = 1), owned by
    // MatchingConfigController (GET/PATCH /crypto-news/matching/config).
    // The scheduler (EnqueueMatchingCronScheduler.tick) and the SSE handler
    // (ProcessCryptoNewsMessageHandler.handle) read ONLY that row — accepting
    // the field here would silently diverge (prod once showed llm=t vs
    // matching=f with the UI lying ON). Unknown values are rejected with a
    // hint pointing at the owning endpoint (mirrors the threads guard).
    if (dto.matchingEnabled !== undefined) {
      throw new BadRequestException({
        error:
          'matchingEnabled is not owned by this endpoint (single source of truth is crypto_news_matching_config)',
        hint: 'Use PATCH /crypto-news/matching/config with { enabled } instead',
      });
    }

    // PRODUCTION SAFETY: Block llmEnabled changes in production
    // In production, LLM generation must always be active to maintain
    // content quality. Only matching and publishing can be toggled.
    if (dto.llmEnabled !== undefined && process.env.NODE_ENV === 'production') {
      throw new BadRequestException({
        error:
          'llmEnabled cannot be changed in production (always enabled for quality)',
        hint: 'Use publishingEnabled to control pipeline (matching is owned by PATCH /crypto-news/matching/config)',
      });
    }

    // 2-FLAG INVARIANT: LLM generation only runs when publishing is
    // active (`llmEnabled AND publishingEnabled`). Enabling the LLM
    // while publishing is off burns API calls on content that is never
    // published, so the combination is rejected with a hint pointing at
    // the publishing flag (mirrors the matchingEnabled guard above).
    if (dto.llmEnabled === true) {
      const current = await this.llmConfigRepo.load();
      const publishing =
        dto.publishingEnabled !== undefined
          ? dto.publishingEnabled
          : current.publishingEnabled;
      if (!publishing) {
        throw new BadRequestException({
          error:
            'llmEnabled requires publishingEnabled (LLM only runs when publishing is active)',
          hint: 'Enable publishing first via { publishingEnabled: true }',
        });
      }
    }

    // Validate target channel via Bot API before persisting. Outside
    // production (dummy tokens/channels) any API failure only warns —
    // enforcing it would make the config unsavable in dev/staging.
    if (
      dto.targetChannel !== undefined &&
      dto.targetChannel.trim().length > 0
    ) {
      // @deprecated Channel verify (`getChat`) moves to the telegram-bots-gateway
      // per-bot health (todo 7); this direct publisher call retires at cutover.
      const result = await this.publisher.getChat(dto.targetChannel);
      const enforce = process.env.NODE_ENV === 'production';
      if (!result.ok && (result.error === 'unreachable' || !enforce)) {
        this.logger.warn(
          `targetChannel validation: ${result.error} for ${dto.targetChannel}, saving anyway`,
        );
      } else if (!result.ok) {
        throw new BadRequestException({
          error: `targetChannel validation failed: ${result.error}`,
        });
      }
    }
    const cfg = await this.llmConfigRepo.load();
    if (dto.defaultTemplateId !== undefined) {
      cfg.setDefaultTemplateId(dto.defaultTemplateId);
    }
    cfg.update({
      targetChannel: dto.targetChannel,
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
