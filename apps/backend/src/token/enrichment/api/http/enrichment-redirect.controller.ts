import { Controller, Get, Param, Post, Query, Redirect } from '@nestjs/common';

/**
 * @deprecated Legacy route `/token/market-data/*` (Tramo 3 todo 6, R-4/G-18).
 * Renamed to `/token/enrichment/*` — this controller keeps a TEMPORARY
 * 307 redirect for ONE version so old clients keep working.
 * New location: `EnrichmentController` (`token/enrichment`).
 * Reason: free the `market-data` name for the `apps/market-data` service.
 * Breaking change: Yes (removal at cutover, todo 8 — old clients must migrate).
 * Rollback: re-add this controller (git revert).
 */
@Controller('token/market-data')
export class EnrichmentRedirectController {
  @Post('enrich')
  @Redirect('/token/enrichment/enrich', 307)
  public enrich(): { url: string; statusCode: number } {
    return { url: '/token/enrichment/enrich', statusCode: 307 };
  }

  @Get('snapshots/recent')
  @Redirect('/token/enrichment/snapshots/recent', 307)
  public recent(@Query('limit') limit?: string): {
    url: string;
    statusCode: number;
  } {
    const suffix = limit ? `?limit=${encodeURIComponent(limit)}` : '';
    return {
      url: `/token/enrichment/snapshots/recent${suffix}`,
      statusCode: 307,
    };
  }

  @Get('snapshots/:chain/:address')
  @Redirect('/token/enrichment/snapshots', 307)
  public get(
    @Param('chain') chain: string,
    @Param('address') address: string,
  ): { url: string; statusCode: number } {
    return {
      url: `/token/enrichment/snapshots/${encodeURIComponent(chain)}/${encodeURIComponent(address)}`,
      statusCode: 307,
    };
  }
}
