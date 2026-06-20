import type {
  CallEvaluationJob,
  JobStatusValue,
} from 'discovery/analytics/domain/entities/call-evaluation-job.entity';

export interface CallEvaluationJobView {
  readonly id: string;
  readonly channelId: string;
  readonly chain: string;
  readonly address: string;
  readonly horizon: string;
  readonly horizonHours: number;
  readonly callTimestamp: string;
  readonly scheduledAt: string;
  readonly completedAt: string | null;
  readonly mcAtCall: number | null;
  readonly status: JobStatusValue;
  readonly attempts: number;
  readonly lastError: string | null;
}

export class CallEvaluationJobMapper {
  public static toView(j: CallEvaluationJob): CallEvaluationJobView {
    return {
      id: j.id,
      channelId: j.channelId,
      chain: j.chain.value,
      address: j.address,
      horizon: j.horizon.value,
      horizonHours: j.horizon.hours(),
      callTimestamp: j.callTimestamp.toISOString(),
      scheduledAt: j.scheduledAt.toISOString(),
      completedAt: j.completedAt?.toISOString() ?? null,
      mcAtCall: j.mcAtCall,
      status: j.status,
      attempts: j.attempts,
      lastError: j.lastError,
    };
  }
}
