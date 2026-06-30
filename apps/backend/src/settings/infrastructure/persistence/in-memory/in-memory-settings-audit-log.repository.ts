import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SettingsAuditLogEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-audit-log.entity';

type WherePredicate = (row: SettingsAuditLogEntity) => boolean;

class InMemoryQueryBuilder {
  private readonly predicates: WherePredicate[] = [];
  private orderDirection: 'ASC' | 'DESC' = 'ASC';
  private orderField: string | null = null;
  private limitValue = Infinity;

  public constructor(private readonly source: SettingsAuditLogEntity[]) {}

  public andWhere(field: string, _paramName: string, value: unknown): this {
    this.predicates.push((row) => this.matchField(row, field, value));
    return this;
  }

  public orderBy(field: string, direction: 'ASC' | 'DESC'): this {
    this.orderField = field;
    this.orderDirection = direction;
    return this;
  }

  public limit(value: number): this {
    this.limitValue = value;
    return this;
  }

  public async getMany(): Promise<SettingsAuditLogEntity[]> {
    let result = this.source.filter((row) =>
      this.predicates.every((p) => p(row)),
    );
    if (this.orderField) {
      const dir = this.orderDirection === 'DESC' ? -1 : 1;
      const field = this.orderField;
      result = [...result].sort((a, b) => {
        const av = (a as unknown as Record<string, unknown>)[field];
        const bv = (b as unknown as Record<string, unknown>)[field];
        if (av instanceof Date && bv instanceof Date) {
          return (av.getTime() - bv.getTime()) * dir;
        }
        if (av === bv) return 0;
        return ((av as number) > (bv as number) ? 1 : -1) * dir;
      });
    }
    return result.slice(0, this.limitValue);
  }

  private matchField(
    row: SettingsAuditLogEntity,
    field: string,
    value: unknown,
  ): boolean {
    const actual = (row as unknown as Record<string, unknown>)[field];
    if (value instanceof Date && actual instanceof Date) {
      return actual.getTime() >= value.getTime();
    }
    return actual === value;
  }
}

/**
 * In-memory replacement for the TypeORM Repository<SettingsAuditLogEntity>
 * used by AuditService when DATABASE_ENABLED=false.
 *
 * Implements the subset AuditService uses:
 *   - save(dto)
 *   - createQueryBuilder(alias) → chainable QueryBuilder with
 *     .andWhere(field, name, value), .orderBy(field, dir), .limit(n), .getMany()
 *
 * Mirrors the pattern of InMemorySettingsFilterRepository.
 */
@Injectable()
export class InMemorySettingsAuditLogRepository {
  private readonly store: SettingsAuditLogEntity[] = [];

  public async save(
    dto: Partial<SettingsAuditLogEntity>,
  ): Promise<SettingsAuditLogEntity> {
    const entity = new SettingsAuditLogEntity();
    entity.id = dto.id ?? randomUUID();
    entity.entityType = dto.entityType ?? 'signal';
    entity.entityId = dto.entityId ?? '';
    entity.action = dto.action ?? 'CREATE';
    entity.before = dto.before ?? null;
    entity.after = dto.after ?? null;
    entity.sourceIp = dto.sourceIp ?? null;
    entity.createdAt = dto.createdAt ?? new Date();
    this.store.push(entity);
    return entity;
  }

  public createQueryBuilder(_alias: string): InMemoryQueryBuilder {
    return new InMemoryQueryBuilder(this.store);
  }
}
