import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import { EvaluationHorizonVo } from 'discovery/analytics/domain/value-objects/evaluation-horizon.vo';

export type JobStatusValue = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface CallEvaluationJobInput {
  readonly channelId: string;
  readonly chain: ChainId;
  readonly address: string;
  readonly horizon: EvaluationHorizonVo;
  readonly callTimestamp: Date;
  readonly mcAtCall: number | null;
}

interface CallEvaluationJobProps {
  readonly channelId: string;
  readonly chain: ChainId;
  readonly address: string;
  readonly horizon: EvaluationHorizonVo;
  readonly callTimestamp: Date;
  readonly mcAtCall: number | null;
  readonly status: JobStatusValue;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly scheduledAt: Date;
  readonly completedAt: Date | null;
}

/**
 * A scheduled job that evaluates how a past token call performed
 * N hours after the call (24h, 7d, 30d).
 *
 * Lifecycle:
 *   PENDING → IN_PROGRESS → COMPLETED | FAILED
 *
 * Each call produces 3 jobs (one per horizon). On COMPLETED the
 * evaluator has written a CallPerformance record that contributes
 * to the channel's aggregated reputation stats.
 */
export class CallEvaluationJob extends AggregateRoot<string> {
  private readonly state: CallEvaluationJobProps;

  protected constructor(id: string, props: CallEvaluationJobProps) {
    super(id);
    this.state = props;
  }

  public static enqueue(input: CallEvaluationJobInput): CallEvaluationJob {
    if (!input.channelId) {
      throw new DomainError(ErrorCode.VALIDATION, `channelId cannot be empty`);
    }
    const scheduledAt = input.horizon.firesAt(input.callTimestamp);
    const id = CallEvaluationJob.buildId(input);
    return new CallEvaluationJob(id, {
      channelId: input.channelId,
      chain: input.chain,
      address: input.address.toLowerCase(),
      horizon: input.horizon,
      callTimestamp: input.callTimestamp,
      mcAtCall: input.mcAtCall,
      status: 'PENDING',
      attempts: 0,
      lastError: null,
      scheduledAt,
      completedAt: null,
    });
  }

  /**
   * Static id: `${channelId}:${chain}:${address}:${horizon}:${callTimestampMs}`
   * Ensures one job per (channel, token, horizon) — re-enqueueing the
   * same call does not duplicate.
   */
  public static buildId(input: {
    channelId: string;
    chain: ChainId;
    address: string;
    horizon: EvaluationHorizonVo;
    callTimestamp: Date;
  }): string {
    return [
      input.channelId.toLowerCase(),
      input.chain.value,
      input.address.toLowerCase(),
      input.horizon.value,
      input.callTimestamp.getTime().toString(),
    ].join(':');
  }

  public get channelId(): string {
    return this.state.channelId;
  }
  public get chain(): ChainId {
    return this.state.chain;
  }
  public get address(): string {
    return this.state.address;
  }
  public get horizon(): EvaluationHorizonVo {
    return this.state.horizon;
  }
  public get callTimestamp(): Date {
    return this.state.callTimestamp;
  }
  public get mcAtCall(): number | null {
    return this.state.mcAtCall;
  }
  public get status(): JobStatusValue {
    return this.state.status;
  }
  public get attempts(): number {
    return this.state.attempts;
  }
  public get lastError(): string | null {
    return this.state.lastError;
  }
  public get scheduledAt(): Date {
    return this.state.scheduledAt;
  }
  public get completedAt(): Date | null {
    return this.state.completedAt;
  }
  public get isDue(): boolean {
    return (
      this.state.status === 'PENDING' &&
      Date.now() >= this.state.scheduledAt.getTime()
    );
  }
  public get isTerminal(): boolean {
    return this.state.status === 'COMPLETED' || this.state.status === 'FAILED';
  }

  public markInProgress(): void {
    if (this.state.status !== 'PENDING') {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Cannot start job in status ${this.state.status}`,
      );
    }
    (this as unknown as { state: CallEvaluationJobProps }).state = {
      ...this.state,
      status: 'IN_PROGRESS',
      attempts: this.state.attempts + 1,
    };
  }

  public markCompleted(): void {
    (this as unknown as { state: CallEvaluationJobProps }).state = {
      ...this.state,
      status: 'COMPLETED',
      completedAt: new Date(),
      lastError: null,
    };
  }

  public markFailed(error: string): void {
    (this as unknown as { state: CallEvaluationJobProps }).state = {
      ...this.state,
      status: 'FAILED',
      completedAt: new Date(),
      lastError: error,
    };
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
