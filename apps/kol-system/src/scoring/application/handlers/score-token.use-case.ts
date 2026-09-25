import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent } from '../../../shared/kernel/domain-event';
import {
  ScoredCall,
  type ScoreBreakdownItem,
} from '../../domain/entities/scored-call.entity';
import { Score } from '../../domain/value-objects/score.vo';
import { CallScoredEvent } from '../../domain/events/call-scored.event';
import {
  evaluateScoreGates,
  DEFAULT_GATE_CONFIG,
  type ScoreGateConfig,
} from './score-gates';
import { ScoredCallRepository } from '../ports/scored-call.repository';

export interface ScoreSignal {
  readonly type: string;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  readonly description: string;
}

export interface ScoreMentionInput {
  readonly mentionId: string;
  readonly kolId: string;
  readonly messageId: number;
  readonly contractIndex: number;
  readonly chain: string;
  readonly address: string;
  /** Market snapshot fields (null = unresolved; completeness derives from these). */
  readonly priceUsd?: number | null;
  readonly liquidityUsd?: number | null;
  readonly marketCapUsd?: number | null;
  readonly volume24hUsd?: number | null;
  readonly holders?: number | null;
  /** Rug-signal GROUP (never gate on a single field — composite riskWeight). */
  readonly lockedLiquidityPercent?: number | null;
  readonly burnedPercent?: number | null;
  readonly top10HolderPercent?: number | null;
  readonly signals?: ReadonlyArray<ScoreSignal>;
  readonly securityFlag?: 'SCAM' | 'SUSPICIOUS' | 'LEGITIMATE' | 'UNKNOWN';
  /** Classification label (template-side until todo 10; default UNKNOWN). */
  readonly classification?: string;
  readonly avgKolReputation?: number;
  readonly sourceCount?: number;
  readonly mentionCount?: number;
  readonly config?: ScoreGateConfig;
}

export interface ScoreTokenResult {
  /** One ScoredCall per mention that PASSED all gates (order = input order). */
  readonly scored: ReadonlyArray<ScoredCall>;
  /** One `scoring.token.scored` event per passing mention (direct return, no bus). */
  readonly events: ReadonlyArray<DomainEvent>;
  /** Below-cut + illegible mentions (discarded pre-publisher, never persisted). */
  readonly discarded: number;
}

/** Severity-weighted signal penalties (backend mirror). */
const SIGNAL_PENALTIES = { CRITICAL: 15, HIGH: 8, MEDIUM: 4, LOW: 1 } as const;

/** Security-flag score ceilings (backend mirror). */
const SECURITY_FLAG_CAPS = {
  SCAM: 5,
  SUSPICIOUS: 30,
  UNKNOWN: 20,
  LEGITIMATE: 100,
} as const;

/** Bonus tiers (backend `defaultSettings` mirror). */
const BONUS_TIERS = {
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
} as const;

/**
 * Score enriched mentions (Tramo 1, todo 9, P6 + G-08).
 *
 * Direct call, fix-1: invoked synchronously with the mention inputs —
 * no event bus on the way in or out (kol-system wires no bus; flow
 * `enrichment → scoring → templates` stays synchronous/deterministic).
 *
 * Formula v1 (backend `ScoreTokenUseCase` mirror, per-mention):
 *   base 50 + market bonuses (liquidity/holders/mc/volume) + buzz
 *   − signal penalties × channel-reputation multiplier (pivot 0.5,
 *   slope 0.3 → 0.85..1.15), floored by security flag, clamped 0-100.
 *
 * Gates: the 8 fail-fast gates (`score-gates.ts`) run after scoring —
 * any reason discards the mention pre-publisher (not persisted, no
 * event). An illegible mention is discarded with a warn log; the batch
 * keeps going. Empty input → empty output, never a throw.
 */
@Injectable()
export class ScoreTokenUseCase {
  private readonly logger = new Logger(ScoreTokenUseCase.name);

  public constructor(private readonly scoredRepo: ScoredCallRepository) {}

  public async execute(input: { mentions: ReadonlyArray<ScoreMentionInput> }): Promise<ScoreTokenResult> {
    const mentions = input.mentions ?? [];
    if (mentions.length === 0) {
      return { scored: [], events: [], discarded: 0 };
    }

    const scored: ScoredCall[] = [];
    const events: DomainEvent[] = [];
    let discarded = 0;

    for (const mention of mentions) {
      try {
        const result = this.scoreOne(mention);
        if (result === null) {
          discarded += 1;
          continue;
        }
        await this.scoredRepo.save(result);
        scored.push(result);
        events.push(
          new CallScoredEvent({
            mentionId: result.mentionId,
            kolId: result.kolId,
            messageId: result.messageId,
            chain: result.chain,
            address: result.address,
            score: result.score,
            tier: result.tier,
            avgKolReputation: result.avgKolReputation,
            breakdown: result.breakdown,
            scoredAt: result.scoredAt,
          }),
        );
      } catch (err) {
        this.logger.warn(
          `Discarding illegible mention ${mention.mentionId}: ${(err as Error).message}`,
        );
        discarded += 1;
      }
    }

    return { scored, events, discarded };
  }

