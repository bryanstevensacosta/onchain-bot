import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

/**
 * MetricsService provides Prometheus metrics for the Ingestion Service
 * 
 * Per Requirement 9.5: Expose metrics for monitoring
 * Per Requirement 11.7: Track FLOOD_WAIT occurrences
 * 
 * Metrics exposed:
 * - ingestion_mtproto_connected: MTProto connection status (0|1)
 * - ingestion_messages_received_total: Total messages received (labels: channelId, type)
 * - ingestion_messages_broadcast_total: Total messages broadcast
 * - ingestion_messages_broadcast_duration_seconds: Message broadcast latency
 * - ingestion_sse_clients_connected: Current SSE client count
 * - ingestion_flood_wait_count_24h: FLOOD_WAIT errors in 24h window
 * - ingestion_media_downloads_total: Total media downloads (labels: type)
 * - ingestion_api_request_duration_seconds: API request latency (labels: endpoint, method, status)
 * 
 * @service MetricsService
 */
@Injectable()
export class MetricsService {
  // MTProto connection status (gauge: 0|1)
  public readonly mtprotoConnected: Gauge<string>;

  // Message throughput
  public readonly messagesReceivedTotal: Counter<string>;
  public readonly messagesBroadcastTotal: Counter<string>;
  public readonly messagesBroadcastDuration: Histogram<string>;

  // SSE clients
  public readonly sseClientsConnected: Gauge<string>;

  // FLOOD_WAIT tracking (Requirement 11.7)
  public readonly floodWaitCount24h: Gauge<string>;

  // Media operations
  public readonly mediaDownloadsTotal: Counter<string>;

  // API latency
  public readonly apiRequestDuration: Histogram<string>;

  constructor(private readonly registry: Registry) {
    // MTProto connection status
    this.mtprotoConnected = new Gauge({
      name: 'ingestion_mtproto_connected',
      help: 'MTProto connection status (0=disconnected, 1=connected)',
      registers: [this.registry],
    });

    // Message throughput
    this.messagesReceivedTotal = new Counter({
      name: 'ingestion_messages_received_total',
      help: 'Total number of messages received from Telegram',
      labelNames: ['channelId', 'type'],
      registers: [this.registry],
    });

    this.messagesBroadcastTotal = new Counter({
      name: 'ingestion_messages_broadcast_total',
      help: 'Total number of messages broadcast to SSE clients',
      registers: [this.registry],
    });

    this.messagesBroadcastDuration = new Histogram({
      name: 'ingestion_messages_broadcast_duration_seconds',
      help: 'Duration of message broadcast operations in seconds',
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [this.registry],
    });

    // SSE clients
    this.sseClientsConnected = new Gauge({
      name: 'ingestion_sse_clients_connected',
      help: 'Number of currently connected SSE clients',
      registers: [this.registry],
    });

    // FLOOD_WAIT tracking (Requirement 11.7)
    this.floodWaitCount24h = new Gauge({
      name: 'ingestion_flood_wait_count_24h',
      help: 'Number of FLOOD_WAIT errors in the last 24 hours',
      registers: [this.registry],
    });

    // Media operations
    this.mediaDownloadsTotal = new Counter({
      name: 'ingestion_media_downloads_total',
      help: 'Total number of media files downloaded',
      labelNames: ['type'],
      registers: [this.registry],
    });

    // API latency
    this.apiRequestDuration = new Histogram({
      name: 'ingestion_api_request_duration_seconds',
      help: 'Duration of API requests in seconds',
      labelNames: ['endpoint', 'method', 'status'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
      registers: [this.registry],
    });

    // Initialize gauges to 0
    this.mtprotoConnected.set(0);
    this.sseClientsConnected.set(0);
    this.floodWaitCount24h.set(0);
  }

  /**
   * Get all metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Get content type for Prometheus metrics
   */
  getContentType(): string {
    return this.registry.contentType;
  }
}
