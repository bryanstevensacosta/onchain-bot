import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { DomainExceptionFilter } from '../../../shared/filters/domain-exception.filter';
import { ApiKeyGuard } from '../../../shared/guards/api-key.guard';
import { MentionSnapshotRepository } from '../../application/ports/mention-snapshot.repository';
import type { MentionSnapshot } from '../../domain/entities/mention-snapshot.entity';
import { SnapshotsQueryDto } from './dto/snapshots-query.dto';

function toJson(snapshot: MentionSnapshot): Record<string, unknown> {
  return {
    mentionId: snapshot.mentionId,
    marketCapUsd: snapshot.marketCapUsd,
    priceUsd: snapshot.priceUsd,
    liquidityUsd: snapshot.liquidityUsd,
    holders: snapshot.holders,
    symbol: snapshot.symbol,
  };
}

/**
 * Snapshots controller — P51 kol-calls → publisher contract (reads).
 *
 * `GET /api/snapshots?limit=&offset=` (paginated, keyed by mention id) +
 * `GET /api/snapshots/:mentionId` (single, 404 when unknown). Key-guarded
 * (401 without `x-api-key`); validation errors surface as 400 via the
 * global ValidationPipe. The publisher sync joins these rows with
 * mentions by id and feeds the unchanged scorer.
 */
@Controller('api/snapshots')
@UseGuards(ApiKeyGuard)
@UseFilters(DomainExceptionFilter)
export class SnapshotsController {
  public constructor(private readonly snapshots: MentionSnapshotRepository) {}

  @Get()
  public async list(
    @Query() query: SnapshotsQueryDto,
  ): Promise<Record<string, unknown>> {
    const total = await this.snapshots.count();
    const rows = await this.snapshots.findPaged(query.limit, query.offset);
    return {
      items: rows.map(toJson),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  @Get(':mentionId')
  public async getByMentionId(
    @Param('mentionId') mentionId: string,
  ): Promise<Record<string, unknown>> {
    const found = await this.snapshots.findByMentionId(mentionId);
    if (found === null) {
      throw new NotFoundException(`snapshot not found: ${mentionId}`);
    }
    return toJson(found);
  }
}
