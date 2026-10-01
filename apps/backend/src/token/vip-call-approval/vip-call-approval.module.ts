import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { SettingsModule } from 'settings/settings.module';
import { VipCallBlacklistPort } from 'token/vip-call-approval/domain/ports/vip-call-blacklist.port';
import { VipCallApprovalDecisionRepository } from 'token/vip-call-approval/application/ports/vip-call-approval-decision.repository';
import { VipCallApprovalEventPublisher } from 'token/vip-call-approval/application/ports/vip-call-approval-event.publisher';
import { ApplyVipCallApprovalUseCase } from 'token/vip-call-approval/application/handlers/apply-vip-call-approval.use-case';
import { GetVipCallApprovalDecisionUseCase } from 'token/vip-call-approval/application/handlers/get-vip-call-approval-decision.use-case';
import { ListVipCallApprovalDecisionsUseCase } from 'token/vip-call-approval/application/handlers/list-vip-call-approval-decisions.use-case';
import { InMemoryVipCallBlacklistAdapter } from 'token/vip-call-approval/infrastructure/adapters/in-memory-vip-call-blacklist.adapter';
import { InMemoryVipCallApprovalDecisionRepository } from 'token/vip-call-approval/infrastructure/repositories/in-memory-vip-call-approval-decision.repository';
import { VipCallApprovalDecisionEntity } from 'token/vip-call-approval/infrastructure/persistence/typeorm/entities/vip-call-approval-decision.entity';
import { TypeOrmVipCallApprovalDecisionRepository } from 'token/vip-call-approval/infrastructure/persistence/typeorm/repositories/typeorm-vip-call-approval-decision.repository';
import { VipCallScoreHandler } from 'token/vip-call-approval/infrastructure/event-bus/vip-call-score.handler';
import { VipCallApprovalController } from 'token/vip-call-approval/api/http/vip-call-approval.controller';
import { InProcessDomainEventPublisher } from 'shared/common/messaging/in-process-domain-event.publisher';

/**
 * @deprecated Moved to apps/kol-system/src/approval/ (Tramo 1, todo 11 + P18 companion).
 * Approval now lives in kol-system: CallApproval + EvaluateApproval + GetPendingApprovals.
 * This module stays wired for dual-run; it will be removed in todo 16 (cutover + cleanup).
 * Do not extend it — add approval logic in apps/kol-system/src/approval/ instead.
 *
 * New location: apps/kol-system/src/approval/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 *
 * Filters BC module — final gate before publishing.
 *
 * Consumes: `scoring.token.scored` events
 * Emits:    `vip-call.approval.approved` or `vip-call.approval.rejected` events
 *
 * Gates (configurable): score threshold, classification block,
 * blacklist, honeypot suspicion, risk weight, completeness, chain support.
 *
 * N18: VipCallApprovalDecision persisted via TypeORM (Tier-2).
 */
@Module({
  imports: [
    SettingsModule,
    TypeOrmModule.forFeature([VipCallApprovalDecisionEntity]),
  ],
  controllers: [VipCallApprovalController],
  providers: [
    ApplyVipCallApprovalUseCase,
    GetVipCallApprovalDecisionUseCase,
    ListVipCallApprovalDecisionsUseCase,
    VipCallScoreHandler,
    {
      provide: VipCallBlacklistPort,
      useClass: InMemoryVipCallBlacklistAdapter,
    },
    InMemoryVipCallApprovalDecisionRepository,
    ...(isDatabaseEnabled() ? [TypeOrmVipCallApprovalDecisionRepository] : []),
    {
      provide: VipCallApprovalDecisionRepository,
      inject: [
        InMemoryVipCallApprovalDecisionRepository,
        ...(isDatabaseEnabled()
          ? [TypeOrmVipCallApprovalDecisionRepository]
          : []),
      ],
      useFactory: (
        inMemory: InMemoryVipCallApprovalDecisionRepository,
        typeorm?: TypeOrmVipCallApprovalDecisionRepository,
      ): VipCallApprovalDecisionRepository => typeorm ?? inMemory,
    },
    {
      provide: VipCallApprovalEventPublisher,
      useClass: InProcessDomainEventPublisher,
    },
  ],
  exports: [VipCallApprovalDecisionRepository, VipCallApprovalEventPublisher],
})
export class VipCallApprovalModule {}
