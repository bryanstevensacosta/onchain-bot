import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { SignalEntity } from 'settings/infrastructure/persistence/typeorm/entities/signal.entity';
import { ScoringThresholdEntity } from 'settings/infrastructure/persistence/typeorm/entities/scoring-threshold.entity';
import { SettingsFilterEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-filter.entity';
import { SettingsAuditLogEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-audit-log.entity';
import { SettingsPresetEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-preset.entity';
import { SettingsService } from 'settings/application/services/settings.service';
import { AuditService } from 'settings/application/services/audit.service';
import { SignalsController } from 'settings/api/http/signals.controller';
import { ThresholdsController } from 'settings/api/http/thresholds.controller';
import { FiltersController } from 'settings/api/http/filters.controller';
import { AuditController } from 'settings/api/http/audit.controller';

@Module({
  imports: [
    ...(isDatabaseEnabled()
      ? [
          TypeOrmModule.forFeature([
            SignalEntity,
            ScoringThresholdEntity,
            SettingsFilterEntity,
            SettingsAuditLogEntity,
            SettingsPresetEntity,
          ]),
        ]
      : []),
  ],
  controllers: [
    SignalsController,
    ThresholdsController,
    FiltersController,
    AuditController,
  ],
  providers: [SettingsService, AuditService],
  exports: [SettingsService, AuditService],
})
export class SettingsModule {}
