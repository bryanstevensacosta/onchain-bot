import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SettingsFilterEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-filter.entity';

export interface ScoringBonusTiers {
  readonly liquidityThresholdHigh: number;
  readonly liquidityHigh: number;
  readonly liquidityThresholdMedium: number;
  readonly liquidityMedium: number;
  readonly liquidityThresholdLow: number;
  readonly liquidityLow: number;
  readonly liquidityInsufficient: number;
  readonly holdersThresholdHigh: number;
  readonly holdersHigh: number;
  readonly holdersThresholdMedium: number;
  readonly holdersMedium: number;
  readonly holdersThresholdLow: number;
  readonly holdersLow: number;
  readonly holdersNone: number;
  readonly mcThresholdHigh: number;
  readonly mcHigh: number;
  readonly mcThresholdMedium: number;
  readonly mcMedium: number;
  readonly mcThresholdLow: number;
  readonly mcLow: number;
  readonly volumeThresholdHigh: number;
  readonly volumeHigh: number;
  readonly volumeThresholdLow: number;
  readonly volumeLow: number;
  readonly buzzMultiSource: number;
  readonly buzzTwoSources: number;
  readonly buzzMultiMentions: number;
  readonly buzzTwoMentions: number;
}

export interface ScoringTierThresholds {
  readonly strong: number;
  readonly decent: number;
  readonly neutral: number;
  readonly risky: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly ttlMs: number;

  private readonly signalsCache = new Map<string, CacheEntry<unknown[]>>();
  private readonly thresholdsCache = new Map<string, CacheEntry<unknown[]>>();
  private readonly filtersCache = new Map<string, CacheEntry<unknown[]>>();
  private readonly baseConfigCache = new Map<string, CacheEntry<unknown>>();

  public constructor(
    @InjectRepository(SettingsFilterEntity)
    private readonly filterRepo: Repository<SettingsFilterEntity>,
  ) {
    const envTtl = process.env.SETTINGS_CACHE_TTL_MS;
    this.ttlMs = envTtl ? parseInt(envTtl, 10) : 30_000;
  }

