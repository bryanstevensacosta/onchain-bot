import { Injectable, Logger, Optional } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import { Score } from 'token/scoring/domain/value-objects/score.vo';
import {
  ScoreBreakdownItem,
  TokenScore,
} from 'token/scoring/domain/entities/token-score.entity';
import { KolReputationPort } from 'token/scoring/domain/ports/kol-reputation.port';
import { TokenScoreRepository } from 'token/scoring/application/ports/token-score.repository';
import { ScoringEventPublisher } from 'token/scoring/application/ports/scoring-event.publisher';
import {
  TokenScoreMapper,
  TokenScoreView,
} from 'token/scoring/application/mappers/token-score.mapper';
import { SettingsService } from 'settings/application/services/settings.service';
import { ScoringBonusTiers } from 'settings/application/services/settings.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SignalEntity } from 'settings/infrastructure/persistence/typeorm/entities/signal.entity';

export interface ScoreTokenInput {
  readonly chain: string;
  readonly address: string;
  readonly classification: string;
  readonly signals: ReadonlyArray<{
    readonly type: string;
    readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    readonly description: string;
  }>;
  readonly securityFlag: 'SCAM' | 'SUSPICIOUS' | 'LEGITIMATE' | 'UNKNOWN';
  readonly liquidityUsd: number | null;
  readonly marketCapUsd: number | null;
  readonly volume24hUsd: number | null;
  readonly holders: number | null;
  readonly sourceCount: number;
  readonly mentionCount: number;
  readonly sourceChannelIds: ReadonlyArray<string>;
  readonly breakdown?: ReadonlyArray<{
    factor: string;
    delta: number;
    note: string;
  }>;
}

/**
 * Use case: compute a single 0-100 score for a token.
 *
 * Formula (v1 heuristic):
 *   base = 50
 *   + market metric bonuses (liquidity, holders, MC, volume)
 *   + buzz bonuses (multi-channel, mention count)
 *   - risk penalties (CRITICAL/HIGH/MEDIUM/LOW weighted)
 *   × channel reputation multiplier (0.85..1.15)
 *   floor by security flag (SCAM→5, SUSPICIOUS→30, UNKNOWN→20)
 *
 * The output `breakdown` array explains every factor's contribution,
 * useful for debugging and downstream scoring explanations.
 */
@Injectable()
export class ScoreTokenUseCase {
  private readonly logger = new Logger(ScoreTokenUseCase.name);

  private readonly resolvedSettings: SettingsService;

  public constructor(
    private readonly reputationPort: KolReputationPort,
    private readonly scoreRepo: TokenScoreRepository,
    private readonly eventPublisher: ScoringEventPublisher,
    @Optional()
    @InjectRepository(SignalEntity)
    private readonly signalRepo?: Repository<SignalEntity>,
    @Optional() settings?: SettingsService,
  ) {
    this.resolvedSettings = settings ?? ScoreTokenUseCase.defaultSettings();
  }

  private static defaultSettings(): SettingsService {
    return {
      getBaseScore: async () => 50,
      getScoringBonusTiers: async () => ({
        liquidityThresholdHigh: 10_000,
        liquidityHigh: 20,
        liquidityThresholdMedium: 5_000,
        liquidityMedium: 10,
        liquidityThresholdLow: 1_000,
        liquidityLow: 5,
        liquidityInsufficient: -10,
        holdersThresholdHigh: 500,
        holdersHigh: 15,
        holdersThresholdMedium: 100,
        holdersMedium: 8,
        holdersThresholdLow: 10,
        holdersLow: 3,
        holdersNone: -10,
        mcThresholdHigh: 500_000,
        mcHigh: 10,
        mcThresholdMedium: 100_000,
        mcMedium: 5,
        mcThresholdLow: 10_000,
        mcLow: 2,
        volumeThresholdHigh: 50_000,
        volumeHigh: 5,
        volumeThresholdLow: 10_000,
        volumeLow: 2,
        buzzMultiSource: 10,
        buzzTwoSources: 5,
        buzzMultiMentions: 5,
        buzzTwoMentions: 2,
      }),
      getSecurityFlagCaps: async () => ({
        SCAM: 5,
        SUSPICIOUS: 30,
        UNKNOWN: 20,
        LEGITIMATE: 100,
      }),
      getMultiplierPivot: async () => 0.5,
      getMultiplierSlope: async () => 0.3,
      getPublishableChains: async (): Promise<string[]> => [
        'ethereum',
        'solana',
      ],
      getBlockedClassifications: async (): Promise<string[]> => [
        'SCAM',
        'UNKNOWN',
      ],
    } as SettingsService;
  }

