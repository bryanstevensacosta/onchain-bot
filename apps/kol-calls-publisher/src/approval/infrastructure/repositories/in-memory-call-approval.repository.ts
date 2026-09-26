import { Injectable } from '@nestjs/common';
import { CallApprovalRepository } from '../../application/ports/call-approval.repository';
import type { CallApproval } from '../../domain/entities/call-approval.entity';

/**
 * In-memory approval store (upsert by id = double-delivery guard, P1).
 */
@Injectable()
export class InMemoryCallApprovalRepository extends CallApprovalRepository {
  private readonly rows = new Map<string, CallApproval>();

  public async save(approval: CallApproval): Promise<void> {
    this.rows.set(approval.id, approval);
  }

  public async findById(id: string): Promise<CallApproval | null> {
    return this.rows.get(id) ?? null;
  }

  public async findPendingByTemplate(
    templateId: string,
    limit: number,
  ): Promise<CallApproval[]> {
    return [...this.rows.values()]
      .filter((a) => a.templateId === templateId && a.status === 'pending')
      .sort((a, b) => b.createdAtDate.getTime() - a.createdAtDate.getTime())
      .slice(0, limit);
  }

  public async findPendingAll(limit: number): Promise<CallApproval[]> {
    return [...this.rows.values()]
      .filter((a) => a.status === 'pending')
      .sort((a, b) => b.createdAtDate.getTime() - a.createdAtDate.getTime())
      .slice(0, limit);
  }

  public async count(): Promise<number> {
    return this.rows.size;
  }
}