  /** Returns the ScoredCall when all gates pass, else null (discard). */
  private scoreOne(input: ScoreMentionInput): ScoredCall | null {
    const breakdown: ScoreBreakdownItem[] = [];
    let score = 50;
    breakdown.push({ factor: 'BASE_SCORE', delta: 50, note: 'v1 base' });

    score += this.liquidityBonus(input.liquidityUsd ?? null, breakdown);
    score += this.holdersBonus(input.holders ?? null, breakdown);
    score += this.marketCapBonus(input.marketCapUsd ?? null, breakdown);
    score += this.volumeBonus(input.volume24hUsd ?? null, breakdown);
    score += this.buzzBonus(input.sourceCount ?? 1, input.mentionCount ?? 1, breakdown);
    score += this.signalPenalties(input.signals ?? [], breakdown);

    const avgRep = input.avgKolReputation ?? 0.5;
    const multiplier = 1 + (avgRep - 0.5) * 0.3;
    if (multiplier !== 1) {
      const before = score;
      score = Math.round(score * multiplier);
      breakdown.push({
        factor: 'CHANNEL_REPUTATION',
        delta: score - before,
        note: `x ${multiplier.toFixed(2)} (avg channel reputation ${avgRep.toFixed(2)})`,
      });
    }

    const securityFlag = input.securityFlag ?? this.defaultSecurityFlag(input);
    const cap = SECURITY_FLAG_CAPS[securityFlag];
    if (score > cap) {
      breakdown.push({
        factor: 'SECURITY_FLAG_CAP',
        delta: cap - score,
        note: `${securityFlag} security flag cap`,
      });
      score = cap;
    }

    if (score < 0) score = 0;
    if (score > 100) score = 100;

    const riskWeight = ScoreTokenUseCase.computeRiskWeight(input);
    const completeness = ScoreTokenUseCase.computeCompleteness(input);
    const config = input.config ?? DEFAULT_GATE_CONFIG;
    const reasons = evaluateScoreGates({
      chain: input.chain,
      address: input.address,
      score,
      classification: input.classification ?? 'UNKNOWN',
      riskWeight,
      snapshotCompleteness: completeness,
      config,
    });
    if (reasons.length > 0) {
      this.logger.warn(
        `Discarding below-cut mention ${input.mentionId}: ${reasons.map((r) => r.code).join(',')}`,
      );
      return null;
    }

    return ScoredCall.create({
      mentionId: input.mentionId,
      kolId: input.kolId,
      messageId: input.messageId,
      contractIndex: input.contractIndex,
      chain: input.chain,
      address: input.address,
      score: Score.fromNumber(score),
      avgKolReputation: avgRep,
      breakdown,
      scoredAt: new Date(),
    });
  }

  /**
   * No market data at all → UNKNOWN (cap 20, discarded by SCORE_TOO_LOW
   * under default gates); any market field → LEGITIMATE. Explicit input
   * always wins (same skew note as the backend event path, gap 24 there).
   */
  private defaultSecurityFlag(input: ScoreMentionInput): 'UNKNOWN' | 'LEGITIMATE' {
    const fields = [
      input.priceUsd,
      input.liquidityUsd,
      input.marketCapUsd,
      input.volume24hUsd,
      input.holders,
    ];
    return fields.some((f) => f !== undefined && f !== null) ? 'LEGITIMATE' : 'UNKNOWN';
  }

  /**
   * Composite risk 0..100 from the rug-signal GROUP (never a single
   * field): top10 concentration + unlocked liquidity + unburned supply,
   * renormalized over the available components. All-null → 0 (unknown
   * risk surfaces via INSUFFICIENT_DATA instead).
   */
  public static computeRiskWeight(input: {
    readonly lockedLiquidityPercent?: number | null;
    readonly burnedPercent?: number | null;
    readonly top10HolderPercent?: number | null;
  }): number {
    const parts: number[] = [];
    const weights: number[] = [];
    if (input.top10HolderPercent !== undefined && input.top10HolderPercent !== null) {
      parts.push(input.top10HolderPercent * 0.5);
      weights.push(0.5);
    }
    if (input.lockedLiquidityPercent !== undefined && input.lockedLiquidityPercent !== null) {
      parts.push((100 - input.lockedLiquidityPercent) * 0.25);
      weights.push(0.25);
    }
    if (input.burnedPercent !== undefined && input.burnedPercent !== null) {
      parts.push((100 - input.burnedPercent) * 0.25);
      weights.push(0.25);
    }
    if (parts.length === 0) return 0;
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    return Math.round((parts.reduce((a, b) => a + b, 0) / totalWeight) * 100) / 100;
  }

