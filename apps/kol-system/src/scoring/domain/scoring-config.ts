import { DomainError, ErrorCode } from '../../shared/kernel/domain-error';
import {
  DEFAULT_GATE_CONFIG,
  type ScoreGateConfig,
} from '../application/handlers/score-gates';
import {
  DEFAULT_TIER_THRESHOLDS,
  type ScoringTierThresholds,
} from './value-objects/score-tier.vo';

/**
 * Market-bonus tiers (backend `defaultSettings` mirror — the v1 values
 * below are the single source of truth for defaults since todo 22).
 */
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

/** Severity-weighted signal penalties (backend mirror). */
export interface ScoringSignalPenalties {
  readonly CRITICAL: number;
  readonly HIGH: number;
  readonly MEDIUM: number;
  readonly LOW: number;
}

/** Security-flag score ceilings (backend mirror). */
export interface ScoringSecurityCaps {
  readonly SCAM: number;
  readonly SUSPICIOUS: number;
  readonly UNKNOWN: number;
  readonly LEGITIMATE: number;
}

/**
 * Per-template scoring configuration (Tramo 1, todo 22, P28).
 *
 * NOTHING is hardcoded in the scorer anymore: base score, market bonuses,
 * signal penalties, security caps, reputation multiplier, tier thresholds
 * and gate thresholds all live here. Stored on `PublishingTemplate`
 * (`scoring_config`); `ScoreTokenUseCase` reads it from the mention input
 * and falls back to `DEFAULT_SCORING_CONFIG` (v1 values from todo 9) when
 * absent — so the default pipeline is byte-for-byte the old v1 math.
 *
 * NOTE: imports the gate/tier shapes only (no runtime cycle back into
 * this module — `score-gates.ts` and `score-tier.vo.ts` never import here).
 */
export interface TemplateScoringConfig {
  readonly baseScore: number;
  readonly bonuses: ScoringBonusTiers;
  readonly signalPenalties: ScoringSignalPenalties;
  readonly securityCaps: ScoringSecurityCaps;
  readonly multiplierPivot: number;
  readonly multiplierSlope: number;
  readonly tiers: ScoringTierThresholds;
  readonly gates: ScoreGateConfig;
}

/** Deep-partial patch: every section and every field optional (PATCH semantics). */
export interface ScoringConfigPatch {
  readonly baseScore?: number;
  readonly bonuses?: Partial<ScoringBonusTiers>;
  readonly signalPenalties?: Partial<ScoringSignalPenalties>;
  readonly securityCaps?: Partial<ScoringSecurityCaps>;
  readonly multiplierPivot?: number;
  readonly multiplierSlope?: number;
  readonly tiers?: Partial<ScoringTierThresholds>;
  readonly gates?: Partial<ScoreGateConfig>;
}

/** v1 defaults (todo 9 formula, backend mirror) — the compat baseline. */
export const DEFAULT_SCORING_CONFIG: TemplateScoringConfig = deepFreeze({
  baseScore: 50,
  bonuses: {
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
  },
  signalPenalties: { CRITICAL: 15, HIGH: 8, MEDIUM: 4, LOW: 1 },
  securityCaps: { SCAM: 5, SUSPICIOUS: 30, UNKNOWN: 20, LEGITIMATE: 100 },
  multiplierPivot: 0.5,
  multiplierSlope: 0.3,
  tiers: { ...DEFAULT_TIER_THRESHOLDS },
  gates: {
    ...DEFAULT_GATE_CONFIG,
    blockedClassifications: [...DEFAULT_GATE_CONFIG.blockedClassifications],
    blacklistedAddresses: [...DEFAULT_GATE_CONFIG.blacklistedAddresses],
    publishableChains: [...DEFAULT_GATE_CONFIG.publishableChains],
  },
});

function deepFreeze<T>(input: T): T {
  if (input !== null && typeof input === 'object') {
    for (const value of Object.values(input)) {
      deepFreeze(value);
    }
    Object.freeze(input);
  }
  return input;
}

/**
 * Strips `undefined`-valued keys so class-transformer DTO instances (which
 * materialize every declared field, even unset ones) never overwrite base
 * values with `undefined` on spread.
 */
