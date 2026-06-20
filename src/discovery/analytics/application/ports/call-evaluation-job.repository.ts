import { CallEvaluationJob } from 'discovery/analytics/domain/entities/call-evaluation-job.entity';

export abstract class CallEvaluationJobRepository {
  public abstract save(job: CallEvaluationJob): Promise<void>;
  public abstract findById(id: string): Promise<CallEvaluationJob | null>;
  public abstract findDue(
    now: Date,
    limit: number,
  ): Promise<ReadonlyArray<CallEvaluationJob>>;
  public abstract findPendingForCall(
    channelId: string,
    chain: string,
    address: string,
    callTimestamp: Date,
  ): Promise<ReadonlyArray<CallEvaluationJob>>;
  public abstract count(): Promise<number>;
}
