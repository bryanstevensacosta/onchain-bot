import { Controller, Get } from '@nestjs/common';

export interface HealthResponse {
  readonly status: 'ok' | 'degraded' | 'down';
  readonly uptime: number;
  readonly timestamp: string;
  readonly service: string;
  readonly version: string;
}

@Controller('api')
export class HealthController {
  private readonly startTime = Date.now();

  @Get('health')
  public getHealth(): HealthResponse {
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      service: 'alpha-meta-token-scanner',
      version: process.env.npm_package_version ?? '0.0.0',
    };
  }
}
