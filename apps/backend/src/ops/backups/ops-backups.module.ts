import { Module } from '@nestjs/common';
import { OpsBackupsController } from './api/http/ops-backups.controller';
import {
  BACKUP_STATUS_PATH,
  BackupsStatusService,
  DEFAULT_BACKUP_STATUS_PATH,
} from './application/backups-status.service';

@Module({
  controllers: [OpsBackupsController],
  providers: [
    BackupsStatusService,
    {
      provide: BACKUP_STATUS_PATH,
      useValue: process.env.BACKUP_STATUS_PATH ?? DEFAULT_BACKUP_STATUS_PATH,
    },
  ],
  exports: [BackupsStatusService],
})
export class OpsBackupsModule {}
