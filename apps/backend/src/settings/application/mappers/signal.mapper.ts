import { SignalEntity } from 'settings/infrastructure/persistence/typeorm/entities/signal.entity';
import { SignalConfig } from 'settings/domain/types/signal-config';

export const SignalMapper = {
  toDomain(entity: SignalEntity): SignalConfig {
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      penalty: entity.penalty,
      riskLevel: entity.riskLevel,
      enabled: entity.enabled,
      appliesTo: entity.appliesTo,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  },

  toEntity(config: Partial<SignalConfig>): SignalEntity {
    const e = new SignalEntity();
    if (config.id !== undefined) e.id = config.id;
    if (config.code !== undefined) e.code = config.code;
    if (config.name !== undefined) e.name = config.name;
    if (config.penalty !== undefined) e.penalty = config.penalty;
    if (config.riskLevel !== undefined) e.riskLevel = config.riskLevel;
    if (config.enabled !== undefined) e.enabled = config.enabled;
    if (config.appliesTo !== undefined) e.appliesTo = config.appliesTo;
    return e;
  },
};
