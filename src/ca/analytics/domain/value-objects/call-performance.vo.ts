import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { Outcome } from 'ca/analytics/domain/value-objects/outcome.vo';

interface CallPerformanceProps {
  readonly channelId: string;
  readonly tokenId: string; // chain:address
  readonly outcome: Outcome;
  readonly mcAtCall: number | null;
  readonly athMultiple: number | null; // ATH / MC at call (e.g. 5.2 = 5.2x)
  readonly callTimestamp: Date;
  readonly evaluatedAt: Date;
}

/**
 * Performance record for one token call made by one channel.
 *
 * Generated asynchronously by the AnalyticsWorker (background job) once
 * enough time has passed since the call (e.g., 24h, 7d).
 */
export class CallPerformance extends ValueObject<CallPerformanceProps> {
  protected constructor(props: CallPerformanceProps) {
    super(props);
  }

  public static create(input: {
    channelId: string;
    tokenId: string;
    outcome: Outcome;
    mcAtCall: number | null;
    athMultiple: number | null;
    callTimestamp: Date;
    evaluatedAt?: Date;
  }): CallPerformance {
    if (!input.channelId) {
      throw new DomainError(ErrorCode.VALIDATION, `channelId cannot be empty`);
    }
    if (!input.tokenId) {
      throw new DomainError(ErrorCode.VALIDATION, `tokenId cannot be empty`);
    }
    if (input.athMultiple !== null && input.athMultiple < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `athMultiple cannot be negative: ${input.athMultiple}`,
      );
    }
    return new CallPerformance({
      ...input,
      evaluatedAt: input.evaluatedAt ?? new Date(),
    });
  }

  public get channelId(): string {
    return this.props.channelId;
  }
  public get tokenId(): string {
    return this.props.tokenId;
  }
  public get outcome(): Outcome {
    return this.props.outcome;
  }
  public get mcAtCall(): number | null {
    return this.props.mcAtCall;
  }
  public get athMultiple(): number | null {
    return this.props.athMultiple;
  }
  public get callTimestamp(): Date {
    return this.props.callTimestamp;
  }
  public get evaluatedAt(): Date {
    return this.props.evaluatedAt;
  }

  public isSuccessful(): boolean {
    return (
      this.props.outcome.value === 'STRONG' ||
      this.props.outcome.value === 'GOOD'
    );
  }
}
