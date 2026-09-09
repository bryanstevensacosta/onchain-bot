import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  CreateFilterUseCase,
  ListFiltersUseCase,
  UpdateFilterUseCase,
  DeleteFilterUseCase,
  ToggleFilterUseCase,
} from 'telegram/ingestion/crypto-news/application/handlers/filters';

/**
 * Crypto-news content-filter endpoints (post db-separation todo 4).
 *
 * The backend keeps ONLY filter-rule CRUD over
 * `channel_content_filter_configs` (channel_id opaque, no FK — sources
 * live in ingestion-service's own DB).
 *
 * Removed in todo 4: GET messages, GET messages/:id, GET sources,
 * GET sources/active/ids, POST sources (501), GET backfill/:channelId,
 * GET media/:mediaId. Consumers must use ingestion-service:
 * `GET {INGESTION_SERVICE_URL}/api/crypto-news/...`.
 */
@Controller('crypto-news')
export class CryptoNewsController {
  constructor(
    private readonly createFilterUseCase: CreateFilterUseCase,
    private readonly listFiltersUseCase: ListFiltersUseCase,
    private readonly updateFilterUseCase: UpdateFilterUseCase,
    private readonly deleteFilterUseCase: DeleteFilterUseCase,
    private readonly toggleFilterUseCase: ToggleFilterUseCase,
  ) {}

  /**
   * POST /crypto-news/sources/:channelId/filters
   * Create a new content filter for a specific channel.
   */
  @Post('sources/:channelId/filters')
  @HttpCode(HttpStatus.CREATED)
  public async createFilter(
    @Param('channelId') channelId: string,
    @Body()
    body: {
      pattern: string;
      replacement: string;
      flags: string;
      priority: number;
      isActive: boolean;
    },
  ) {
    try {
      return await this.createFilterUseCase.execute({
        channelId,
        pattern: body.pattern,
        replacement: body.replacement,
        flags: body.flags,
        priority: body.priority,
        isActive: body.isActive,
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('not found')) {
        throw new NotFoundException(msg);
      }
      throw err;
    }
  }

  /**
   * GET /crypto-news/sources/:channelId/filters
   * List all content filters for a specific channel.
   */
  @Get('sources/:channelId/filters')
  public async getFilters(@Param('channelId') channelId: string) {
    try {
      return await this.listFiltersUseCase.execute(channelId);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('not found')) {
        throw new NotFoundException(msg);
      }
      throw err;
    }
  }

  /**
   * PUT /crypto-news/filters/:id
   * Update an existing content filter.
   */
  @Put('filters/:id')
  public async updateFilter(
    @Param('id') id: string,
    @Body()
    body: {
      pattern?: string;
      replacement?: string;
      flags?: string;
      priority?: number;
      isActive?: boolean;
    },
  ) {
    try {
      return await this.updateFilterUseCase.execute({
        id,
        ...body,
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('not found')) {
        throw new NotFoundException(msg);
      }
      throw err;
    }
  }

  /**
   * DELETE /crypto-news/filters/:id
   * Delete a content filter by ID.
   */
  @Delete('filters/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async deleteFilterEndpoint(@Param('id') id: string): Promise<void> {
    const deleted = await this.deleteFilterUseCase.execute(id);
    if (!deleted) {
      throw new NotFoundException(`Filter ${id} not found`);
    }
  }

  /**
   * PATCH /crypto-news/filters/:id/toggle
   * Toggle the isActive state of a content filter.
   */
  @Patch('filters/:id/toggle')
  public async toggleFilterEndpoint(@Param('id') id: string) {
    try {
      return await this.toggleFilterUseCase.execute(id);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('not found')) {
        throw new NotFoundException(msg);
      }
      throw err;
    }
  }
}
