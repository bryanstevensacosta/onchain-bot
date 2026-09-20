import { Controller, Get } from '@nestjs/common';
import {
  BackupsStatusService,
  type BackupConfigView,
  type BackupStatusView,
} from '../../application/backups-status.service';

/**
 * Read-only ops view of the prod-backend rolling backups (unguarded public
 * GETs — same precedent as the vip-calls read endpoints; do NOT add guards).
 *
 * Endpoints (under `/ops/backups`):
 *  - GET /status   Live verdict served from the drill-generated
 *                  `.rolling-status.json` (derived status, not domain state —
 *                  no TypeORM entity/migration/event-bus here, and do NOT
 *                  extend the health controller).
 *  - GET /config   Non-secret read config (thresholds + file path).
 *
 * Field names are frozen — the frontend mirrors BackupStatusView verbatim.
 * Staging has no backups by design: without the prod bind mount the file is
 * absent and /status returns the red missing shape (never 500).
 */
@Controller('ops/backups')
export class OpsBackupsController {
  public constructor(private readonly status: BackupsStatusService) {}

  @Get('status')
  public async getStatus(): Promise<BackupStatusView> {
    return this.status.getStatus();
  }

  @Get('config')
  public async getConfig(): Promise<BackupConfigView> {
    return this.status.getConfig();
  }
}
