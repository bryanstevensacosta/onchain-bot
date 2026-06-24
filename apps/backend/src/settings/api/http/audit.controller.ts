import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from 'settings/application/services/audit.service';

@Controller('settings/audit')
export class AuditController {
  public constructor(private readonly audit: AuditService) {}

  @Get()
  public async list(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    return this.audit.query({
      entityType,
      entityId,
      since: since ? new Date(since) : undefined,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }
}
