import { Controller, Get } from '@nestjs/common';
import { Public } from 'shared/decorators/public.decorator';

/**
 * HealthController - static skeleton shape (Tramo 3, todo 2).
 *
 * GET /api/health -> { status: 'ok' }. @Public(): skips the global
 * ApiKeyGuard. Composite probes (providers, database, cache) land with
 * later todos — this stub never claims them.
 */
@Public()
@Controller('api/health')
export class HealthController {
  @Get()
  getHealth(): { status: string } {
    return { status: 'ok' };
  }
}
