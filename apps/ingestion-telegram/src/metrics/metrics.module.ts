import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { Registry } from 'prom-client';
import { MetricsService } from './metrics.service';
import { MetricsController } from './api/http/metrics.controller';

/**
 * MetricsModule provides Prometheus metrics collection and exposure
 *
 * Per Requirement 9.5: Expose metrics at /metrics endpoint for monitoring
 * Per Requirement 11.7: Track FLOOD_WAIT occurrences
 *
 * Metrics exposed:
 * - ingestion_mtproto_connected (gauge)
 * - ingestion_messages_received_total (counter, labels: channelId, type)
 * - ingestion_messages_broadcast_total (counter)
 * - ingestion_messages_broadcast_duration_seconds (histogram)
 * - ingestion_sse_clients_connected (gauge)
 * - ingestion_flood_wait_count_24h (gauge)
 * - ingestion_media_downloads_total (counter)
 * - ingestion_api_request_duration_seconds (histogram)
 *
 * @module MetricsModule
 */
@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
      },
    }),
  ],
  providers: [
    {
      provide: Registry,
      useFactory: (): Registry => {
        // Create and return a new Registry instance
        // PrometheusModule will use this registry
        return new Registry();
      },
    },
    MetricsService,
  ],
  controllers: [MetricsController],
  exports: [MetricsService],
})
export class MetricsModule {}
