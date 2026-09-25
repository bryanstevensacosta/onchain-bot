import { BadRequestException, Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LlmConfigRepository } from '../../domain/ports/llm-config.repository';
import { GetPipelineFlagsUseCase, type PipelineFlagsView } from '../../application/use-cases/get-pipeline-flags.use-case';
import { toConfigView, type LlmConfigView } from '../../application/mappers/llm.mapper';
import { UpdateLlmConfigDto } from '../input/llm.input';

/**
 * LLM publishing control (`/api/llm`).
 *
 * GET /config · PATCH /config (sole writer of the llm/publishing
 * switches) · GET /flags (composed 3-flag view with the truth-table
 * mode). `matchingEnabled` is NOT owned here — the single source of
 * truth is `MatchingConfig` (`PATCH feed-publisher/matching/config`).
 */
@ApiTags('feed-publisher-llm')
@Controller('api/llm')
export class LlmConfigController {
  public constructor(
    private readonly llmConfigRepo: LlmConfigRepository,
    private readonly pipelineFlags: GetPipelineFlagsUseCase,
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Get the current LLM/publisher config' })
  @ApiResponse({ status: 200, description: 'Current LlmConfig' })
  public async getConfig(): Promise<LlmConfigView> {
    const cfg = await this.llmConfigRepo.load();
    return toConfigView(cfg);
  }

  @Get('flags')
  @ApiOperation({ summary: 'Composed 3-flag view (matching + llm + publishing)' })
  @ApiResponse({ status: 200, description: 'Pipeline flags with mode' })
  public async getFlags(): Promise<PipelineFlagsView> {
    return this.pipelineFlags.execute();
  }

  @Patch('config')
  @ApiOperation({
    summary: 'Partially update the LLM/publisher config (llmEnabled locked in production)',
  })
  @ApiResponse({ status: 200, description: 'LlmConfig updated' })
  @ApiResponse({ status: 400, description: 'Validation error or guarded flag combination' })
  public async updateConfig(@Body() dto: UpdateLlmConfigDto): Promise<LlmConfigView> {
    if (dto.matchingEnabled !== undefined) {
      throw new BadRequestException({
        error:
          'matchingEnabled is not owned by this endpoint (single source of truth is MatchingConfig)',
        hint: 'Use PATCH feed-publisher/matching/config with { enabled } instead',
      });
    }
    if (dto.llmEnabled !== undefined && process.env.NODE_ENV === 'production') {
      throw new BadRequestException({
        error: 'llmEnabled cannot be changed in production (always enabled for quality)',
        hint: 'Use publishingEnabled to control pipeline (matching is owned by PATCH feed-publisher/matching/config)',
      });
    }
    if (dto.llmEnabled === true) {
      const current = await this.llmConfigRepo.load();
      const publishing =
        dto.publishingEnabled !== undefined ? dto.publishingEnabled : current.publishingEnabled;
      if (!publishing) {
        throw new BadRequestException({
          error: 'llmEnabled requires publishingEnabled (LLM only runs when publishing is active)',
          hint: 'Enable publishing first via { publishingEnabled: true }',
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
}
