import { Controller, Get } from '@nestjs/common';

@Controller('api/health')
export class HealthController {
  @Get()
  public check(): { status: string; service: string } {
    return { status: 'ok', service: 'dexter-onchain-bot' };
  }
}
