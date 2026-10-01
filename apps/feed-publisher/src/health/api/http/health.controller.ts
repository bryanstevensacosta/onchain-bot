import { Controller, Get } from '@nestjs/common';
import { Public } from 'shared/decorators/public.decorator';

/**
 * HealthController - static skeleton shape (Tramo 2, todo 1).
 *
 * GET /api/health -> { status: 'ok' }. Composite probes (ingestion,
 * database, queue, publishing) land with later todos — this stub
 * never claims them. P10: no kol references.
 *
 * Todo 14 (P50): the ONLY public route — every other controller rides
 * the global ApiKeyGuard.
 */
@Public()
@Controller('api/health')
export class HealthController {
  @Get()
  getHealth(): { status: string } {
    return { status: 'ok' };
  }
}
