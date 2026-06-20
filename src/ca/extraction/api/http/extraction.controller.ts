import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ExtractFromMessageUseCase } from 'ca/extraction/application/handlers/extract-from-message.use-case';
import { GetExtractionResultUseCase } from 'ca/extraction/application/handlers/get-extraction-result.use-case';
import { GetRecentResultsUseCase } from 'ca/extraction/application/handlers/get-recent-results.use-case';
import { ExtractInput } from 'ca/extraction/api/input/extract.input';
import type { ExtractionResultView } from 'ca/extraction/application/mappers/extraction-result.mapper';

/**
 * HTTP adapter for the extraction BC.
 *
 * Routes are admin-only (testing/manual extraction).
 */
@Controller('ca/extraction')
export class ExtractionController {
  public constructor(
    private readonly extract: ExtractFromMessageUseCase,
    private readonly getResult: GetExtractionResultUseCase,
    private readonly getRecent: GetRecentResultsUseCase,
  ) {}

  @Post('extract')
  public run(@Body() input: ExtractInput): Promise<ExtractionResultView> {
    return this.extract.execute({
      channelId: input.channelId,
      messageId: input.messageId,
      occurredAt: input.occurredAt,
      text: input.text,
    });
  }

  @Get('results/recent')
  public recent(
    @Query('limit') limit?: string,
  ): Promise<ReadonlyArray<ExtractionResultView>> {
    const parsed = limit ? Number(limit) : 10;
    return this.getRecent.execute(parsed);
  }

  @Get('results/:channelId/:messageId')
  public get(
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
  ): Promise<ExtractionResultView> {
    return this.getResult.execute(channelId, Number(messageId));
  }
}