function defined<T extends object>(obj: T | undefined | null): Partial<T> {
  if (obj === undefined || obj === null) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}

/**
 * Merges a patch over a base config (fresh frozen object every call —
 * no shared references with the base, the patch, or the defaults).
 */
export function mergeScoringConfig(
  base: TemplateScoringConfig,
  patch: ScoringConfigPatch | null | undefined,
): TemplateScoringConfig {
  if (!patch) {
    return mergeScoringConfig(DEFAULT_SCORING_CONFIG, {});
  }
  return deepFreeze({
    baseScore: patch.baseScore ?? base.baseScore,
    bonuses: { ...base.bonuses, ...defined(patch.bonuses) },
    signalPenalties: {
      ...base.signalPenalties,
      ...defined(patch.signalPenalties),
    },
    securityCaps: { ...base.securityCaps, ...defined(patch.securityCaps) },
    multiplierPivot: patch.multiplierPivot ?? base.multiplierPivot,
    multiplierSlope: patch.multiplierSlope ?? base.multiplierSlope,
    tiers: { ...base.tiers, ...defined(patch.tiers) },
    gates: {
      ...base.gates,
      ...defined(patch.gates),
      blockedClassifications: patch.gates?.blockedClassifications
        ? [...patch.gates.blockedClassifications]
        : [...base.gates.blockedClassifications],
      blacklistedAddresses: patch.gates?.blacklistedAddresses
        ? [...patch.gates.blacklistedAddresses]
        : [...base.gates.blacklistedAddresses],
      publishableChains: patch.gates?.publishableChains
        ? [...patch.gates.publishableChains]
        : [...base.gates.publishableChains],
    },
  });
}

/** Resolves a mention-level patch over the v1 defaults (scorer fallback). */
export function resolveScoringConfig(
  patch: ScoringConfigPatch | null | undefined,
): TemplateScoringConfig {
  return mergeScoringConfig(DEFAULT_SCORING_CONFIG, patch);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkNumber(
  value: unknown,
  name: string,
  min: number,
  max: number,
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      `scoring_config.${name} must be a finite number`,
      { field: name },
    );
  }
  if (value < min || value > max) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      `scoring_config.${name} must be ${min}..${max}, got ${value}`,
      { field: name, value },
    );
  }
}

function checkStringArray(value: unknown, name: string): void {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string')
  ) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      `scoring_config.${name} must be an array of strings`,
      { field: name },
    );
  }
}

const BONUS_THRESHOLDS: ReadonlyArray<keyof ScoringBonusTiers> = [
  'liquidityThresholdHigh',
  'liquidityThresholdMedium',
  'liquidityThresholdLow',
  'holdersThresholdHigh',
  'holdersThresholdMedium',
  'holdersThresholdLow',
  'mcThresholdHigh',
  'mcThresholdMedium',
  'mcThresholdLow',
  'volumeThresholdHigh',
  'volumeThresholdLow',
];

const BONUS_DELTAS: ReadonlyArray<keyof ScoringBonusTiers> = [
  'liquidityHigh',
  'liquidityMedium',
  'liquidityLow',
  'liquidityInsufficient',
  'holdersHigh',
  'holdersMedium',
  'holdersLow',
  'holdersNone',
  'mcHigh',
  'mcMedium',
  'mcLow',
  'volumeHigh',
  'volumeLow',
  'buzzMultiSource',
  'buzzTwoSources',
  'buzzMultiMentions',
  'buzzTwoMentions',
];

/**
 * Validates a FULL scoring config (ranges + ordering). Throws
 * `DomainError` VALIDATION (→ HTTP 400 via `DomainExceptionFilter`) on
 * anything out of range. The template entity validates the MERGED config
 * so partial PATCHes are checked against their effective values.
 */
