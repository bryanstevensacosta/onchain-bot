import { NormalizedAddress } from '../../../shared/value-objects/normalized-address.vo';

export interface ScoreGateConfig {
  readonly minScore: number;
  readonly maxRiskWeight: number;
  readonly minCompleteness: number;
  readonly blockedClassifications: ReadonlyArray<string>;
  readonly enableBlacklist: boolean;
  readonly blacklistedAddresses: ReadonlyArray<string>;
  readonly honeypotScoreBelow: number;
  readonly honeypotRiskAbove: number;
  readonly publishableChains: ReadonlyArray<string>;
}

/**
 * Hardcoded v1 gate defaults (Tramo 1, todo 9).
 *
 * Backend mirror (`ApplyVipCallApprovalUseCase` read-only): same 8 gates,
 * same semantics. Two deliberate deltas, both documented: (a) kol-system
 * chains are `evm|solana` (shared `ChainHint`) where the backend says
 * `ethereum|solana`; (b) the blacklist is an inline address list (no
 * blacklist BC here — the port becomes injectable when a source exists).
 * Settings-driven overrides land with the templates todo (per-call
 * `config` already supported, same as the backend `input.config`).
 */
export const DEFAULT_GATE_CONFIG: ScoreGateConfig = {
  minScore: 50,
  maxRiskWeight: 100,
  minCompleteness: 0,
  blockedClassifications: ['SCAM'],
  enableBlacklist: true,
  blacklistedAddresses: [],
  honeypotScoreBelow: 10,
  honeypotRiskAbove: 80,
  publishableChains: ['evm', 'solana'],
};

export interface GateReason {
  readonly code: string;
  readonly message: string;
}

export interface GateEvaluationInput {
  readonly chain: string;
  readonly address: string;
  readonly score: number;
  readonly classification: string;
  readonly riskWeight: number;
  readonly snapshotCompleteness: number;
  readonly config: ScoreGateConfig;
}

/**
 * 8 fail-fast gates, evaluated in order (backend gate mirror, G-08).
 *
 * 0. INVALID_ADDRESS — NormalizedAddress validation (defense in depth)
 * 1. SCORE_TOO_LOW — score < minScore
 * 2. CLASSIFICATION_BLOCKED — classification in blockedClassifications
 * 3. BLACKLISTED — address in blacklist (if enabled)
 * 4. HONEYPOT_SUSPECTED — score < honeypotScoreBelow with
 *    riskWeight >= honeypotRiskAbove (cheap heuristic over the rug-signal
 *    GROUP — never a single field; the real honeypot analysis is future)
 * 5. RISK_WEIGHT_EXCEEDED — riskWeight > maxRiskWeight
 * 6. INSUFFICIENT_DATA — completeness < minCompleteness
 * 7. CHAIN_UNSUPPORTED — chain not in publishable set
 *
 * Zero reasons = pass (persisted + event). Any reason = discarded
 * pre-publisher (adversarial: below-cut never reaches templates).
 */
export function evaluateScoreGates(input: GateEvaluationInput): GateReason[] {
  const reasons: GateReason[] = [];
  const config = input.config;

  try {
    if (input.chain === 'solana') {
      NormalizedAddress.fromSolana(input.address);
    } else {
      NormalizedAddress.fromEvm(input.address);
    }
  } catch {
    reasons.push({
      code: 'INVALID_ADDRESS',
      message: `Invalid ${input.chain} address: ${input.address}`,
    });
  }

  if (input.score < config.minScore) {
    reasons.push({
      code: 'SCORE_TOO_LOW',
      message: `Score ${input.score} < ${config.minScore} threshold`,
    });
  }

  if (config.blockedClassifications.includes(input.classification)) {
    reasons.push({
      code: 'CLASSIFICATION_BLOCKED',
      message: `Classification "${input.classification}" is blocked`,
    });
  }

  if (config.enableBlacklist) {
    const key = `${input.chain}:${input.address.toLowerCase()}`;
    const listed = config.blacklistedAddresses.some(
      (entry) => entry.toLowerCase() === key,
    );
    if (listed) {
      reasons.push({ code: 'BLACKLISTED', message: 'Address is blacklisted' });
    }
  }

  if (
    input.score < config.honeypotScoreBelow &&
    input.riskWeight >= config.honeypotRiskAbove
  ) {
    reasons.push({
      code: 'HONEYPOT_SUSPECTED',
      message: `Score ${input.score} + riskWeight ${input.riskWeight} suggest honeypot`,
    });
  }

  if (input.riskWeight > config.maxRiskWeight) {
    reasons.push({
      code: 'RISK_WEIGHT_EXCEEDED',
      message: `Risk weight ${input.riskWeight} > ${config.maxRiskWeight} max`,
    });
  }

  if (input.snapshotCompleteness < config.minCompleteness) {
    reasons.push({
      code: 'INSUFFICIENT_DATA',
      message: `Snapshot completeness ${input.snapshotCompleteness} < ${config.minCompleteness}`,
    });
  }

  if (
    config.publishableChains.length > 0 &&
    !config.publishableChains.includes(input.chain)
  ) {
    reasons.push({
      code: 'CHAIN_UNSUPPORTED',
      message: `Chain "${input.chain}" is not enabled for publishing`,
    });
  }

  return reasons;
}
