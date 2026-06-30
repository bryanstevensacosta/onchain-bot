import { Injectable } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import { VipCallApprovalReason } from 'token/vip-call-approval/domain/value-objects/vip-call-approval-reason.vo';
import { VipCallApprovalDecision } from 'token/vip-call-approval/domain/entities/vip-call-approval-decision.entity';
import { VipCallBlacklistPort } from 'token/vip-call-approval/domain/ports/vip-call-blacklist.port';
import { VipCallApprovalDecisionRepository } from 'token/vip-call-approval/application/ports/vip-call-approval-decision.repository';
import { VipCallApprovalEventPublisher } from 'token/vip-call-approval/application/ports/vip-call-approval-event.publisher';
import {
  VipCallApprovalDecisionMapper,
  VipCallApprovalDecisionView,
} from 'token/vip-call-approval/application/mappers/vip-call-approval-decision.mapper';
import { SettingsService } from 'settings/application/services/settings.service';

export interface FilterConfig {
  readonly minScore: number;
  readonly maxRiskWeight: number;
  readonly minCompleteness: number;
  readonly blockedClassifications: ReadonlyArray<string>;
  readonly enableBlacklist: boolean;
}

export interface ApplyFiltersInput {
  readonly chain: string;
  readonly address: string;
  readonly score: number;
  readonly classification: string;
  readonly riskWeight: number;
  readonly snapshotCompleteness: number;
  readonly config?: FilterConfig;
}

/**
 * Use case: apply hard gates to a scored token.
 *
 * Gates (run in order, fail-fast):
 * 1. SCORE_TOO_LOW        — score < minScore
 * 2. CLASSIFICATION_BLOCKED — classification in blockedClassifications
 * 3. BLACKLISTED          — address in blacklist (if enabled)
 * 4. HONEYPOT_SUSPECTED   — score < honeypotScoreBelow with riskWeight >= honeypotRiskAbove
 *                            (cheap heuristic; real honeypot BC is future)
 * 5. RISK_WEIGHT_EXCEEDED — riskWeight > maxRiskWeight
 * 6. INSUFFICIENT_DATA    — completeness < minCompleteness
 * 7. CHAIN_UNSUPPORTED    — chain not in publishable set
 *
 * APPROVED if zero reasons, REJECTED otherwise.
 *
 * Wave 2.2 — thresholds + publishable chains are sourced from
 * `SettingsService` (cached 30s). Callers may override via `input.config`.
 */
@Injectable()
export class ApplyVipCallApprovalUseCase {
  public constructor(
    private readonly blacklist: VipCallBlacklistPort,
    private readonly decisionRepo: VipCallApprovalDecisionRepository,
    private readonly eventPublisher: VipCallApprovalEventPublisher,
    private readonly settings: SettingsService,
  ) {}

  public async execute(input: ApplyFiltersInput): Promise<VipCallApprovalDecisionView> {
    const chain = ChainId.fromString(input.chain);
    const dbConfig = await this.settings.getTokenGateConfig();
    const config: FilterConfig = input.config ?? {
      minScore: dbConfig.minScore,
      maxRiskWeight: dbConfig.maxRiskWeight,
      minCompleteness: dbConfig.minCompleteness,
      blockedClassifications: dbConfig.blockedClassifications,
      enableBlacklist: dbConfig.enableBlacklist,
    };
    const reasons: VipCallApprovalReason[] = [];

    if (input.score < config.minScore) {
      reasons.push(
        VipCallApprovalReason.create({
          code: 'SCORE_TOO_LOW',
          message: `Score ${input.score} < ${config.minScore} threshold`,
        }),
      );
    }

    if (config.blockedClassifications.includes(input.classification)) {
      reasons.push(
        VipCallApprovalReason.create({
          code: 'CLASSIFICATION_BLOCKED',
          message: `Classification "${input.classification}" is blocked`,
        }),
      );
    }

    if (config.enableBlacklist) {
      const bl = await this.blacklist.isBlacklisted(
        input.chain,
        input.address.toLowerCase(),
      );
      if (bl.blacklisted) {
        reasons.push(
          VipCallApprovalReason.create({
            code: 'BLACKLISTED',
            message: bl.reason ?? 'Address is blacklisted',
          }),
        );
      }
    }

    const honeypot = await this.settings.getHoneypotHeuristic();
    if (
      input.score < honeypot.scoreBelow &&
      input.riskWeight >= honeypot.riskWeightAbove
    ) {
      reasons.push(
        VipCallApprovalReason.create({
          code: 'HONEYPOT_SUSPECTED',
          message: `Score ${input.score} + riskWeight ${input.riskWeight} suggest honeypot`,
        }),
      );
    }

    if (input.riskWeight > config.maxRiskWeight) {
      reasons.push(
        VipCallApprovalReason.create({
          code: 'RISK_WEIGHT_EXCEEDED',
          message: `Risk weight ${input.riskWeight} > ${config.maxRiskWeight} max`,
        }),
      );
    }

    if (input.snapshotCompleteness < config.minCompleteness) {
      reasons.push(
        VipCallApprovalReason.create({
          code: 'INSUFFICIENT_DATA',
          message: `Snapshot completeness ${input.snapshotCompleteness} < ${config.minCompleteness}`,
        }),
      );
    }

    const publishableChains = await this.settings.getPublishableChains();
    if (
      publishableChains.length > 0 &&
      !publishableChains.includes(input.chain)
    ) {
      reasons.push(
        VipCallApprovalReason.create({
          code: 'CHAIN_UNSUPPORTED',
          message: `Chain "${input.chain}" is not enabled for publishing`,
        }),
      );
    }

    const decision = VipCallApprovalDecision.create({
      chain,
      address: input.address,
      score: input.score,
      classification: input.classification,
      riskWeight: input.riskWeight,
      snapshotCompleteness: input.snapshotCompleteness,
      reasons,
    });

    await this.decisionRepo.save(decision);
    decision.emit();
    await this.eventPublisher.publishAll(decision.commit());

    return VipCallApprovalDecisionMapper.toView(decision);
  }
}
