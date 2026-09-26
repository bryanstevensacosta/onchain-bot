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
import { NormalizedMentionRepository } from '../../application/ports/normalized-mention.repository';
import type { NormalizedMention } from '../../domain/entities/normalized-mention.entity';
import { MentionsQueryDto } from './dto/mentions-query.dto';

function toJson(mention: NormalizedMention): Record<string, unknown> {
  return {
    id: mention.id,
    kolId: mention.kolId,
    messageId: mention.messageId,
    contractIndex: mention.contractIndex,
    chain: mention.chain,
    address: mention.address.value,
    ticker: mention.ticker,
  };
}

/**
 * Mentions controller — P51 kol-calls → publisher contract (reads).
 *
 * `GET /api/mentions?limit=&offset=` (paginated, keyed by mention id) +
 * `GET /api/mentions/:id` (single, 404 when unknown). Key-guarded (401
 * without `x-api-key`); validation errors surface as 400 via the global
 * ValidationPipe. The publisher sync consumes this (never the DB).
 */
@Controller('api/mentions')
@UseGuards(ApiKeyGuard)
@UseFilters(DomainExceptionFilter)
export class MentionsController {
  public constructor(private readonly mentions: NormalizedMentionRepository) {}

  @Get()
  public async list(
    @Query() query: MentionsQueryDto,
  ): Promise<Record<string, unknown>> {
    const total = await this.mentions.count();
    const rows = await this.mentions.findPaged(query.limit, query.offset);
    return {
      items: rows.map(toJson),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  @Get(':id')
  public async getById(
    @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    const found = await this.mentions.findById(id);
    if (found === null) {
      throw new NotFoundException(`mention not found: ${id}`);
    }
    return toJson(found);
  }
}
