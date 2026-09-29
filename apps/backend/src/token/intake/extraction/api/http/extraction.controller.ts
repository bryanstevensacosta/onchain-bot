/**
 * @deprecated Moved to apps/kol-calls/src/extraction/ (Tramo 1, todo 5 + P18 companion).
 * Extraction per-mention now lives in kol-calls: ExtractFromMessageUseCase (direct call,
 * fix-1, no event bus; multi-tip NO collapse, one row per mention) + snapshot base emit.
 * This file stays wired for dual-run; it will be removed in todo 16 (cutover + cleanup).
 * Do not extend it — add extraction logic in apps/kol-calls/src/extraction/ instead.
 *
 * New location: apps/kol-calls/src/extraction/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ExtractFromMessageUseCase } from 'token/intake/extraction/application/handlers/extract-from-message.use-case';
import { GetExtractionResultUseCase } from 'token/intake/extraction/application/handlers/get-extraction-result.use-case';
import { GetRecentResultsUseCase } from 'token/intake/extraction/application/handlers/get-recent-results.use-case';
import { ExtractInput } from 'token/intake/extraction/api/input/extract.input';
import type { ExtractionResultView } from 'token/intake/extraction/application/mappers/extraction-result.mapper';

/**
 * HTTP adapter for the extraction BC.
 *
 * Routes are admin-only (testing/manual extraction).
 */
@Controller('token/intake/extraction')
export class ExtractionController {
  public constructor(
    private readonly extract: ExtractFromMessageUseCase,
    private readonly getResult: GetExtractionResultUseCase,
    private readonly getRecent: GetRecentResultsUseCase,
  ) {}

  @Post('extract')
  public run(@Body() input: ExtractInput): Promise<ExtractionResultView> {
    return this.extract.execute({
      kolId: input.kolId,
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

  @Get('results/:kolId/:messageId')
  public get(
    @Param('kolId') kolId: string,
    @Param('messageId') messageId: string,
  ): Promise<ExtractionResultView> {
    return this.getResult.execute(kolId, Number(messageId));
  }
}
