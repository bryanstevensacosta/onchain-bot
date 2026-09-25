import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseFilters,
  forwardRef,
} from '@nestjs/common';
import { DomainExceptionFilter } from '../../../shared/filters/domain-exception.filter';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import { TemplateRepository } from '../../domain/ports/template.repository';
import type { PublishingTemplate } from '../../domain/entities/publishing-template.entity';
import { CreateTemplateUseCase } from '../../application/use-cases/create-template.use-case';
import { UpdateTemplateUseCase } from '../../application/use-cases/update-template.use-case';
import { SetTemplateSourcesUseCase } from '../../application/use-cases/set-template-sources.use-case';
import { ActivateTemplateUseCase } from '../../application/use-cases/activate-template.use-case';
import { GetTemplateRankingsUseCase } from '../../application/use-cases/get-template-rankings.use-case';
import { AssignTemplateChannelUseCase } from '../../application/use-cases/assign-template-channel.use-case';
import { GetPendingApprovalsUseCase } from '../../../approval/application/handlers/get-pending-approvals.use-case';
import {
  AssignChannelDto,
  CreateTemplateDto,
  RankingsQueryDto,
  ScoringConfigDto,
  UpdateSourcesDto,
  UpdateTemplateDto,
} from './dto/template.dto';

function toJson(template: PublishingTemplate): Record<string, unknown> {
  const scoring = template.scoringConfig;
  return {
    id: template.id,
    name: template.name,
    active: template.active,
    kolSourceIds: [...template.kolSourceIds],
    minVisibleScore: template.minVisibleScore,
    gemMinScore: template.gemMinScore,
    gemPatterns: [...template.gemPatterns],
    rankingStrategy: template.rankingStrategy,
    rankingLimit: template.rankingLimit,
    rankingWeights: { ...template.weights },
    scoringConfig: {
      baseScore: scoring.baseScore,
      bonuses: { ...scoring.bonuses },
      signalPenalties: { ...scoring.signalPenalties },
      securityCaps: { ...scoring.securityCaps },
      multiplierPivot: scoring.multiplierPivot,
      multiplierSlope: scoring.multiplierSlope,
      tiers: { ...scoring.tiers },
      gates: {
        ...scoring.gates,
        blockedClassifications: [...scoring.gates.blockedClassifications],
        blacklistedAddresses: [...scoring.gates.blacklistedAddresses],
        publishableChains: [...scoring.gates.publishableChains],
      },
    },
    threadConfig: template.threadConfig,
    botId: template.botId,
    channelTarget: template.channelTarget,
    adminVerifiedAt: template.adminVerifiedAt?.toISOString() ?? null,
    canPublish: template.canPublish(),
    createdAt: template.createdAtDate.toISOString(),
    updatedAt: template.updatedAtDate.toISOString(),
  };
}

/**
 * Templates controller — 11 endpoints (Tramo 1, todo 10, Ph9 API).
 *
 * 1-2 `GET /` + `POST /` · 3 `GET /:id` · 4 `PATCH /:id` · 5 `DELETE /:id`
 * 6-7 `POST /:id/activate|deactivate` · 8 `GET /:id/rankings`
 * 9 `GET /:id/pending-approvals` (delegates to the approval module, todo 11)
 * 10 `PATCH /:id/sources` (P16 selector, feed-validated)
 * 11 `PATCH /:id/channel` (P23-bis admin-verified target)
 * 12 `PATCH /:id/scoring` (P28 scoring_config, range-validated → 400)
 *
 * Thread routes are NOT here — `ThreadsStubController` answers 501 (C1).
 */
@Controller('api/templates')
@UseFilters(DomainExceptionFilter)
export class TemplatesController {
  public constructor(
    private readonly templates: TemplateRepository,
    private readonly createTemplate: CreateTemplateUseCase,
    private readonly update: UpdateTemplateUseCase,
    private readonly setSources: SetTemplateSourcesUseCase,
    private readonly activate: ActivateTemplateUseCase,
    private readonly rankings: GetTemplateRankingsUseCase,
    private readonly assignChannel: AssignTemplateChannelUseCase,
    @Inject(forwardRef(() => GetPendingApprovalsUseCase))
    private readonly pendingApprovals: GetPendingApprovalsUseCase,
  ) {}

