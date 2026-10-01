import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RequireScope } from 'auth/application/require-scope.decorator';
import {
  PromptCatalogService,
  type PromptSource,
} from '@/prompts/application/prompt-catalog.service';
import type {
  PromptContentType,
  PromptTemplate,
} from '@/prompts/domain/prompt-template';

class CreatePromptDto {
  @IsString()
  @Length(1, 100)
  public name!: string;

  @IsString()
  @Length(1)
  public content!: string;

  @IsOptional()
  @IsString()
  public systemContent?: string;

  @IsOptional()
  @IsIn(['crypto-news', 'threads', 'global'])
  public contentType?: PromptContentType;
}

class CreateVersionDto {
  @IsString()
  @Length(1)
  public content!: string;

  @IsOptional()
  @IsString()
  public systemContent?: string;

  @IsOptional()
  @IsIn(['crypto-news', 'threads', 'global'])
  public contentType?: PromptContentType;
}

class ResolvePromptDto {
  @IsString()
  @Length(1, 100)
  public name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public version?: number;

  @IsOptional()
  @IsIn(['crypto-news', 'threads', 'global'])
  public contentType?: PromptContentType;
}

export interface ResolveView {
  readonly template: PromptTemplate;
  readonly source: PromptSource;
}

/**
 * Prompts HTTP surface (ai-ml, todo 1 — global catalog, any app):
 * - GET /api/prompts[?contentType=] (read): active templates.
 * - GET /api/prompts/:name[?version=] (read): active or pinned row.
 * - GET /api/prompts/:name/versions (read): immutable history.
 * - GET /api/prompts/:name/active (read): the rollback pointer.
 * - POST /api/prompts (admin): create (v1, active).
 * - POST /api/prompts/:name/versions (admin): new version (active).
 * - POST /api/prompts/:name/versions/:version/activate (admin):
 *   move the pointer (rollback = older version).
 * - POST /api/prompts/resolve (read): dual-read name+version
 *   (ai-ml first, legacy feed-publisher snapshot fallback).
 * - DELETE /api/prompts/:name[?version=] (admin): drop row(s).
 */
@Controller('api/prompts')
export class PromptsController {
  public constructor(private readonly catalog: PromptCatalogService) {}

  @Get()
  @RequireScope('read')
  public async list(
    @Query('contentType') contentType?: PromptContentType,
  ): Promise<ReadonlyArray<PromptTemplate>> {
    return this.catalog.listActive(contentType);
  }

  @Post('resolve')
  @HttpCode(HttpStatus.OK)
  @RequireScope('read')
  public async resolve(@Body() dto: ResolvePromptDto): Promise<ResolveView> {
    return this.catalog.resolve(dto.name, {
      version: dto.version,
      contentType: dto.contentType,
    });
  }

  @Get(':name/versions')
  @RequireScope('read')
  public async listVersions(
    @Param('name') name: string,
  ): Promise<ReadonlyArray<PromptTemplate>> {
    return this.catalog.listVersions(name);
  }

  @Get(':name/active')
  @RequireScope('read')
  public async getActive(@Param('name') name: string): Promise<PromptTemplate> {
    return this.catalog.getActive(name);
  }

  @Get(':name')
  @RequireScope('read')
  public async getByName(
    @Param('name') name: string,
    @Query('version') version?: string,
  ): Promise<PromptTemplate> {
    return this.catalog.get(
      name,
      version === undefined ? undefined : Number(version),
    );
  }

  @Post()
  @RequireScope('admin')
  public async create(@Body() dto: CreatePromptDto): Promise<PromptTemplate> {
    return this.catalog.createTemplate(dto);
  }

  @Post(':name/versions')
  @RequireScope('admin')
  public async createVersion(
    @Param('name') name: string,
    @Body() dto: CreateVersionDto,
  ): Promise<PromptTemplate> {
    return this.catalog.createVersion(name, dto);
  }

  @Post(':name/versions/:version/activate')
  @HttpCode(HttpStatus.OK)
  @RequireScope('admin')
  public async activate(
    @Param('name') name: string,
    @Param('version') version: string,
  ): Promise<PromptTemplate> {
    return this.catalog.activateVersion(name, Number(version));
  }

  @Delete(':name')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireScope('admin')
  public async remove(
    @Param('name') name: string,
    @Query('version') version?: string,
  ): Promise<void> {
    await this.catalog.delete(
      name,
      version === undefined ? undefined : Number(version),
    );
  }
}
