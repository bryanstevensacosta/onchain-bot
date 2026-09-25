import type { CallApproval } from '../../domain/entities/call-approval.entity';

/**
 * Persistence port for per-template approvals (same kol-system DB;
 * in-memory today — TypeORM entity + migration land with the persistence
 * todo). Upsert by id (`templateId:mentionId`) = double-delivery guard (P1).
 */
export abstract class CallApprovalRepository {
  public abstract save(approval: CallApproval): Promise<void>;
  public abstract findById(id: string): Promise<CallApproval | null>;
  public abstract findPendingByTemplate(
    templateId: string,
    limit: number,
  ): Promise<CallApproval[]>;
  public abstract findPendingAll(limit: number): Promise<CallApproval[]>;
  public abstract count(): Promise<number>;
}
