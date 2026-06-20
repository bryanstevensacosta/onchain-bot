import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import { Classification } from 'ca/classification/domain/value-objects/classification.vo';
import {
  RiskSignal,
  Severity,
} from 'ca/classification/domain/value-objects/risk-signal.vo';
import { TokenClassifiedEvent } from 'ca/classification/domain/events/token-classified.event';

export interface ClassificationInput {
  readonly chain: ChainId;
  readonly address: string;
  readonly classification: Classification;
  readonly signals: ReadonlyArray<RiskSignal>;
  readonly snapshotCompleteness: number;
}

interface TokenClassificationProps {
  readonly chain: ChainId;
  readonly address: string;
  readonly classification: Classification;
  readonly signals: ReadonlyArray<RiskSignal>;
  readonly snapshotCompleteness: number;
  readonly confidence: number;
  readonly classifiedAt: Date;
}

/**
 * Classification result for a token.
 *
 * Idempotent: same `(chain, address)` → same id (overwrites on re-classify).
 * Re-classification happens when the underlying snapshot changes meaningfully.
 */
export class TokenClassification extends AggregateRoot<string> {
  private readonly state: TokenClassificationProps;

  protected constructor(id: string, props: TokenClassificationProps) {
    super(id);
    this.state = props;
  }

  public static create(input: ClassificationInput): TokenClassification {
    if (!input.address) {
      throw new DomainError(ErrorCode.VALIDATION, `address cannot be empty`);
    }
    if (input.snapshotCompleteness < 0 || input.snapshotCompleteness > 1) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `snapshotCompleteness must be 0..1, got ${input.snapshotCompleteness}`,
      );
    }
    const id = `${input.chain.value}:${input.address.toLowerCase()}`;
    const confidence = computeConfidence(
      input.classification,
      input.signals,
      input.snapshotCompleteness,
    );

    return new TokenClassification(id, {
      chain: input.chain,
      address: input.address.toLowerCase(),
      classification: input.classification,
      signals: Object.freeze([...input.signals]),
      snapshotCompleteness: input.snapshotCompleteness,
      confidence,
      classifiedAt: new Date(),
    });
  }

  public get chain(): ChainId {
    return this.state.chain;
  }
  public get address(): string {
    return this.state.address;
  }
  public get classification(): Classification {
    return this.state.classification;
  }
  public get signals(): ReadonlyArray<RiskSignal> {
    return this.state.signals;
  }
  public get snapshotCompleteness(): number {
    return this.state.snapshotCompleteness;
  }
  public get confidence(): number {
    return this.state.confidence;
  }
  public get classifiedAt(): Date {
    return this.state.classifiedAt;
  }

  public hasSignal(type: RiskSignal['type']): boolean {
    return this.state.signals.some((s) => s.type === type);
  }

  public highestSeverity(): Severity | null {
    const order: Record<Severity, number> = {
      LOW: 0,
      MEDIUM: 1,
      HIGH: 2,
      CRITICAL: 3,
    };
    let highest: Severity | null = null;
    for (const s of this.state.signals) {
      if (highest === null || order[s.severity] > order[highest]) {
        highest = s.severity;
      }
    }
    return highest;
  }

  public riskWeight(): number {
    return this.state.signals.reduce((sum, s) => sum + s.weight(), 0);
  }

  public emitClassified(): void {
    this.apply(
      new TokenClassifiedEvent({
        chain: this.state.chain.value,
        address: this.state.address,
        classification: this.state.classification.value,
        confidence: this.state.confidence,
        signals: this.state.signals.map((s) => ({
          type: s.type,
          severity: s.severity,
          description: s.description,
        })),
        riskWeight: this.riskWeight(),
        snapshotCompleteness: this.state.snapshotCompleteness,
        classifiedAt: this.state.classifiedAt,
      }),
    );
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}

/**
 * Confidence calculation:
 * - Base: depends on classification type
 * - Bonus: higher snapshotCompleteness = more confident
 * - Penalty: high-severity signals reduce confidence
 */
function computeConfidence(
  classification: Classification,
  signals: ReadonlyArray<RiskSignal>,
  completeness: number,
): number {
  let base: number;
  switch (classification.value) {
    case 'TOKEN':
      base = 0.7;
      break;
    case 'POOL':
    case 'ROUTER':
    case 'NFT':
      base = 0.5;
      break;
    case 'SCAM':
      base = 0.6;
      break;
    case 'UNKNOWN':
      base = 0.4;
      break;
  }

  const completenessBonus = completeness * 0.2;
  const riskPenalty = Math.min(
    0.4,
    signals.reduce((sum, s) => sum + s.weight() / 100, 0),
  );

  return Math.max(
    0,
    Math.min(
      1,
      Math.round((base + completenessBonus - riskPenalty) * 100) / 100,
    ),
  );
}