  private getFromCache<T>(
    map: Map<string, CacheEntry<T>>,
    key: string,
  ): T | null {
    const entry = map.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      map.delete(key);
      return null;
    }
    return entry.value;
  }

  private setInCache<T>(
    map: Map<string, CacheEntry<T>>,
    key: string,
    value: T,
  ): void {
    map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  invalidateSignalsCache(appliesTo?: 'token' | 'kol'): void {
    if (appliesTo) {
      this.signalsCache.delete(`signals:${appliesTo}`);
    } else {
      this.signalsCache.clear();
    }
  }

  invalidateThresholdsCache(scope?: 'token' | 'kol'): void {
    if (scope) {
      this.thresholdsCache.delete(`thresholds:${scope}`);
    } else {
      this.thresholdsCache.clear();
    }
  }

  invalidateFiltersCache(type?: string): void {
    if (type) {
      this.filtersCache.delete(`filters:${type}`);
    } else {
      this.filtersCache.clear();
    }
  }

  invalidateBaseConfigCache(): void {
    this.baseConfigCache.clear();
  }

  invalidateAll(): void {
    this.signalsCache.clear();
    this.thresholdsCache.clear();
    this.filtersCache.clear();
    this.baseConfigCache.clear();
  }

  async getFiltersByType(
    type: string,
    scope?: 'token' | 'kol' | 'all' | 'global',
  ): Promise<SettingsFilterEntity[]> {
    const key = `filters:${type}:${scope ?? 'any'}`;
    const cached = this.getFromCache(this.filtersCache, key);
    if (cached) return cached as SettingsFilterEntity[];

    const where: Record<string, unknown> = { type, enabled: true };
    if (scope) where.scope = scope;
    const fresh = await this.filterRepo.find({ where });
    this.setInCache(this.filtersCache, key, fresh);
    return fresh;
  }

  async getFilterValue(
    type: string,
    scope: 'token' | 'kol' | 'all' | 'global' = 'global',
  ): Promise<SettingsFilterEntity | null> {
    const rows = await this.getFiltersByType(type, scope);
    return rows[0] ?? null;
  }

  async getFilterNumericValue(
    type: string,
    fallback: number,
    scope: 'token' | 'kol' | 'all' | 'global' = 'global',
  ): Promise<number> {
    const row = await this.getFilterValue(type, scope);
    if (row && row.numericValue !== null) return row.numericValue;
    this.logger.warn(`Settings fallback: ${type}=${fallback} (no DB row)`);
    return fallback;
  }

  async getFilterStringValue(
    type: string,
    fallback: string,
    scope: 'token' | 'kol' | 'all' | 'global' = 'global',
  ): Promise<string> {
    const row = await this.getFilterValue(type, scope);
    if (row) return row.value;
    this.logger.warn(`Settings fallback: ${type}='${fallback}' (no DB row)`);
    return fallback;
  }

  async getBaseScore(): Promise<number> {
    return this.getFilterNumericValue('base_score', 50, 'global');
  }

  async getScoringTierThresholds(): Promise<ScoringTierThresholds> {
    const [strong, decent, neutral, risky] = await Promise.all([
      this.getFilterNumericValue('tier_threshold_strong', 80, 'global'),
      this.getFilterNumericValue('tier_threshold_decent', 60, 'global'),
      this.getFilterNumericValue('tier_threshold_neutral', 40, 'global'),
      this.getFilterNumericValue('tier_threshold_risky', 20, 'global'),
    ]);
    return { strong, decent, neutral, risky };
  }

  async getKolReputationThresholds(): Promise<{
    unknown: number;
    trusted: number;
    suspicious: number;
  }> {
    const [unknown, trusted, suspicious] = await Promise.all([
      this.getFilterNumericValue('kol_reputation_unknown', 0.5, 'global'),
      this.getFilterNumericValue('kol_reputation_trusted', 0.7, 'global'),
      this.getFilterNumericValue('kol_reputation_suspicious', 0.3, 'global'),
    ]);
    return { unknown, trusted, suspicious };
  }

  async getScoringBonusTiers(): Promise<ScoringBonusTiers> {
    const [
      liquidityThresholdHigh,
      liquidityThresholdMedium,
      liquidityThresholdLow,
      holdersThresholdHigh,
      holdersThresholdMedium,
      holdersThresholdLow,
      mcThresholdHigh,
      mcThresholdMedium,
      mcThresholdLow,
      volumeThresholdHigh,
      volumeThresholdLow,
    ] = await Promise.all([
      this.getFilterNumericValue('liq_threshold_high', 50_000, 'global'),
      this.getFilterNumericValue('liq_threshold_medium', 10_000, 'global'),
      this.getFilterNumericValue('liq_threshold_low', 1_000, 'global'),
      this.getFilterNumericValue('holders_threshold_high', 1_000, 'global'),
      this.getFilterNumericValue('holders_threshold_medium', 100, 'global'),
      this.getFilterNumericValue('holders_threshold_low', 10, 'global'),
      this.getFilterNumericValue('mc_threshold_high', 1_000_000, 'global'),
      this.getFilterNumericValue('mc_threshold_medium', 100_000, 'global'),
      this.getFilterNumericValue('mc_threshold_low', 10_000, 'global'),
      this.getFilterNumericValue('vol_threshold_high', 50_000, 'global'),
      this.getFilterNumericValue('vol_threshold_low', 10_000, 'global'),
    ]);
    return {
      liquidityThresholdHigh,
      liquidityHigh: 20,
      liquidityThresholdMedium,
      liquidityMedium: 10,
      liquidityThresholdLow,
      liquidityLow: 5,
      liquidityInsufficient: -10,
      holdersThresholdHigh,
      holdersHigh: 15,
      holdersThresholdMedium,
      holdersMedium: 8,
      holdersThresholdLow,
      holdersLow: 3,
      holdersNone: -10,
      mcThresholdHigh,
      mcHigh: 10,
      mcThresholdMedium,
      mcMedium: 5,
      mcThresholdLow,
      mcLow: 2,
      volumeThresholdHigh,
      volumeHigh: 5,
      volumeThresholdLow,
      volumeLow: 2,
      buzzMultiSource: 10,
      buzzTwoSources: 5,
      buzzMultiMentions: 5,
      buzzTwoMentions: 2,
    };
  }

  async getMultiplierPivot(): Promise<number> {
    return this.getFilterNumericValue('multiplier_pivot', 0.5, 'global');
  }

  async getMultiplierSlope(): Promise<number> {
    return this.getFilterNumericValue('multiplier_slope', 0.3, 'global');
  }

  async getSecurityFlagCaps(): Promise<
    Record<'SCAM' | 'SUSPICIOUS' | 'UNKNOWN' | 'LEGITIMATE', number>
  > {
    const cached = this.getFromCache(this.baseConfigCache, 'security_caps');
    if (cached)
      return cached as Record<
        'SCAM' | 'SUSPICIOUS' | 'UNKNOWN' | 'LEGITIMATE',
        number
      >;

    const rows = await this.filterRepo.find({
      where: { type: 'security_cap', enabled: true },
    });
    const caps: Record<
      'SCAM' | 'SUSPICIOUS' | 'UNKNOWN' | 'LEGITIMATE',
      number
    > = {
      SCAM: 5,
      SUSPICIOUS: 30,
      UNKNOWN: 20,
      LEGITIMATE: 100,
    };
    for (const r of rows) {
      if (
        r.numericValue !== null &&
        (r.value === 'SCAM' ||
          r.value === 'SUSPICIOUS' ||
          r.value === 'UNKNOWN' ||
          r.value === 'LEGITIMATE')
      ) {
        caps[r.value] = r.numericValue;
      }
    }
    this.setInCache(this.baseConfigCache, 'security_caps', caps);
    return caps;
  }

  async getPublishableChains(): Promise<string[]> {
    const cached = this.getFromCache(
      this.baseConfigCache,
      'publishable_chains',
    );
    if (cached) return cached as string[];

    const rows = await this.filterRepo.find({
      where: { type: 'publishable_chain', enabled: true },
    });
    if (rows.length === 0) {
      this.logger.warn(
        'Settings fallback: publishable_chains=[ethereum,solana] (no DB rows)',
      );
      return ['ethereum', 'solana'];
    }
    const chains = rows.map((r) => r.value);
    this.setInCache(this.baseConfigCache, 'publishable_chains', chains);
    return chains;
  }

  async getBlockedClassifications(): Promise<string[]> {
    const cached = this.getFromCache(
      this.baseConfigCache,
      'blocked_classifications',
    );
    if (cached) return cached as string[];

    const rows = await this.filterRepo.find({
      where: { type: 'blocked_classification', enabled: true },
    });
    if (rows.length === 0) {
      this.logger.warn(
        "Settings fallback: blocked_classifications=['SCAM','UNKNOWN'] (no DB rows)",
      );
      return ['SCAM', 'UNKNOWN'];
    }
    const list = rows.map((r) => r.value);
    this.setInCache(this.baseConfigCache, 'blocked_classifications', list);
    return list;
  }

  async getTokenGateConfig(): Promise<{
    minScore: number;
    maxRiskWeight: number;
    minCompleteness: number;
    blockedClassifications: string[];
    enableBlacklist: boolean;
  }> {
    const cached = this.getFromCache(this.baseConfigCache, 'token_gate_config');
    if (cached)
      return cached as {
        minScore: number;
        maxRiskWeight: number;
        minCompleteness: number;
        blockedClassifications: string[];
        enableBlacklist: boolean;
      };

    const minScore = await this.getFilterNumericValue(
      'min_score',
      50,
      'global',
    );
    const maxRiskWeight = await this.getFilterNumericValue(
      'max_risk_weight',
      100,
      'global',
    );
    const minCompleteness = await this.getFilterNumericValue(
      'min_completeness',
      0.3,
      'global',
    );
    const blockedClassifications = await this.getBlockedClassifications();
    const enableBlacklistRow = await this.getFilterValue(
      'enable_blacklist',
      'global',
    );
    const enableBlacklist = enableBlacklistRow
      ? enableBlacklistRow.value === 'true'
      : true;

    const config = {
      minScore,
      maxRiskWeight,
      minCompleteness,
      blockedClassifications,
      enableBlacklist,
    };
    this.setInCache(this.baseConfigCache, 'token_gate_config', config);
    return config;
  }

  async getHoneypotHeuristic(): Promise<{
    scoreBelow: number;
    riskWeightAbove: number;
  }> {
    const scoreBelow = await this.getFilterNumericValue(
      'honeypot_score',
      10,
      'global',
    );
    const riskWeightAbove = await this.getFilterNumericValue(
      'honeypot_risk',
      80,
      'global',
    );
    return { scoreBelow, riskWeightAbove };
  }

  async getHoneypotThresholds(): Promise<{
    ownerCanDrainLiquidity: number;
    flagMicrocap: number;
    flagExtremePrice: number;
    flagCriticalPrice: number;
    flagNewPairAgeMs: number;
    flagNewPairPrice: number;
    highBuyTaxRatio: number;
    highTransferTaxPriceImpact: number;
    highTransferTaxPairAgeMs: number;
    canSellBuyLiquidity: number;
  }> {
    const cached = this.getFromCache(
      this.baseConfigCache,
      'honeypot_thresholds',
    );
    if (cached)
      return cached as {
        ownerCanDrainLiquidity: number;
        flagMicrocap: number;
        flagExtremePrice: number;
        flagCriticalPrice: number;
        flagNewPairAgeMs: number;
        flagNewPairPrice: number;
        highBuyTaxRatio: number;
        highTransferTaxPriceImpact: number;
        highTransferTaxPairAgeMs: number;
        canSellBuyLiquidity: number;
      };

    const [
      ownerCanDrainLiquidity,
      flagMicrocap,
      flagExtremePrice,
      flagCriticalPrice,
      flagNewPairAgeMs,
      flagNewPairPrice,
      highBuyTaxRatio,
      highTransferTaxPriceImpact,
      highTransferTaxPairAgeMs,
      canSellBuyLiquidity,
    ] = await Promise.all([
      this.getFilterNumericValue(
        'honeypot_owner_can_drain_liquidity',
        100,
        'global',
      ),
      this.getFilterNumericValue('honeypot_flag_microcap', 1000, 'global'),
      this.getFilterNumericValue('honeypot_flag_extreme_price', 500, 'global'),
      this.getFilterNumericValue(
        'honeypot_flag_critical_price',
        1000,
        'global',
      ),
      this.getFilterNumericValue(
        'honeypot_flag_new_pair_age_ms',
        3_600_000,
        'global',
      ),
      this.getFilterNumericValue('honeypot_flag_new_pair_price', 200, 'global'),
      this.getFilterNumericValue('honeypot_high_buy_tax_ratio', 100, 'global'),
      this.getFilterNumericValue(
        'honeypot_high_transfer_tax_price_impact',
        0.5,
        'global',
      ),
      this.getFilterNumericValue(
        'honeypot_high_transfer_tax_pair_age_ms',
        86_400_000,
        'global',
      ),
      this.getFilterNumericValue(
        'honeypot_can_sell_buy_liquidity',
        100,
        'global',
      ),
    ]);

    const result = {
      ownerCanDrainLiquidity,
      flagMicrocap,
      flagExtremePrice,
      flagCriticalPrice,
      flagNewPairAgeMs,
      flagNewPairPrice,
      highBuyTaxRatio,
      highTransferTaxPriceImpact,
      highTransferTaxPairAgeMs,
      canSellBuyLiquidity,
    };
    this.setInCache(this.baseConfigCache, 'honeypot_thresholds', result);
    return result;
  }

  async getExtraThresholds(): Promise<{
    bundlers: number;
    insiders: number;
    bonding: number;
  }> {
    const bundlers = await this.getFilterNumericValue(
      'bundlers_threshold',
      30,
      'global',
    );
    const insiders = await this.getFilterNumericValue(
      'insiders_threshold',
      50,
      'global',
    );
    const bonding = await this.getFilterNumericValue(
      'bonding_threshold',
      99,
      'global',
    );
    return { bundlers, insiders, bonding };
  }

  async getKOLTrustedScore(): Promise<number> {
    return this.getFilterNumericValue('kol_trusted_score', 0.7, 'kol');
  }

  async getKOLSuspiciousScore(): Promise<number> {
    return this.getFilterNumericValue('kol_suspicious_score', 0.3, 'kol');
  }

  async getKOLConfidenceBuckets(): Promise<{
    low: number;
    medium: number;
    high: number;
    veryHigh: number;
  }> {
    const low = await this.getFilterNumericValue(
      'kol_confidence_low',
      5,
      'kol',
    );
    const medium = await this.getFilterNumericValue(
      'kol_confidence_medium',
      20,
      'kol',
    );
    const high = await this.getFilterNumericValue(
      'kol_confidence_high',
      50,
      'kol',
    );
    return { low, medium, high, veryHigh: Infinity };
  }

  async getKOLReputationFormula(): Promise<{ base: number; slope: number }> {
    const base = await this.getFilterNumericValue('kol_score_base', 0.5, 'kol');
    const slope = await this.getFilterNumericValue(
      'kol_score_slope',
      0.5,
      'kol',
    );
    return { base, slope };
  }

  async getKnownKOLs(): Promise<{
    good: Map<string, number>;
    bad: Set<string>;
  }> {
    const cached = this.getFromCache(this.baseConfigCache, 'known_kols');
    if (cached)
      return cached as { good: Map<string, number>; bad: Set<string> };

    const goodRows = await this.filterRepo.find({
      where: { type: 'known_good_kol', enabled: true },
    });
    const badRows = await this.filterRepo.find({
      where: { type: 'known_bad_kol', enabled: true },
    });

    const good = new Map<string, number>();
    for (const r of goodRows) {
      if (r.numericValue !== null)
        good.set(r.value.toLowerCase(), r.numericValue);
    }
    const bad = new Set<string>();
    for (const r of badRows) {
      bad.add(r.value.toLowerCase());
    }
    const result = { good, bad };
    this.setInCache(this.baseConfigCache, 'known_kols', result);
    return result;
  }

  async getBlacklistMints(): Promise<string[]> {
    const rows = await this.getFiltersByType('blacklist_mint', 'token');
    return rows.map((r) => r.value);
  }

  /** Inserts defaults for `type` only if rows don't exist yet. Returns count inserted. */
  async seedDefaultsIfEmpty(
    type: string,
    defaults: ReadonlyArray<{
      name: string;
      value: string;
      numericValue: number | null;
    }>,
  ): Promise<number> {
    let seeded = 0;
    for (const def of defaults) {
      const existing = await this.filterRepo.findOne({
        where: { type, value: def.name },
      });
      if (existing) continue;
      const row = this.filterRepo.create({
        type,
        value: def.name,
        numericValue: def.numericValue,
        scope: 'global',
        enabled: true,
        notes: null,
      });
      await this.filterRepo.save(row);
      seeded += 1;
    }
    return seeded;
  }
}
