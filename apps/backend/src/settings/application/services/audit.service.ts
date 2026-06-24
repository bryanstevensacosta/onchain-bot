import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SettingsAuditLogEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-audit-log.entity';

export interface AuditLogInput {
  entityType: 'signal' | 'threshold' | 'filter';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  sourceIp: string | null;
}

@Injectable()
export class AuditService {
  public constructor(
    @InjectRepository(SettingsAuditLogEntity)
    private readonly repo: Repository<SettingsAuditLogEntity>,
  ) {}

  async log(input: AuditLogInput): Promise<void> {
    await this.repo.save({
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      before: input.before,
      after: input.after,
      sourceIp: input.sourceIp,
    });
  }

  async query(filter: {
    entityType?: string;
    entityId?: string;
    since?: Date;
    limit?: number;
  }): Promise<SettingsAuditLogEntity[]> {
    const limit = filter.limit ?? 50;
    const qb = this.repo.createQueryBuilder('audit');
    if (filter.entityType) {
      qb.andWhere('audit.entityType = :t', { t: filter.entityType });
    }
    if (filter.entityId) {
      qb.andWhere('audit.entityId = :i', { i: filter.entityId });
    }
    if (filter.since) {
      qb.andWhere('audit.createdAt >= :s', { s: filter.since });
    }
    qb.orderBy('audit.createdAt', 'DESC').limit(limit);
    return qb.getMany();
  }
}
