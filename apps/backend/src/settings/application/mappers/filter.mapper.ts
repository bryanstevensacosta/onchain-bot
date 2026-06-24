import { SettingsFilterEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-filter.entity';
import { FilterConfig } from 'settings/domain/types/filter-config';

export const FilterMapper = {
  toDomain(entity: SettingsFilterEntity): FilterConfig {
    return {
      id: entity.id,
      type: entity.type,
      value: entity.value,
      numericValue: entity.numericValue,
      scope: entity.scope,
      enabled: entity.enabled,
      notes: entity.notes,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  },

  toEntity(config: Partial<FilterConfig>): SettingsFilterEntity {
    const e = new SettingsFilterEntity();
    if (config.id !== undefined) e.id = config.id;
    if (config.type !== undefined) e.type = config.type;
    if (config.value !== undefined) e.value = config.value;
    if (config.numericValue !== undefined) e.numericValue = config.numericValue;
    if (config.scope !== undefined) e.scope = config.scope;
    if (config.enabled !== undefined) e.enabled = config.enabled;
    if (config.notes !== undefined) e.notes = config.notes;
    return e;
  },
};
