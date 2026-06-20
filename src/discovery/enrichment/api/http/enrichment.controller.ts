import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { EnrichTokenUseCase } from 'discovery/enrichment/application/handlers/enrich-token.use-case';
import { GetSnapshotUseCase } from 'discovery/enrichment/application/handlers/get-snapshot.use-case';
import { ListSnapshotsUseCase } from 'discovery/enrichment/application/handlers/list-snapshots.use-case';
import { EnrichTokenInput } from 'discovery/enrichment/api/input/enrich-token.input';
import type { TokenSnapshotView } from 'discovery/enrichment/application/mappers/token-snapshot.mapper';

@Controller('discovery/enrichment')
export class EnrichmentController {
  public constructor(
    private readonly enrich: EnrichTokenUseCase,
    private readonly getSnapshot: GetSnapshotUseCase,
    private readonly listSnapshots: ListSnapshotsUseCase,
  ) {}

  @Post('enrich')
  public async run(@Body() input: EnrichTokenInput): Promise<{
    snapshot: TokenSnapshotView;
    errors: ReadonlyArray<{ provider: string; message: string }>;
  }> {
    return this.enrich.execute({
      chain: input.chain,
      address: input.address,
      force: input.force,
    });
  }

  @Get('snapshots/recent')
  public recent(
    @Query('limit') limit?: string,
  ): Promise<ReadonlyArray<TokenSnapshotView>> {
    const parsed = limit ? Number(limit) : 10;
    return this.listSnapshots.execute(parsed);
  }

  @Get('snapshots/:chain/:address')
  public get(
    @Param('chain') chain: string,
    @Param('address') address: string,
  ): Promise<TokenSnapshotView> {
    return this.getSnapshot.execute(chain, address);
  }
}
