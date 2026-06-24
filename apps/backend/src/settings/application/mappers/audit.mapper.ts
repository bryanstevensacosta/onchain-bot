import { SettingsAuditLogEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-audit-log.entity';
import { AuditEntry } from 'settings/domain/types/audit-entry';

export const AuditMapper = {
  toDomain(entity: SettingsAuditLogEntity): AuditEntry {
    return {
      id: entity.id,
      entityType: entity.entityType,
      entityId: entity.entityId,
      action: entity.action,
      before: entity.before,
      after: entity.after,
      sourceIp: entity.sourceIp,
      createdAt: entity.createdAt,
    };
  },
};
