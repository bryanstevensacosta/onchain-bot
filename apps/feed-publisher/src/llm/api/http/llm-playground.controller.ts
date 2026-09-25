import { Body, Controller, Get, HttpException, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  PreviewPromptUseCase,
  type PreviewPromptResult,
} from '../../application/use-cases/preview-prompt.use-case';
import {
  GetLlmModelsUseCase,
  type LlmModelView,
} from '../../application/use-cases/get-llm-models.use-case';
import { PreviewPromptDto } from '../input/llm.input';

/**
 * LLM playground (`/api/llm`): dry-run prompt preview + gateway model
 * list. Preview builds a TRANSIENT entry — it never enqueues,
 * publishes, or persists (queue depth is unchanged).
 */
@ApiTags('feed-publisher-llm')
@Controller('api/llm')
export class LlmPlaygroundController {
  public constructor(
    private readonly previewPrompt: PreviewPromptUseCase,
    private readonly getLlmModels: GetLlmModelsUseCase,
  ) {}

  @Post('preview')
  @ApiOperation({ summary: 'Dry-run prompt preview (render or one LLM call; never persists)' })
  @ApiResponse({ status: 200, description: 'Preview result' })
  public async preview(@Body() dto: PreviewPromptDto): Promise<PreviewPromptResult> {
    return this.previewPrompt.execute({
      templateId: dto.templateId,
      draft: dto.draft,
      rawTitle: dto.rawTitle ?? null,
      rawContent: dto.rawContent,
      hasImage: dto.hasImage,
      generate: dto.generate,
    });
  }

  @Get('models')
  @ApiOperation({ summary: 'Gateway model list' })
  @ApiResponse({ status: 200, description: 'Gateway models' })
  public async listModels(): Promise<ReadonlyArray<LlmModelView>> {
    try {
      return await this.getLlmModels.execute();
    } catch (err) {
      throw new HttpException(
        { error: 'gateway unreachable', cause: err instanceof Error ? err.message : String(err) },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
