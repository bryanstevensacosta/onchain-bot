import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { ChainId } from 'chain/identity/chain-id.vo';
import { ChainDetectionScore } from 'chain/detection/domain/value-objects/chain-detection-score.vo';
import { ChainDetectedEvent } from 'chain/detection/domain/events/chain-detected.event';

interface ChainDetectionResultProps {
  readonly address: string;
  readonly resolvedChain: ChainId;
  readonly confidence: number;
  readonly scores: ReadonlyArray<ChainDetectionScore>;
  readonly isContract: boolean | null;
  readonly detectedAt: Date;
}

/**
 * Result of probing a single address against multiple chain RPCs.
 *
 * Idempotent: same address → same id (so cache works).
 * Aggregate root owns the resolution decision (winner of the score race).
 */
export class ChainDetectionResult extends AggregateRoot<string> {
  private readonly state: ChainDetectionResultProps;

  protected constructor(id: string, props: ChainDetectionResultProps) {
    super(id);
    this.state = props;
  }

  public static create(input: {
    address: string;
    scores: ReadonlyArray<ChainDetectionScore>;
    isContract: boolean | null;
  }): ChainDetectionResult {
    if (!input.address) {
      throw new DomainError(ErrorCode.VALIDATION, `address cannot be empty`);
    }
    if (input.scores.length === 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Cannot build result from empty scores`,
      );
    }

    const id = input.address.toLowerCase();
    const winner = pickWinner(input.scores);
    const confidence = computeConfidence(input.scores, winner);

    return new ChainDetectionResult(id, {
      address: id,
      resolvedChain: winner.chain,
      confidence,
      scores: Object.freeze([...input.scores]),
      isContract: input.isContract,
      detectedAt: new Date(),
    });
  }

  /**
   * Reconstruct an aggregate from persistence. Bypasses winner picking
   * and confidence computation.
   */
  public static rehydrate(input: {
    id: string;
    address: string;
    resolvedChain: ChainId;
    confidence: number;
    scores: ReadonlyArray<ChainDetectionScore>;
    isContract: boolean | null;
    detectedAt: Date;
  }): ChainDetectionResult {
    return new ChainDetectionResult(input.id, {
      address: input.address,
      resolvedChain: input.resolvedChain,
      confidence: input.confidence,
      scores: input.scores,
      isContract: input.isContract,
      detectedAt: input.detectedAt,
    });
  }

  public get address(): string {
    return this.state.address;
  }
  public get resolvedChain(): ChainId {
    return this.state.resolvedChain;
  }
  public get confidence(): number {
    return this.state.confidence;
  }
  public get scores(): ReadonlyArray<ChainDetectionScore> {
    return this.state.scores;
  }
  public get isContract(): boolean | null {
    return this.state.isContract;
  }
  public get detectedAt(): Date {
    return this.state.detectedAt;
  }

  public emitDetected(): void {
    this.apply(
      new ChainDetectedEvent({
        address: this.state.address,
        resolvedChain: this.state.resolvedChain.value,
        confidence: this.state.confidence,
        isContract: this.state.isContract,
        scores: this.state.scores.map((s) => ({
          chain: s.chain.value,
          points: s.points,
          reasons: [...s.reasons],
        })),
        detectedAt: this.state.detectedAt,
      }),
    );
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}

function pickWinner(
  scores: ReadonlyArray<ChainDetectionScore>,
): ChainDetectionScore {
  let winner = scores[0];
  for (let i = 1; i < scores.length; i++) {
    const current = scores[i];
    if (current.points > winner.points) {
      winner = current;
    }
  }
  return winner;
}

function computeConfidence(
  scores: ReadonlyArray<ChainDetectionScore>,
  winner: ChainDetectionScore,
): number {
  if (scores.length === 1) {
    return Math.min(1, Math.round(winner.points) / 100);
  }
  const others = scores.filter((s) => s !== winner).map((s) => s.points);
  const maxOther = Math.max(0, ...others);
  const margin = winner.points - maxOther;
  const ratio = winner.points / 100;
  const marginFactor = margin / 100;
  return Math.min(
    1,
    Math.round((ratio * 0.7 + marginFactor * 0.3) * 100) / 100,
  );
}
