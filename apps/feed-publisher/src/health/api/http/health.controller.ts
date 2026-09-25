import { Controller, Get } from '@nestjs/common';

/**
 * HealthController - static skeleton shape (Tramo 2, todo 1).
 *
 * GET /api/health -> { status: 'ok' }. Composite probes (ingestion,
 * database, queue, publishing) land with later todos — this stub
 * never claims them. P10: no kol references.
 */
@Controller('api/health')
export class HealthController {
  @Get()
  getHealth(): { status: string } {
    return { status: 'ok' };
  }
}
