import { Injectable } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import { FilterReason } from 'token/token-gating/domain/value-objects/filter-reason.vo';
import { FilterDecision } from 'token/token-gating/domain/entities/filter-decision.entity';
import { BlacklistPort } from 'token/token-gating/domain/ports/blacklist.port';
import { FilterDecisionRepository } from 'token/token-gating/application/ports/filter-decision.repository';
import { FiltersEventPublisher } from 'token/token-gating/application/ports/filters-event.publisher';
import {
  FilterDecisionMapper,
  FilterDecisionView,
} from 'token/token-gating/application/mappers/filter-decision.mapper';
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
export class ApplyFiltersUseCase {
  public constructor(
    private readonly blacklist: BlacklistPort,
    private readonly decisionRepo: FilterDecisionRepository,
    private readonly eventPublisher: FiltersEventPublisher,
    private readonly settings: SettingsService,
  ) {}

  public async execute(input: ApplyFiltersInput): Promise<FilterDecisionView> {
    const chain = ChainId.fromString(input.chain);
    const dbConfig = await this.settings.getTokenGateConfig();
    const config: FilterConfig = input.config ?? {
      minScore: dbConfig.minScore,
      maxRiskWeight: dbConfig.maxRiskWeight,
      minCompleteness: dbConfig.minCompleteness,
      blockedClassifications: dbConfig.blockedClassifications,
      enableBlacklist: dbConfig.enableBlacklist,
    };
    const reasons: FilterReason[] = [];

    if (input.score < config.minScore) {
      reasons.push(
        FilterReason.create({
          code: 'SCORE_TOO_LOW',
          message: `Score ${input.score} < ${config.minScore} threshold`,
        }),
      );
    }

    if (config.blockedClassifications.includes(input.classification)) {
      reasons.push(
        FilterReason.create({
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
          FilterReason.create({
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
        FilterReason.create({
          code: 'HONEYPOT_SUSPECTED',
          message: `Score ${input.score} + riskWeight ${input.riskWeight} suggest honeypot`,
        }),
      );
    }

    if (input.riskWeight > config.maxRiskWeight) {
      reasons.push(
        FilterReason.create({
          code: 'RISK_WEIGHT_EXCEEDED',
          message: `Risk weight ${input.riskWeight} > ${config.maxRiskWeight} max`,
        }),
      );
    }

    if (input.snapshotCompleteness < config.minCompleteness) {
      reasons.push(
        FilterReason.create({
          code: 'INSUFFICIENT_DATA',
          message: `Snapshot completeness ${input.snapshotCompleteness} < ${config.minCompleteness}`,
        }),
      );
    }

    const publishableChains = await this.settings.getPublishableChains();
    if (!publishableChains.includes(input.chain)) {
      reasons.push(
        FilterReason.create({
          code: 'CHAIN_UNSUPPORTED',
          message: `Chain "${input.chain}" is not enabled for publishing`,
        }),
      );
    }

    const decision = FilterDecision.create({
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

    return FilterDecisionMapper.toView(decision);
  }
}