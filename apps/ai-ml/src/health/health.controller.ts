import { Controller, Get } from '@nestjs/common';
import { Public } from 'shared/infrastructure/decorators/public.decorator';

/**
 * Health (ai-ml, todo 0): live `GET /api/health -> { status: 'ok' }`.
 * Public (no key) so orchestrators and Docker HEALTHCHECK can probe it.
 */
@Controller('api/health')
export class HealthController {
  @Get()
  @Public()
  public check(): { status: string } {
    return { status: 'ok' };
  }
}
