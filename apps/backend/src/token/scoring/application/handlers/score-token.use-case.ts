import { Injectable } from '@nestjs/common';
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
  public constructor(
    private readonly reputationPort: KolReputationPort,
    private readonly scoreRepo: TokenScoreRepository,
    private readonly eventPublisher: ScoringEventPublisher,
  ) {}

  public async execute(input: ScoreTokenInput): Promise<TokenScoreView> {
    const chain = ChainId.fromString(input.chain);
    const breakdown: ScoreBreakdownItem[] = [];
    let score = 50;

    score += this.liquidityBonus(input.liquidityUsd, breakdown);
    score += this.holdersBonus(input.holders, breakdown);
    score += this.marketCapBonus(input.marketCapUsd, breakdown);
    score += this.volumeBonus(input.volume24hUsd, breakdown);
    score += this.buzzBonus(input.sourceCount, input.mentionCount, breakdown);
    score += this.signalPenalties(input.signals, breakdown);

    const avgRep = await this.reputationPort.getAverageReputation(
      input.sourceChannelIds,
    );
    const multiplier = this.reputationMultiplier(avgRep);
    if (multiplier !== 1) {
      const before = score;
      score = Math.round(score * multiplier);
      breakdown.push({
        factor: 'CHANNEL_REPUTATION',
        delta: score - before,
        note: `× ${multiplier.toFixed(2)} (avg channel reputation ${avgRep.toFixed(2)})`,
      });
    }

    // Security flag cap: SCAM → max 5 (never look "good"), UNKNOWN → max 20
    const cap = this.securityFlagCap(input.securityFlag);
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

  private liquidityBonus(
    liq: number | null,
    breakdown: ScoreBreakdownItem[],
  ): number {
    if (liq === null) return 0;
    if (liq >= 50_000) {
      const d = 20;
      breakdown.push({
        factor: 'LIQUIDITY_HIGH',
        delta: d,
        note: `$${liq} ≥ $50k`,
      });
      return d;
    }
    if (liq >= 10_000) {
      const d = 10;
      breakdown.push({
        factor: 'LIQUIDITY_MEDIUM',
        delta: d,
        note: `$${liq} ≥ $10k`,
      });
      return d;
    }
    if (liq >= 1_000) {
      const d = 5;
      breakdown.push({
        factor: 'LIQUIDITY_LOW',
        delta: d,
        note: `$${liq} ≥ $1k`,
      });
      return d;
    }
    const d = -10;
    breakdown.push({
      factor: 'LIQUIDITY_INSUFFICIENT',
      delta: d,
      note: `$${liq} < $1k`,
    });
    return d;
  }

  private holdersBonus(
    holders: number | null,
    breakdown: ScoreBreakdownItem[],
  ): number {
    if (holders === null) return 0;
    if (holders >= 1000) {
      const d = 15;
      breakdown.push({
        factor: 'HOLDERS_HIGH',
        delta: d,
        note: `${holders} ≥ 1000`,
      });
      return d;
    }
    if (holders >= 100) {
      const d = 8;
      breakdown.push({
        factor: 'HOLDERS_MEDIUM',
        delta: d,
        note: `${holders} ≥ 100`,
      });
      return d;
    }
    if (holders >= 10) {
      const d = 3;
      breakdown.push({
        factor: 'HOLDERS_LOW',
        delta: d,
        note: `${holders} ≥ 10`,
      });
      return d;
    }
    if (holders === 0) {
      const d = -10;
      breakdown.push({ factor: 'HOLDERS_NONE', delta: d, note: '0 holders' });
      return d;
    }
    return 0;
  }

  private marketCapBonus(
    mc: number | null,
    breakdown: ScoreBreakdownItem[],
  ): number {
    if (mc === null) return 0;
    if (mc >= 1_000_000) {
      const d = 10;
      breakdown.push({ factor: 'MC_HIGH', delta: d, note: `$${mc} ≥ $1M` });
      return d;
    }
    if (mc >= 100_000) {
      const d = 5;
      breakdown.push({ factor: 'MC_MEDIUM', delta: d, note: `$${mc} ≥ $100k` });
      return d;
    }
    if (mc >= 10_000) {
      const d = 2;
      breakdown.push({ factor: 'MC_LOW', delta: d, note: `$${mc} ≥ $10k` });
      return d;
    }
    return 0;
  }

  private volumeBonus(
    vol: number | null,
    breakdown: ScoreBreakdownItem[],
  ): number {
    if (vol === null) return 0;
    if (vol >= 50_000) {
      const d = 5;
      breakdown.push({
        factor: 'VOLUME_HIGH',
        delta: d,
        note: `$${vol} ≥ $50k`,
      });
      return d;
    }
    if (vol >= 10_000) {
      const d = 2;
      breakdown.push({
        factor: 'VOLUME_LOW',
        delta: d,
        note: `$${vol} ≥ $10k`,
      });
      return d;
    }
    return 0;
  }

  private buzzBonus(
    sources: number,
    mentions: number,
    breakdown: ScoreBreakdownItem[],
  ): number {
    let delta = 0;
    if (sources >= 3) {
      delta += 10;
      breakdown.push({
        factor: 'MULTI_CHANNEL_BUZZ',
        delta: 10,
        note: `${sources} channels mention this`,
      });
    } else if (sources === 2) {
      delta += 5;
      breakdown.push({
        factor: 'TWO_CHANNELS',
        delta: 5,
        note: '2 channels mention this',
      });
    }
    if (mentions >= 5) {
      delta += 5;
      breakdown.push({
        factor: 'HIGH_MENTION_COUNT',
        delta: 5,
        note: `${mentions} mentions`,
      });
    } else if (mentions >= 2) {
      delta += 2;
      breakdown.push({
        factor: 'MULTIPLE_MENTIONS',
        delta: 2,
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
  ): number {
    let total = 0;
    for (const s of signals) {
      let penalty = 0;
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
      }
      if (penalty > 0) {
        total -= penalty;
        breakdown.push({
          factor: `SIGNAL_${s.type}`,
          delta: -penalty,
          note: `${s.severity} risk`,
        });
      }
    }
    return total;
  }

  private reputationMultiplier(avgRep: number): number {
    // 0.5 (unknown) → 1.0
    // 0.9 (trusted) → 1.15
    // 0.1 (suspicious) → 0.85
    // Linear in [0.5..1.5] mapped to [0.85..1.15]
    if (avgRep >= 0.5) {
      return 1 + (avgRep - 0.5) * 0.3; // 0.5→1.0, 0.9→1.12, 1.0→1.15
    }
    return 1 - (0.5 - avgRep) * 0.3; // 0.5→1.0, 0.1→0.88
  }

  private securityFlagCap(
    securityFlag: 'SCAM' | 'SUSPICIOUS' | 'LEGITIMATE' | 'UNKNOWN',
  ): number {
    if (securityFlag === 'SCAM') return 5;
    if (securityFlag === 'SUSPICIOUS') return 30;
    if (securityFlag === 'UNKNOWN') return 20;
    return 100;
  }
}
