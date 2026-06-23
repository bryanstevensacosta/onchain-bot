import { CallEvaluationJob } from 'token/call-tracking/domain/entities/call-evaluation-job.entity';
import { ChainId } from 'chain/identity/chain-id.vo';
import { EvaluationHorizonVo } from 'token/call-tracking/domain/value-objects/evaluation-horizon.vo';
import { CallEvaluationJobEntity } from 'token/call-tracking/infrastructure/persistence/typeorm/entities/call-evaluation-job.entity';

export class CallEvaluationJobMapper {
  public static toRow(j: CallEvaluationJob): CallEvaluationJobEntity {
    const row = new CallEvaluationJobEntity();
    row.id = j.id;
    row.kolId = j.kolId;
    row.chain = j.chain.value;
    row.address = j.address;
    row.horizon = j.horizon.value;
    row.status = j.status;
    row.attempts = j.attempts;
    row.lastError = j.lastError;
    row.callTimestamp = j.callTimestamp;
    row.mcAtCall = j.mcAtCall !== null ? String(j.mcAtCall) : null;
    row.scheduledAt = j.scheduledAt;
    row.completedAt = j.completedAt;
    return row;
  }

  public static toDomain(row: CallEvaluationJobEntity): CallEvaluationJob {
    return CallEvaluationJob.rehydrate({
      id: row.id,
      kolId: row.kolId,
      chain: ChainId.fromString(row.chain),
      address: row.address,
      horizon: EvaluationHorizonVo.fromString(row.horizon),
      callTimestamp: row.callTimestamp,
      mcAtCall: row.mcAtCall !== null ? Number(row.mcAtCall) : null,
      status: row.status as never,
      attempts: row.attempts,
      lastError: row.lastError,
      scheduledAt: row.scheduledAt,
      completedAt: row.completedAt,
    });
  }
}