  public async execute(input: ScoreTokenInput): Promise<TokenScoreView> {
    const chain = ChainId.fromString(input.chain);
    const breakdown: ScoreBreakdownItem[] = [];

    const baseScore = await this.resolvedSettings.getBaseScore();
    let score = baseScore;

    const signalPenaltyMap = await this.buildSignalPenaltyMap();
    const securityCaps = await this.resolvedSettings.getSecurityFlagCaps();
    const bonusTiers = await this.resolvedSettings.getScoringBonusTiers();

    score += this.liquidityBonus(input.liquidityUsd, breakdown, bonusTiers);
    score += this.holdersBonus(input.holders, breakdown, bonusTiers);
    score += this.marketCapBonus(input.marketCapUsd, breakdown, bonusTiers);
    score += this.volumeBonus(input.volume24hUsd, breakdown, bonusTiers);
    score += this.buzzBonus(
      input.sourceCount,
      input.mentionCount,
      breakdown,
      bonusTiers,
    );
    score += this.signalPenalties(input.signals, breakdown, signalPenaltyMap);

    const avgRep = await this.reputationPort.getAverageReputation(
      input.sourceChannelIds,
    );
    const multiplier = await this.reputationMultiplier(avgRep);
    if (multiplier !== 1) {
      const before = score;
      score = Math.round(score * multiplier);
      breakdown.push({
        factor: 'CHANNEL_REPUTATION',
        delta: score - before,
        note: `× ${multiplier.toFixed(2)} (avg channel reputation ${avgRep.toFixed(2)})`,
      });
    }

    const cap = this.securityFlagCap(input.securityFlag, securityCaps);
    if (score > cap) {
      breakdown.push({
        factor: 'SECURITY_FLAG_CAP',
        delta: cap - score,
        note: `${input.securityFlag} security flag cap`,
      });
      score = cap;
    }

    if (score < 0) score = 0;
    if (score > 100) score = 100;

    const tokenScore = TokenScore.create({
      chain,
      address: input.address,
      score: Score.fromNumber(score),
      classification: input.classification,
      sourceCount: input.sourceCount,
      mentionCount: input.mentionCount,
      avgKolReputation: avgRep,
      breakdown,
    });

    await this.scoreRepo.save(tokenScore);
    tokenScore.emitScored(input.securityFlag);
    await this.eventPublisher.publishAll(tokenScore.commit());

    return TokenScoreMapper.toView({
      id: tokenScore.id,
      chain: tokenScore.chain.value,
      address: tokenScore.address,
      score: tokenScore.score.value,
      tier: tokenScore.tier,
      classification: tokenScore.classification,
      sourceCount: tokenScore.sourceCount,
      mentionCount: tokenScore.mentionCount,
      avgKolReputation: tokenScore.avgKolReputation,
      breakdown,
      scoredAt: tokenScore.scoredAt,
    });
  }

