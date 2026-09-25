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
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ContentTemplateUseCases,
  toContentTemplateView,
  type ContentTemplateView,
} from '../../application/use-cases/content-template.use-cases';
import type { PublishTarget } from '../../domain/template-target';
import {
  CreateContentTemplateDto,
  UpdateContentTemplateDto,
} from '../input/content-template.input';

/**
 * Content-template CRUD (`/api/content-templates`, frontend-backed).
 *
 * A template is a reusable publishing profile: eligible sources +
 * keywords, own content filters, a reusable GLOBAL prompt-template ref,
 * telegram/threads/both targets, own queue+matching+scheduling toggles,
 * and DB-backed bot bindings. Sessions load a template or run ad-hoc.
 */
@ApiTags('feed-publisher-content-templates')
@Controller('api/content-templates')
export class ContentTemplatesController {
  public constructor(private readonly useCases: ContentTemplateUseCases) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a content template' })
  @ApiResponse({ status: 201, description: 'Template created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  public async create(
    @Body() dto: CreateContentTemplateDto,
  ): Promise<ContentTemplateView> {
    const created = await this.useCases.create({
      id: dto.id,
      name: dto.name,
      sourceIds: dto.sourceIds,
      keywordIds: dto.keywordIds,
      promptTemplateId: dto.promptTemplateId ?? null,
      targets: dto.targets as ReadonlyArray<PublishTarget>,
      botBindings: dto.botBindings,
      matchingEnabled: dto.matchingEnabled,
      llmEnabled: dto.llmEnabled,
      publishingEnabled: dto.publishingEnabled,
    });
    return toContentTemplateView(created);
  }

  @Get()
  @ApiOperation({ summary: 'List content templates' })
  @ApiResponse({ status: 200, description: 'Templates' })
  public async list(): Promise<ReadonlyArray<ContentTemplateView>> {
    const all = await this.useCases.list();
    return all.map(toContentTemplateView);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a content template' })
  @ApiResponse({ status: 200, description: 'Template' })
  @ApiResponse({ status: 404, description: 'Unknown template id' })
  public async get(@Param('id') id: string): Promise<ContentTemplateView> {
    return toContentTemplateView(await this.useCases.get(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a content template' })
  @ApiResponse({ status: 200, description: 'Template updated' })
  @ApiResponse({ status: 404, description: 'Unknown template id' })
  public async update(
    @Param('id') id: string,
    @Body() dto: UpdateContentTemplateDto,
  ): Promise<ContentTemplateView> {
    const updated = await this.useCases.update(id, {
      sourceIds: dto.sourceIds,
      keywordIds: dto.keywordIds,
      promptTemplateId: dto.promptTemplateId,
      targets: dto.targets as ReadonlyArray<PublishTarget> | undefined,
      botBindings: dto.botBindings,
      matchingEnabled: dto.matchingEnabled,
      llmEnabled: dto.llmEnabled,
      publishingEnabled: dto.publishingEnabled,
      active: dto.active,
    });
    return toContentTemplateView(updated);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate a content template' })
  @ApiResponse({ status: 200, description: 'Template activated' })
  public async activate(@Param('id') id: string): Promise<ContentTemplateView> {
    return toContentTemplateView(await this.useCases.activate(id));
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a content template' })
  @ApiResponse({ status: 200, description: 'Template deactivated' })
  public async deactivate(
    @Param('id') id: string,
  ): Promise<ContentTemplateView> {
    return toContentTemplateView(await this.useCases.deactivate(id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a content template' })
  @ApiResponse({ status: 204, description: 'Template deleted' })
  @ApiResponse({ status: 404, description: 'Unknown template id' })
  public async remove(@Param('id') id: string): Promise<void> {
    await this.useCases.remove(id);
  }
}
