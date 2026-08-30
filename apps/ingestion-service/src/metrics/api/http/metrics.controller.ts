import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from '../../metrics.service';

/**
 * MetricsController exposes Prometheus metrics endpoint
 * 
 * Per Requirement 9.5: Expose metrics at /metrics endpoint
 * 
 * Endpoint:
 * - GET /metrics - Returns Prometheus format metrics
 * 
 * @controller Handles /metrics route
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * Prometheus metrics endpoint
   * 
   * Per Requirement 9.5: Returns all collected metrics in Prometheus format
   * 
   * @returns Prometheus format metrics string
   */
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }
}
