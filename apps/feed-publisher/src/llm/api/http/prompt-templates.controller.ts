import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PromptTemplate } from '../../domain/prompt-template.entity';
import type { TemplateContentType } from '../../domain/prompt-template.entity';
import { PromptTemplateRepository } from '../../domain/ports/prompt-template.repository';
import { LlmConfigRepository } from '../../domain/ports/llm-config.repository';
import { KeywordRepository } from '../../../keywords/application/ports/keyword.repository';
import { toTemplateView, type PromptTemplateView } from '../../application/mappers/llm.mapper';
import { CreatePromptTemplateDto, UpdatePromptTemplateDto } from '../input/llm.input';

/**
 * GLOBAL prompt-template catalog (`/api/llm/templates`).
 *
 * GET / · GET /:id · POST / (409 on duplicate name) · PATCH /:id ·
 * DELETE /:id (404 unknown, 409 when set as the `LlmConfig` default or
 * bound to keywords). Rows are reusable across content types
 * (`contentType 'global'` applies everywhere, P33/P34).
 */
@ApiTags('feed-publisher-llm')
@Controller('api/llm/templates')
export class PromptTemplatesController {
  public constructor(
    private readonly templateRepo: PromptTemplateRepository,
    private readonly llmConfigRepo: LlmConfigRepository,
    private readonly keywordRepo: KeywordRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all prompt templates (GLOBAL catalog)' })
  @ApiResponse({ status: 200, description: 'Prompt templates' })
  public async listTemplates(): Promise<ReadonlyArray<PromptTemplateView>> {
    const all = await this.templateRepo.findAll();
    return all.map(toTemplateView);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single prompt template' })
  @ApiResponse({ status: 200, description: 'Prompt template' })
  @ApiResponse({ status: 404, description: 'Unknown template id' })
  public async getTemplate(@Param('id') id: string): Promise<PromptTemplateView> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new NotFoundException(`PromptTemplate ${id} not found`);
    }
    return toTemplateView(template);
  }

  @Post()
  @ApiOperation({ summary: 'Create a prompt template' })
  @ApiResponse({ status: 201, description: 'Prompt template created' })
  @ApiResponse({ status: 409, description: 'Duplicate template name' })
  public async createTemplate(
    @Body() dto: CreatePromptTemplateDto,
  ): Promise<PromptTemplateView> {
    const existing = await this.templateRepo.findAll();
    if (existing.some((t) => t.name === dto.name)) {
      throw new ConflictException(`PromptTemplate name already exists: ${dto.name}`);
    }
    const created = PromptTemplate.create({
      name: dto.name,
      description: dto.description ?? null,
      contentType: dto.contentType as TemplateContentType | undefined,
      model: dto.model,
      supportsVision: dto.supportsVision ?? true,
      maxTokens: dto.maxTokens,
      temperature: dto.temperature,
      reasoningEffort: dto.reasoningEffort ?? null,
      promptText: dto.promptText,
      systemPromptText: dto.systemPromptText ?? '',
    });
    const saved = await this.templateRepo.save(created);
    return toTemplateView(saved);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Partially update a prompt template' })
  @ApiResponse({ status: 200, description: 'Prompt template updated' })
  @ApiResponse({ status: 404, description: 'Unknown template id' })
  @ApiResponse({ status: 409, description: 'Duplicate template name' })
  public async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdatePromptTemplateDto,
  ): Promise<PromptTemplateView> {
    const existing = await this.templateRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`PromptTemplate ${id} not found`);
    }
    if (dto.name !== undefined) {
      const all = await this.templateRepo.findAll();
      if (all.some((t) => t.id !== id && t.name === dto.name)) {
        throw new ConflictException(`PromptTemplate name already exists: ${dto.name}`);
      }
    }
    existing.update({
      name: dto.name,
      description: dto.description,
      contentType: dto.contentType as TemplateContentType | undefined,
      model: dto.model,
      supportsVision: dto.supportsVision,
      maxTokens: dto.maxTokens,
      temperature: dto.temperature,
      reasoningEffort: dto.reasoningEffort,
      promptText: dto.promptText,
      systemPromptText: dto.systemPromptText,
    });
    const saved = await this.templateRepo.save(existing);
    return toTemplateView(saved);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a prompt template (409 when in use)' })
  @ApiResponse({ status: 204, description: 'Prompt template deleted' })
  @ApiResponse({ status: 404, description: 'Unknown template id' })
  @ApiResponse({ status: 409, description: 'Template in use' })
  public async deleteTemplate(@Param('id') id: string): Promise<void> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new NotFoundException(`PromptTemplate ${id} not found`);
    }
    const cfg = await this.llmConfigRepo.load();
    if (cfg.defaultTemplateId === id) {
      throw new ConflictException({ error: 'template in use: set as default in LlmConfig' });
    }
    const keywords = await this.keywordRepo.findAll();
    const bound = keywords.filter((kw) => kw.templateId === id);
    if (bound.length > 0) {
      const label = bound.length === 1 ? '1 keyword' : `${bound.length} keywords`;
      throw new ConflictException({ error: `template in use: bound to ${label}` });
    }
    await this.templateRepo.delete(id);
  }
}
