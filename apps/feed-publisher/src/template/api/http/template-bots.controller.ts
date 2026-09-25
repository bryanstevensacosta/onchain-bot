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
  TemplateBotUseCases,
  type TemplateBotView,
} from '../../application/use-cases/template-bot.use-cases';
import { CreateTemplateBotDto } from '../input/content-template.input';

/**
 * Template-bot catalog CRUD (`/api/content-template-bots`,
 * frontend-backed). Tokens persist only as ciphertext; reads redacted.
 */
@ApiTags('feed-publisher-template-bots')
@Controller('api/content-template-bots')
export class TemplateBotsController {
  public constructor(private readonly useCases: TemplateBotUseCases) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a template bot' })
  @ApiResponse({ status: 201, description: 'Bot registered (redacted)' })
  public async create(
    @Body() dto: CreateTemplateBotDto,
  ): Promise<TemplateBotView> {
    return this.useCases.create({
      id: dto.id,
      label: dto.label,
      target: dto.target,
      token: dto.token,
      defaultChatId: dto.defaultChatId ?? null,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List template bots (redacted)' })
  @ApiResponse({ status: 200, description: 'Bots' })
  public async list(): Promise<ReadonlyArray<TemplateBotView>> {
    return this.useCases.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a template bot (redacted)' })
  @ApiResponse({ status: 404, description: 'Unknown bot id' })
  public async get(@Param('id') id: string): Promise<TemplateBotView> {
    return this.useCases.get(id);
  }

  @Patch(':id/verify')
  @ApiOperation({ summary: 'Mark a bot channel assignment verified' })
  @ApiResponse({ status: 200, description: 'Bot verified' })
  public async verify(@Param('id') id: string): Promise<TemplateBotView> {
    return this.useCases.markVerified(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a template bot' })
  @ApiResponse({ status: 204, description: 'Bot deleted' })
  public async remove(@Param('id') id: string): Promise<void> {
    await this.useCases.remove(id);
  }
}