  @Get()
  public async list(): Promise<Record<string, unknown>[]> {
    return (await this.templates.findAll()).map(toJson);
  }

  @Post()
  public async create(
    @Body() dto: CreateTemplateDto,
  ): Promise<Record<string, unknown>> {
    const { template } = await this.createTemplate.execute(dto);
    return toJson(template);
  }

  @Get(':id')
  public async getOne(
    @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    const template = await this.templates.findById(id);
    if (!template) {
      throw new DomainError(ErrorCode.NOT_FOUND, `template not found: ${id}`, {
        templateId: id,
      });
    }
    return toJson(template);
  }

  @Patch(':id')
  public async updateOne(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ): Promise<Record<string, unknown>> {
    const { template } = await this.update.execute({ id, patch: dto });
    return toJson(template);
  }

  @Delete(':id')
  public async remove(
    @Param('id') id: string,
  ): Promise<{ id: string; deleted: boolean }> {
    const removed = await this.templates.remove(id);
    if (!removed) {
      throw new DomainError(ErrorCode.NOT_FOUND, `template not found: ${id}`, {
        templateId: id,
      });
    }
    return { id, deleted: true };
  }

  @Post(':id/activate')
  @HttpCode(201)
  public async activateOne(
    @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    const { template } = await this.activate.execute({ id, active: true });
    return toJson(template);
  }

  @Post(':id/deactivate')
  @HttpCode(201)
  public async deactivateOne(
    @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    const { template } = await this.activate.execute({ id, active: false });
    return toJson(template);
  }

  @Get(':id/rankings')
  public async getRankings(
    @Param('id') id: string,
    @Query() query: RankingsQueryDto,
  ): Promise<Record<string, unknown>> {
    const { templateId, strategy, ranked } = await this.rankings.execute({
      templateId: id,
      strategy: query.strategy,
      limit: query.limit,
    });
    return {
      templateId,
      strategy,
      ranked: ranked.map((call) => ({
        mentionId: call.mentionId,
        kolId: call.kolId,
        score: call.score,
        rankScore: call.rankScore,
        rank: call.rank,
        strategy: call.strategy,
        scoredAt: call.scoredAt.toISOString(),
      })),
    };
  }

  @Get(':id/pending-approvals')
  public async getPendingApprovals(
    @Param('id') id: string,
  ): Promise<{ templateId: string; pending: unknown[] }> {
    const template = await this.templates.findById(id);
    if (!template) {
      throw new DomainError(ErrorCode.NOT_FOUND, `template not found: ${id}`, {
        templateId: id,
      });
    }
    const { pending } = await this.pendingApprovals.execute({
      templateId: id,
      limit: 50,
    });
    return {
      templateId: id,
      pending: pending.map((approval) => ({
        id: approval.id,
        mentionId: approval.mentionId,
        kolId: approval.kolId,
        chain: approval.chain,
        address: approval.address,
        ticker: approval.ticker,
        score: approval.score,
        status: approval.status,
      })),
    };
  }

  @Patch(':id/sources')
  public async updateSources(
    @Param('id') id: string,
    @Body() dto: UpdateSourcesDto,
  ): Promise<Record<string, unknown>> {
    const { template } = await this.setSources.execute({
      id,
      kolSourceIds: dto.kolSourceIds,
    });
    return toJson(template);
  }

  @Patch(':id/channel')
  public async assignChannelTarget(
    @Param('id') id: string,
    @Body() dto: AssignChannelDto,
  ): Promise<Record<string, unknown>> {
    const { template } = await this.assignChannel.execute({
      templateId: id,
      botId: dto.botId,
      channelTarget: dto.channelTarget,
    });
    return toJson(template);
  }

  @Patch(':id/scoring')
  public async updateScoringConfig(
    @Param('id') id: string,
    @Body() dto: ScoringConfigDto,
  ): Promise<Record<string, unknown>> {
    const { template } = await this.update.execute({
      id,
      patch: { scoringConfig: dto },
    });
    return toJson(template);
  }
}
