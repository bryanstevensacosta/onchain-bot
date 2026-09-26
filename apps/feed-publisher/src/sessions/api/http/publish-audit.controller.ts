import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  PublishAuditLog,
  type PublishAuditEntry,
} from '../../application/services/publish-audit-log.service';

/**
 * Publish audit reads (`/api/publish-audit`, todo 14, P50).
 *
 * Read-only view of every explicit publish attempt (published /
 * blocked / rate-limited). Entries carry routing facts only — tokens
 * and ciphertext never enter this log (spec-pinned).
 */
@ApiTags('feed-publisher-publish-audit')
@Controller('api/publish-audit')
export class PublishAuditController {
  public constructor(private readonly audit: PublishAuditLog) {}

  @Get()
  @ApiOperation({ summary: 'List publish audit entries (no tokens)' })
  @ApiResponse({ status: 200, description: 'Audit entries' })
  public async list(): Promise<ReadonlyArray<PublishAuditEntry>> {
    return this.audit.list();
  }
}
