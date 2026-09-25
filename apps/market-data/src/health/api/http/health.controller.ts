import { Controller, Get } from '@nestjs/common';

/**
 * HealthController - static skeleton shape (Tramo 3, todo 1).
 *
 * GET /api/health -> { status: 'ok' }. Composite probes (providers,
 * database, cache) land with later todos — this stub never claims them.
 */
@Controller('api/health')
export class HealthController {
  @Get()
  getHealth(): { status: string } {
    return { status: 'ok' };
  }
}
