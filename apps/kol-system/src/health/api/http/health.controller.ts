import { Controller, Get } from '@nestjs/common';

/**
 * HealthController - skeleton health endpoint (Tramo 1, todo 2).
 *
 * Static shape only: GET /api/health -> 200 + { status: 'ok' }.
 * NO business logic, NO DB/Redis probes (deep health is a later tramo).
 */
@Controller('api/health')
export class HealthController {
  @Get()
  getHealth(): { status: string } {
    return { status: 'ok' };
  }
}
