import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ContentFilterUseCases,
  toContentFilterView,
  type ContentFilterView,
} from '../../application/use-cases/content-filter.use-cases';
import {
  CreateContentFilterDto,
  UpdateContentFilterDto,
} from '../input/content-filter.input';

/**
 * Per-channel content-filter CRUD (`/content-publisher/...`).
 *
 * POST sources/:channelId/filters · GET sources/:channelId/filters ·
 * PUT filters/:id · DELETE filters/:id · PATCH filters/:id/toggle.
 * Route shape mirrors the backend `crypto-news` filter endpoints so the
 * dashboard migration in todo 9 is mechanical; the prefix is app-owned.
 */
@ApiTags('content-publisher-filters')
@Controller('content-publisher')
export class FiltersController {
  public constructor(private readonly useCases: ContentFilterUseCases) {}

  @Post('sources/:channelId/filters')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a content filter for a channel' })
  @ApiParam({ name: 'channelId', description: 'Channel id (opaque, FK-less)' })
  @ApiResponse({ status: 201, description: 'Filter created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  public async create(
    @Param('channelId') channelId: string,
    @Body() dto: CreateContentFilterDto,
  ): Promise<ContentFilterView> {
    const created = await this.useCases.create({
      channelId,
      pattern: dto.pattern,
      replacement: dto.replacement ?? '',
      flags: dto.flags ?? 'gi',
      priority: dto.priority ?? 0,
      isActive: dto.isActive ?? true,
    });
    return toContentFilterView(created);
  }

  @Get('sources/:channelId/filters')
  @ApiOperation({ summary: 'List content filters for a channel' })
  @ApiParam({ name: 'channelId', description: 'Channel id (opaque, FK-less)' })
  @ApiResponse({ status: 200, description: 'Channel filters' })
  public async list(
    @Param('channelId') channelId: string,
  ): Promise<ReadonlyArray<ContentFilterView>> {
    const all = await this.useCases.listByChannel(channelId);
    return all.map(toContentFilterView);
  }

  @Put('filters/:id')
  @ApiOperation({ summary: 'Update a content filter' })
  @ApiParam({ name: 'id', description: 'Filter id (uuid)' })
  @ApiResponse({ status: 200, description: 'Filter updated' })
  @ApiResponse({ status: 404, description: 'Unknown filter id' })
  public async update(
    @Param('id') id: string,
    @Body() dto: UpdateContentFilterDto,
  ): Promise<ContentFilterView> {
    const updated = await this.useCases.update(id, dto);
    return toContentFilterView(updated);
  }

  @Delete('filters/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a content filter' })
  @ApiParam({ name: 'id', description: 'Filter id (uuid)' })
  @ApiResponse({ status: 204, description: 'Filter deleted' })
  @ApiResponse({ status: 404, description: 'Unknown filter id' })
  public async remove(@Param('id') id: string): Promise<void> {
    await this.useCases.remove(id);
  }

  @Patch('filters/:id/toggle')
  @ApiOperation({ summary: 'Toggle a content filter on/off' })
  @ApiParam({ name: 'id', description: 'Filter id (uuid)' })
  @ApiResponse({ status: 200, description: 'Filter toggled' })
  @ApiResponse({ status: 404, description: 'Unknown filter id' })
  public async toggle(@Param('id') id: string): Promise<ContentFilterView> {
    const toggled = await this.useCases.toggle(id);
    return toContentFilterView(toggled);
  }
}
