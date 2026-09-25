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
  PublishingSessionUseCases,
  toPublishingSessionView,
  type PublishingSessionView,
} from '../../application/use-cases/publishing-session.use-cases';
import {
  CreateSessionDto,
  SetSourceToggleDto,
  UpdateSessionDto,
} from '../input/session.input';

/**
 * Publishing-session CRUD (`/api/sessions`, frontend-backed).
 *
 * One tab = one session: load a content template or run ad-hoc. Per
 * session the dashboard toggles sources on/off (toggles only — no
 * ingestion sources are created here), edits keywords and the
 * matching/publishing/llm switches, sets its own scheduling, binds N
 * telegram + N threads bots, and flips active/inactive.
 */
@ApiTags('feed-publisher-sessions')
@Controller('api/sessions')
export class SessionsController {
  public constructor(private readonly useCases: PublishingSessionUseCases) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a publishing session' })
  @ApiResponse({ status: 201, description: 'Session created' })
  @ApiResponse({ status: 404, description: 'Unknown template id' })
  public async create(
    @Body() dto: CreateSessionDto,
  ): Promise<PublishingSessionView> {
    const created = await this.useCases.create({
      id: dto.id,
      name: dto.name,
      templateId: dto.templateId ?? null,
      sourceToggles: dto.sourceToggles,
      keywordIds: dto.keywordIds,
      matchingEnabled: dto.matchingEnabled,
      publishingEnabled: dto.publishingEnabled,
      llmEnabled: dto.llmEnabled,
      telegramTargets: dto.telegramTargets,
      threadsTargets: dto.threadsTargets,
      active: dto.active,
    });
    return toPublishingSessionView(created);
  }

  @Get()
  @ApiOperation({ summary: 'List publishing sessions' })
  @ApiResponse({ status: 200, description: 'Sessions' })
  public async list(): Promise<ReadonlyArray<PublishingSessionView>> {
    const all = await this.useCases.list();
    return all.map(toPublishingSessionView);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a publishing session' })
  @ApiResponse({ status: 404, description: 'Unknown session id' })
  public async get(@Param('id') id: string): Promise<PublishingSessionView> {
    return toPublishingSessionView(await this.useCases.get(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a publishing session' })
  @ApiResponse({ status: 404, description: 'Unknown session id' })
  public async update(
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
  ): Promise<PublishingSessionView> {
    const updated = await this.useCases.update(id, {
      templateId: dto.templateId,
      sourceToggles: dto.sourceToggles,
      keywordIds: dto.keywordIds,
      matchingEnabled: dto.matchingEnabled,
      publishingEnabled: dto.publishingEnabled,
      llmEnabled: dto.llmEnabled,
      telegramTargets: dto.telegramTargets,
      threadsTargets: dto.threadsTargets,
      active: dto.active,
    });
    return toPublishingSessionView(updated);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate a publishing session' })
  @ApiResponse({ status: 200, description: 'Session activated' })
  public async activate(
    @Param('id') id: string,
  ): Promise<PublishingSessionView> {
    return toPublishingSessionView(await this.useCases.activate(id));
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a publishing session' })
  @ApiResponse({ status: 200, description: 'Session deactivated' })
  public async deactivate(
    @Param('id') id: string,
  ): Promise<PublishingSessionView> {
    return toPublishingSessionView(await this.useCases.deactivate(id));
  }

  @Patch(':id/sources')
  @ApiOperation({
    summary: 'Toggle a session source on/off (no sources created)',
  })
  @ApiResponse({ status: 200, description: 'Source toggled' })
  public async setSourceToggle(
    @Param('id') id: string,
    @Body() dto: SetSourceToggleDto,
  ): Promise<PublishingSessionView> {
    const updated = await this.useCases.setSourceToggle(
      id,
      dto.sourceId,
      dto.enabled,
    );
    return toPublishingSessionView(updated);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a publishing session' })
  @ApiResponse({ status: 204, description: 'Session deleted' })
  public async remove(@Param('id') id: string): Promise<void> {
    await this.useCases.remove(id);
  }
}
