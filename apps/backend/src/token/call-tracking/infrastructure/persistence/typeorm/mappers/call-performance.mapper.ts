import { CallPerformance } from 'token/call-tracking/domain/value-objects/call-performance.vo';
import { Outcome } from 'token/call-tracking/domain/value-objects/outcome.vo';
import { CallPerformanceEntity } from 'token/call-tracking/infrastructure/persistence/typeorm/entities/call-performance.entity';

export class CallPerformanceMapper {
  public static toRow(p: CallPerformance): CallPerformanceEntity {
    const row = new CallPerformanceEntity();
    row.kolId = p.kolId;
    row.tokenId = p.tokenId;
    row.outcome = p.outcome.value;
    row.mcAtCall = p.mcAtCall !== null ? String(p.mcAtCall) : null;
    row.athMultiple = p.athMultiple;
    row.callTimestamp = p.callTimestamp;
    row.evaluatedAt = p.evaluatedAt;
    return row;
  }

  public static toDomain(row: CallPerformanceEntity): CallPerformance {
    return CallPerformance.create({
      kolId: row.kolId,
      tokenId: row.tokenId,
      outcome: Outcome.fromString(row.outcome),
      mcAtCall: row.mcAtCall !== null ? Number(row.mcAtCall) : null,
      athMultiple: row.athMultiple,
      callTimestamp: row.callTimestamp,
      evaluatedAt: row.evaluatedAt,
    });
  }
}