export function validateScoringConfig(candidate: unknown): void {
  if (!isRecord(candidate)) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      'scoring_config must be an object',
    );
  }
  checkNumber(candidate.baseScore, 'baseScore', 0, 100);
  if (!isRecord(candidate.bonuses)) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      'scoring_config.bonuses must be an object',
    );
  }
  for (const key of BONUS_THRESHOLDS) {
    checkNumber(
      candidate.bonuses[key],
      `bonuses.${key}`,
      0,
      Number.MAX_SAFE_INTEGER,
    );
  }
  for (const key of BONUS_DELTAS) {
    checkNumber(candidate.bonuses[key], `bonuses.${key}`, -100, 100);
  }
  // Threshold ladders must stay ordered high >= medium >= low.
  const ladder: ReadonlyArray<ReadonlyArray<keyof ScoringBonusTiers>> = [
    [
      'liquidityThresholdHigh',
      'liquidityThresholdMedium',
      'liquidityThresholdLow',
    ],
    ['holdersThresholdHigh', 'holdersThresholdMedium', 'holdersThresholdLow'],
    ['mcThresholdHigh', 'mcThresholdMedium', 'mcThresholdLow'],
    ['volumeThresholdHigh', 'volumeThresholdLow'],
  ];
  const bonuses = candidate.bonuses as Record<string, number>;
  for (const steps of ladder) {
    for (let i = 1; i < steps.length; i += 1) {
      if (bonuses[steps[i - 1]] < bonuses[steps[i]]) {
        throw new DomainError(
          ErrorCode.VALIDATION,
          `scoring_config.bonuses.${steps[i - 1]} must be >= ${steps[i]}`,
          { field: `bonuses.${steps[i - 1]}` },
        );
      }
    }
  }
  if (!isRecord(candidate.signalPenalties)) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      'scoring_config.signalPenalties must be an object',
    );
  }
  for (const key of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const) {
    checkNumber(
      (candidate.signalPenalties as Record<string, unknown>)[key],
      `signalPenalties.${key}`,
      0,
      100,
    );
  }
  if (!isRecord(candidate.securityCaps)) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      'scoring_config.securityCaps must be an object',
    );
  }
  for (const key of ['SCAM', 'SUSPICIOUS', 'UNKNOWN', 'LEGITIMATE'] as const) {
    checkNumber(
      (candidate.securityCaps as Record<string, unknown>)[key],
      `securityCaps.${key}`,
      0,
      100,
    );
  }
  checkNumber(candidate.multiplierPivot, 'multiplierPivot', 0, 1);
  checkNumber(candidate.multiplierSlope, 'multiplierSlope', 0, 2);
  if (!isRecord(candidate.tiers)) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      'scoring_config.tiers must be an object',
    );
  }
  const tiers = candidate.tiers as Record<string, unknown>;
  for (const key of ['strong', 'decent', 'neutral', 'risky'] as const) {
    checkNumber(tiers[key], `tiers.${key}`, 0, 100);
  }
  const order = ['strong', 'decent', 'neutral', 'risky'] as const;
  for (let i = 1; i < order.length; i += 1) {
    if ((tiers[order[i - 1]] as number) <= (tiers[order[i]] as number)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `scoring_config.tiers must stay ordered strong > decent > neutral > risky`,
        { field: `tiers.${order[i]}` },
      );
    }
  }
  if (!isRecord(candidate.gates)) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      'scoring_config.gates must be an object',
    );
  }
  const gates = candidate.gates as Record<string, unknown>;
  checkNumber(gates.minScore, 'gates.minScore', 0, 100);
  checkNumber(gates.maxRiskWeight, 'gates.maxRiskWeight', 0, 100);
  checkNumber(gates.minCompleteness, 'gates.minCompleteness', 0, 1);
  checkStringArray(
    gates.blockedClassifications,
    'gates.blockedClassifications',
  );
  if (typeof gates.enableBlacklist !== 'boolean') {
    throw new DomainError(
      ErrorCode.VALIDATION,
      'scoring_config.gates.enableBlacklist must be a boolean',
      { field: 'gates.enableBlacklist' },
    );
  }
  checkStringArray(gates.blacklistedAddresses, 'gates.blacklistedAddresses');
  checkNumber(gates.honeypotScoreBelow, 'gates.honeypotScoreBelow', 0, 100);
  checkNumber(gates.honeypotRiskAbove, 'gates.honeypotRiskAbove', 0, 100);
  checkStringArray(gates.publishableChains, 'gates.publishableChains');
}