  /** Fraction of market fields resolved (0..1). */
  public static computeCompleteness(input: {
    readonly priceUsd?: number | null;
    readonly marketCapUsd?: number | null;
    readonly liquidityUsd?: number | null;
    readonly volume24hUsd?: number | null;
    readonly holders?: number | null;
  }): number {
    const fields = [
      input.priceUsd,
      input.marketCapUsd,
      input.liquidityUsd,
      input.volume24hUsd,
      input.holders,
    ];
    return fields.filter((f) => f !== undefined && f !== null).length / fields.length;
  }

  private liquidityBonus(liq: number | null, breakdown: ScoreBreakdownItem[]): number {
    if (liq === null) return 0;
    const t = BONUS_TIERS;
    if (liq >= t.liquidityThresholdHigh)
      return this.push(breakdown, 'LIQUIDITY_HIGH', t.liquidityHigh, `$${liq} high`);
    if (liq >= t.liquidityThresholdMedium)
      return this.push(breakdown, 'LIQUIDITY_MEDIUM', t.liquidityMedium, `$${liq} medium`);
    if (liq >= t.liquidityThresholdLow)
      return this.push(breakdown, 'LIQUIDITY_LOW', t.liquidityLow, `$${liq} low`);
    return this.push(
      breakdown,
      'LIQUIDITY_INSUFFICIENT',
      t.liquidityInsufficient,
      `$${liq} insufficient`,
    );
  }

  private holdersBonus(holders: number | null, breakdown: ScoreBreakdownItem[]): number {
    if (holders === null) return 0;
    const t = BONUS_TIERS;
    if (holders >= t.holdersThresholdHigh)
      return this.push(breakdown, 'HOLDERS_HIGH', t.holdersHigh, `${holders} holders`);
    if (holders >= t.holdersThresholdMedium)
      return this.push(breakdown, 'HOLDERS_MEDIUM', t.holdersMedium, `${holders} holders`);
    if (holders >= t.holdersThresholdLow)
      return this.push(breakdown, 'HOLDERS_LOW', t.holdersLow, `${holders} holders`);
    if (holders === 0) return this.push(breakdown, 'HOLDERS_NONE', t.holdersNone, '0 holders');
    return 0;
  }

  private marketCapBonus(mc: number | null, breakdown: ScoreBreakdownItem[]): number {
    if (mc === null) return 0;
    const t = BONUS_TIERS;
    if (mc >= t.mcThresholdHigh) return this.push(breakdown, 'MC_HIGH', t.mcHigh, `$${mc} mc`);
    if (mc >= t.mcThresholdMedium)
      return this.push(breakdown, 'MC_MEDIUM', t.mcMedium, `$${mc} mc`);
    if (mc >= t.mcThresholdLow) return this.push(breakdown, 'MC_LOW', t.mcLow, `$${mc} mc`);
    return 0;
  }

  private volumeBonus(vol: number | null, breakdown: ScoreBreakdownItem[]): number {
    if (vol === null) return 0;
    const t = BONUS_TIERS;
    if (vol >= t.volumeThresholdHigh)
      return this.push(breakdown, 'VOLUME_HIGH', t.volumeHigh, `$${vol} volume`);
    if (vol >= t.volumeThresholdLow)
      return this.push(breakdown, 'VOLUME_LOW', t.volumeLow, `$${vol} volume`);
    return 0;
  }

  private buzzBonus(
    sources: number,
    mentions: number,
    breakdown: ScoreBreakdownItem[],
  ): number {
    const t = BONUS_TIERS;
    let delta = 0;
    if (sources >= 3) delta += this.push(breakdown, 'MULTI_CHANNEL_BUZZ', t.buzzMultiSource, `${sources} channels`);
    else if (sources === 2) delta += this.push(breakdown, 'TWO_CHANNELS', t.buzzTwoSources, '2 channels');
    if (mentions >= 5) delta += this.push(breakdown, 'HIGH_MENTION_COUNT', t.buzzMultiMentions, `${mentions} mentions`);
    else if (mentions >= 2) delta += this.push(breakdown, 'MULTIPLE_MENTIONS', t.buzzTwoMentions, `${mentions} mentions`);
    return delta;
  }

  private signalPenalties(
    signals: ReadonlyArray<ScoreSignal>,
    breakdown: ScoreBreakdownItem[],
  ): number {
    let total = 0;
    for (const s of signals) {
      const penalty = SIGNAL_PENALTIES[s.severity] ?? 0;
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

  private push(
    breakdown: ScoreBreakdownItem[],
    factor: string,
    delta: number,
    note: string,
  ): number {
    breakdown.push({ factor, delta, note });
    return delta;
  }
}
