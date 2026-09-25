import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Put,
} from '@nestjs/common';
import {
  UpdateFilterUseCase,
  DeleteFilterUseCase,
  ToggleFilterUseCase,
} from 'telegram/ingestion/crypto-news/application/handlers/filters';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

/**
 * Feed-filters endpoints (P41 dual-serve, T2 todo 13 Fase 1).
 *
 * New prefix `feed-filters/*` delegating to the SAME filter use-cases as
 * the legacy `crypto-news/filters/*` routes on `CryptoNewsController`
 * (old intact — cutover todo 11 drops it). Per P41 exclusion, the
 * per-channel `crypto-news/sources/:channelId/filters` CRUD stays on the
 * old controller only (no `feed-sources` in the backend).
 */
@ApiTags('feed-filters')
@Controller('feed-filters')
export class FeedFiltersController {
  constructor(
    private readonly updateFilterUseCase: UpdateFilterUseCase,
    private readonly deleteFilterUseCase: DeleteFilterUseCase,
    private readonly toggleFilterUseCase: ToggleFilterUseCase,
  ) {}

  /**
   * PUT /feed-filters/:id
   * Update an existing content filter (mirrors PUT /crypto-news/filters/:id).
   */
  @Put(':id')
  @ApiOperation({ summary: 'Update a content filter' })
  @ApiParam({ name: 'id', description: 'Filter id (uuid)' })
  @ApiResponse({ status: 200, description: 'Filter updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Unknown filter id' })
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
   * DELETE /feed-filters/:id
   * Delete a content filter by ID (mirrors DELETE /crypto-news/filters/:id).
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a content filter' })
  @ApiParam({ name: 'id', description: 'Filter id (uuid)' })
  @ApiResponse({ status: 204, description: 'Filter deleted' })
  @ApiResponse({ status: 404, description: 'Unknown filter id' })
  public async deleteFilterEndpoint(@Param('id') id: string): Promise<void> {
    const deleted = await this.deleteFilterUseCase.execute(id);
    if (!deleted) {
      throw new NotFoundException(`Filter ${id} not found`);
    }
  }

  /**
   * PATCH /feed-filters/:id/toggle
   * Toggle the isActive state (mirrors PATCH /crypto-news/filters/:id/toggle).
   */
  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Toggle a content filter on/off' })
  @ApiParam({ name: 'id', description: 'Filter id (uuid)' })
  @ApiResponse({ status: 200, description: 'Filter toggled' })
  @ApiResponse({ status: 404, description: 'Unknown filter id' })
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