  private async buildSignalPenaltyMap(): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!this.signalRepo) return map;
    try {
      const rows = await this.signalRepo.find({
        where: { appliesTo: 'token', enabled: true },
      });
      for (const r of rows) {
        map.set(r.code, r.penalty);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to load signal penalties from DB: ${(err as Error).message}; using severity-based defaults`,
      );
    }
    return map;
  }

  private liquidityBonus(
    liq: number | null,
    breakdown: ScoreBreakdownItem[],
    tier: ScoringBonusTiers,
  ): number {
    if (liq === null) return 0;
    if (liq >= tier.liquidityThresholdHigh) {
      const d = tier.liquidityHigh;
      breakdown.push({
        factor: 'LIQUIDITY_HIGH',
        delta: d,
        note: `$${liq} ≥ $${tier.liquidityThresholdHigh.toLocaleString()}`,
      });
      return d;
    }
    if (liq >= tier.liquidityThresholdMedium) {
      const d = tier.liquidityMedium;
      breakdown.push({
        factor: 'LIQUIDITY_MEDIUM',
        delta: d,
        note: `$${liq} ≥ $${tier.liquidityThresholdMedium.toLocaleString()}`,
      });
      return d;
    }
    if (liq >= tier.liquidityThresholdLow) {
      const d = tier.liquidityLow;
      breakdown.push({
        factor: 'LIQUIDITY_LOW',
        delta: d,
        note: `$${liq} ≥ $${tier.liquidityThresholdLow.toLocaleString()}`,
      });
      return d;
    }
    const d = tier.liquidityInsufficient;
    breakdown.push({
      factor: 'LIQUIDITY_INSUFFICIENT',
      delta: d,
      note: `$${liq} < $${tier.liquidityThresholdLow.toLocaleString()}`,
    });
    return d;
  }

  private holdersBonus(
    holders: number | null,
    breakdown: ScoreBreakdownItem[],
    tier: ScoringBonusTiers,
  ): number {
    if (holders === null) return 0;
    if (holders >= tier.holdersThresholdHigh) {
      const d = tier.holdersHigh;
      breakdown.push({
        factor: 'HOLDERS_HIGH',
        delta: d,
        note: `${holders} ≥ ${tier.holdersThresholdHigh.toLocaleString()}`,
      });
      return d;
    }
    if (holders >= tier.holdersThresholdMedium) {
      const d = tier.holdersMedium;
      breakdown.push({
        factor: 'HOLDERS_MEDIUM',
        delta: d,
        note: `${holders} ≥ ${tier.holdersThresholdMedium.toLocaleString()}`,
      });
      return d;
    }
    if (holders >= tier.holdersThresholdLow) {
      const d = tier.holdersLow;
      breakdown.push({
        factor: 'HOLDERS_LOW',
        delta: d,
        note: `${holders} ≥ ${tier.holdersThresholdLow.toLocaleString()}`,
      });
      return d;
    }
    if (holders === 0) {
      const d = tier.holdersNone;
      breakdown.push({ factor: 'HOLDERS_NONE', delta: d, note: '0 holders' });
      return d;
    }
    return 0;
  }

  private marketCapBonus(
    mc: number | null,
    breakdown: ScoreBreakdownItem[],
    tier: ScoringBonusTiers,
  ): number {
    if (mc === null) return 0;
    if (mc >= tier.mcThresholdHigh) {
      const d = tier.mcHigh;
      breakdown.push({
        factor: 'MC_HIGH',
        delta: d,
        note: `$${mc} ≥ $${tier.mcThresholdHigh.toLocaleString()}`,
      });
      return d;
    }
    if (mc >= tier.mcThresholdMedium) {
      const d = tier.mcMedium;
      breakdown.push({
        factor: 'MC_MEDIUM',
        delta: d,
        note: `$${mc} ≥ $${tier.mcThresholdMedium.toLocaleString()}`,
      });
      return d;
    }
    if (mc >= tier.mcThresholdLow) {
      const d = tier.mcLow;
      breakdown.push({
        factor: 'MC_LOW',
        delta: d,
        note: `$${mc} ≥ $${tier.mcThresholdLow.toLocaleString()}`,
      });
      return d;
    }
    return 0;
  }

  private volumeBonus(
    vol: number | null,
    breakdown: ScoreBreakdownItem[],
    tier: ScoringBonusTiers,
  ): number {
    if (vol === null) return 0;
    if (vol >= tier.volumeThresholdHigh) {
      const d = tier.volumeHigh;
      breakdown.push({
        factor: 'VOLUME_HIGH',
        delta: d,
        note: `$${vol} ≥ $${tier.volumeThresholdHigh.toLocaleString()}`,
      });
      return d;
    }
    if (vol >= tier.volumeThresholdLow) {
      const d = tier.volumeLow;
      breakdown.push({
        factor: 'VOLUME_LOW',
        delta: d,
        note: `$${vol} ≥ $${tier.volumeThresholdLow.toLocaleString()}`,
      });
      return d;
    }
    return 0;
  }

  private buzzBonus(
    sources: number,
    mentions: number,
    breakdown: ScoreBreakdownItem[],
    tier: ScoringBonusTiers,
  ): number {
    let delta = 0;
    if (sources >= 3) {
      const d = tier.buzzMultiSource;
      delta += d;
      breakdown.push({
        factor: 'MULTI_CHANNEL_BUZZ',
        delta: d,
        note: `${sources} channels mention this`,
      });
    } else if (sources === 2) {
      const d = tier.buzzTwoSources;
      delta += d;
      breakdown.push({
        factor: 'TWO_CHANNELS',
        delta: d,
        note: '2 channels mention this',
      });
    }
    if (mentions >= 5) {
      const d = tier.buzzMultiMentions;
      delta += d;
      breakdown.push({
        factor: 'HIGH_MENTION_COUNT',
        delta: d,
        note: `${mentions} mentions`,
      });
    } else if (mentions >= 2) {
      const d = tier.buzzTwoMentions;
      delta += d;
      breakdown.push({
        factor: 'MULTIPLE_MENTIONS',
        delta: d,
        note: `${mentions} mentions`,
      });
    }
    return delta;
  }

  private signalPenalties(
    signals: ReadonlyArray<{
      type: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    }>,
    breakdown: ScoreBreakdownItem[],
    signalPenaltyMap: Map<string, number>,
  ): number {
    let total = 0;
    for (const s of signals) {
      const code = `SIGNAL_${s.type}`;
      let penalty = signalPenaltyMap.get(code);
      if (penalty === undefined) {
        switch (s.severity) {
          case 'CRITICAL':
            penalty = 15;
            break;
          case 'HIGH':
            penalty = 8;
            break;
          case 'MEDIUM':
            penalty = 4;
            break;
          case 'LOW':
            penalty = 1;
            break;
          default:
            penalty = 0;
        }
      }
      if (penalty > 0) {
        total -= penalty;
        breakdown.push({
          factor: code,
          delta: -penalty,
          note: `${s.severity} risk`,
        });
      }
    }
    return total;
  }

  private async reputationMultiplier(avgRep: number): Promise<number> {
    const pivot = await this.resolvedSettings.getMultiplierPivot();
    const slope = await this.resolvedSettings.getMultiplierSlope();
    if (avgRep >= pivot) {
      return 1 + (avgRep - pivot) * slope;
    }
    return 1 - (pivot - avgRep) * slope;
  }

  private securityFlagCap(
    securityFlag: 'SCAM' | 'SUSPICIOUS' | 'LEGITIMATE' | 'UNKNOWN',
    caps: Record<'SCAM' | 'SUSPICIOUS' | 'UNKNOWN' | 'LEGITIMATE', number>,
  ): number {
    return caps[securityFlag];
  }
}
