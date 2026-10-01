import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { GenerateTextUseCase } from '@/llm/application/use-cases/generate-text.use-case';
import { GetLlmModelsUseCase } from '@/llm/application/use-cases/get-llm-models.use-case';
import { GetPipelineFlagsUseCase } from '@/llm/application/use-cases/get-pipeline-flags.use-case';
import { LlmConfigRepository } from '@/llm/domain/ports/llm-config.repository';
import {
  validateLlmConfigPatch,
  type LlmConfig,
} from '@/llm/domain/llm-config';
import { UsageAuditService } from '@/llm/application/usage-audit.service';
import { RequireScope } from 'auth/application/require-scope.decorator';

interface GenerateDto {
  prompt?: string;
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * LLM HTTP surface (ai-ml, todo 0):
 * - POST /api/llm/generate (generate scope): single text generation.
 * - GET /api/llm/models (read scope): live provider model list.
 * - GET /api/llm/config (read) + PATCH /api/llm/config (admin):
 *   the two switches ai-ml owns (llm + publishing).
 * - GET /api/llm/flags?matching= (read): resolved 3-flag view.
 * - GET /api/llm/usage (admin): usage audit (sizes only).
 */
@Controller('api/llm')
export class LlmController {
  public constructor(
    private readonly generate: GenerateTextUseCase,
    private readonly models: GetLlmModelsUseCase,
    private readonly flags: GetPipelineFlagsUseCase,
    private readonly configs: LlmConfigRepository,
    private readonly usage: UsageAuditService,
  ) {}

  @Post('generate')
  @RequireScope('generate')
  public async generateText(@Body() dto: GenerateDto): Promise<{
    text: string;
    provider: string;
    model: string;
    latencyMs: number;
  }> {
    const prompt = (dto.prompt ?? '').trim();
    if (!prompt) {
      throw new Error('prompt is required');
    }
    return this.generate.execute({
      prompt,
      systemPrompt: dto.systemPrompt,
      model: dto.model,
      maxTokens: dto.maxTokens,
      temperature: dto.temperature,
    });
  }

  @Get('models')
  @RequireScope('read')
  public async getModels(): Promise<{ provider: string; models: string[] }> {
    return this.models.execute();
  }

  @Get('config')
  @RequireScope('read')
  public async getConfig(): Promise<LlmConfig> {
    return this.configs.get();
  }

  @Patch('config')
  @RequireScope('admin')
  public async patchConfig(
    @Body() dto: { llmEnabled?: unknown; publishingEnabled?: unknown },
  ): Promise<LlmConfig> {
    return this.configs.update(validateLlmConfigPatch(dto));
  }

  @Get('flags')
  @RequireScope('read')
  public async getFlags(
    @Query('matching') matching?: string,
  ): Promise<unknown> {
    return this.flags.execute(matching === 'true');
  }

  @Get('usage')
  @RequireScope('admin')
  public async getUsage(): Promise<{ entries: ReadonlyArray<unknown> }> {
    return { entries: this.usage.list() };
  }
}
