import { Injectable } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import { Classification } from 'token/classification/domain/value-objects/classification.vo';
import { SecurityFlag } from 'token/honeypot/domain/value-objects/security-flag.vo';
import { RiskSignal } from 'token/classification/domain/value-objects/risk-signal.vo';
import { TokenClassification } from 'token/classification/domain/entities/token-classification.entity';
import { TokenClassificationRepository } from 'token/classification/application/ports/token-classification.repository';
import { ClassificationEventPublisher } from 'token/classification/application/ports/classification-event.publisher';
import {
  TokenClassificationMapper,
  TokenClassificationView,
} from 'token/classification/application/mappers/token-classification.mapper';

export interface SnapshotSignals {
  readonly chain: string;
  readonly address: string;
  readonly hasPairs: boolean;
  readonly pairCount: number;
  readonly liquidityUsd: number | null;
  readonly marketCapUsd: number | null;
  readonly priceChange24h: number | null;
  readonly holders: number | null;
  readonly top10HolderPercent: number | null;
  readonly hasName: boolean;
  readonly hasTicker: boolean;
  readonly completeness: number;
}

/**
 * Use case: classify a token based on its enrichment snapshot.
 *
 * Heuristic rules (v1):
 * - Has any pairs + (holders OR liquidity) → TOKEN
 * - 0 pairs AND 0 holders AND completeness < 0.3 → UNKNOWN
 * - Liquidity < $100 AND no holders AND no name → SCAM (heuristic)
 * - Otherwise → TOKEN with risk signals
 *
 * Risk signals emitted:
 * - LOW_LIQUIDITY (HIGH/MEDIUM): liq below thresholds
 * - NO_HOLDERS (HIGH): holders == 0 or null
 * - CONCENTRATED_HOLDERS (HIGH): top10 > 80%
 * - EXTREME_PRICE_CHANGE (HIGH): |change| > 500%
 * - MICROCAP (HIGH): mc < $1000
 * - NO_NAME (LOW): no ticker AND no name
 * - POSSIBLE_RUG (CRITICAL): liq < $100 + 0 holders
 */
@Injectable()
export class ClassifyTokenUseCase {
  public constructor(
    private readonly classificationRepo: TokenClassificationRepository,
    private readonly eventPublisher: ClassificationEventPublisher,
  ) {}

  public async execute(
    input: SnapshotSignals,
  ): Promise<TokenClassificationView> {
    const chain = ChainId.fromString(input.chain);
    const { classification, securityFlag, signals } = this.classify(input);

    const result = TokenClassification.create({
      chain,
      address: input.address,
      classification,
      securityFlag,
      signals,
      snapshotCompleteness: input.completeness,
    });

    await this.classificationRepo.save(result);
    result.emitClassified();
    await this.eventPublisher.publishAll(result.commit());

    return TokenClassificationMapper.toView(result);
  }

  private classify(input: SnapshotSignals): {
    classification: Classification;
    securityFlag: SecurityFlag;
    signals: RiskSignal[];
  } {
    const signals: RiskSignal[] = [];

    if (
      input.liquidityUsd !== null &&
      input.liquidityUsd < 1000 &&
      input.holders !== null &&
      input.holders < 10
    ) {
      signals.push(
        RiskSignal.create({
          type: 'POSSIBLE_RUG',
          severity: 'CRITICAL',
          description: `Liquidity $${input.liquidityUsd} < $100 AND ${input.holders} holders — likely rug`,
        }),
      );
    }

    if (input.liquidityUsd !== null) {
      if (input.liquidityUsd < 1000) {
        signals.push(
          RiskSignal.create({
            type: 'LOW_LIQUIDITY',
            severity: 'HIGH',
            description: `Liquidity $${input.liquidityUsd} < $1,000`,
          }),
        );
      } else if (input.liquidityUsd < 5000) {
        signals.push(
          RiskSignal.create({
            type: 'LOW_LIQUIDITY',
            severity: 'MEDIUM',
            description: `Liquidity $${input.liquidityUsd} < $5,000`,
          }),
        );
      }
    }

    if (input.holders === null || input.holders === 0) {
      signals.push(
        RiskSignal.create({
          type: 'NO_HOLDERS',
          severity: 'HIGH',
          description:
            input.holders === null
              ? 'No holders data available'
              : '0 holders reported',
        }),
      );
    } else if (input.holders < 50) {
      signals.push(
        RiskSignal.create({
          type: 'LOW_HOLDERS',
          severity: 'MEDIUM',
          description: `Only ${input.holders} holders (< 50)`,
        }),
      );
    }

    if (input.top10HolderPercent !== null && input.top10HolderPercent > 80) {
      signals.push(
        RiskSignal.create({
          type: 'CONCENTRATED_HOLDERS',
          severity: 'HIGH',
          description: `Top 10 holders own ${input.top10HolderPercent.toFixed(1)}% (> 80%)`,
        }),
      );
    }

    if (input.priceChange24h !== null && Math.abs(input.priceChange24h) > 500) {
      signals.push(
        RiskSignal.create({
          type: 'EXTREME_PRICE_CHANGE',
          severity: 'HIGH',
          description: `24h price change ${input.priceChange24h.toFixed(1)}% (extreme)`,
        }),
      );
    }

    if (input.marketCapUsd !== null && input.marketCapUsd < 1000) {
      signals.push(
        RiskSignal.create({
          type: 'MICROCAP',
          severity: 'HIGH',
          description: `Market cap $${input.marketCapUsd} < $1,000`,
        }),
      );
    }

    if (!input.hasName && !input.hasTicker) {
      signals.push(
        RiskSignal.create({
          type: 'NO_NAME',
          severity: 'LOW',
          description: 'No ticker or name identified',
        }),
      );
    }

    let classification: Classification;
    let securityFlag: SecurityFlag;
    const isPossibleRug = signals.some((s) => s.type === 'POSSIBLE_RUG');
    const isUnknown =
      !input.hasPairs &&
      (input.holders === null || input.holders === 0) &&
      input.completeness < 0.3;
    const hasCriticalSignals = signals.some(
      (s) => s.severity === 'CRITICAL' || s.severity === 'HIGH',
    );

    if (isUnknown) {
      classification = Classification.UNKNOWN;
      securityFlag = SecurityFlag.UNKNOWN;
      signals.push(
        RiskSignal.create({
          type: 'NO_MARKET_DATA',
          severity: 'MEDIUM',
          description: 'No pairs, no holders, low data completeness',
        }),
      );
    } else {
      classification = Classification.TOKEN;
      if (isPossibleRug) {
        securityFlag = SecurityFlag.SCAM;
      } else if (hasCriticalSignals) {
        securityFlag = SecurityFlag.SUSPICIOUS;
      } else {
        securityFlag = SecurityFlag.LEGITIMATE;
      }
    }

    return { classification, securityFlag, signals };
  }
}
