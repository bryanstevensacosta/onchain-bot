# Metrics Module

This module provides Prometheus metrics collection and exposure for the Ingestion Service.

## Overview

Per **Requirement 9.5** and **Requirement 11.7**, the MetricsModule exposes operational metrics at the `/metrics` endpoint for monitoring and alerting.

## Exposed Metrics

### Connection Status
- **`ingestion_mtproto_connected`** (Gauge)
  - MTProto connection status (0=disconnected, 1=connected)
  - Use: Alert when MTProto connection is lost

### Message Throughput
- **`ingestion_messages_received_total`** (Counter)
  - Total messages received from Telegram
  - Labels: `channelId`, `type` (kol/news)
  - Use: Track message volume per channel

- **`ingestion_messages_broadcast_total`** (Counter)
  - Total messages broadcast to SSE clients
  - Use: Verify all received messages are broadcast

- **`ingestion_messages_broadcast_duration_seconds`** (Histogram)
  - Duration of broadcast operations
  - Buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
  - Use: Monitor broadcast latency (target <500ms p95)

### SSE Clients
- **`ingestion_sse_clients_connected`** (Gauge)
  - Current number of connected SSE clients
  - Use: Verify expected backends are connected

### Anti-Ban Protection
- **`ingestion_flood_wait_count_24h`** (Gauge)
  - FLOOD_WAIT errors in last 24 hours
  - Use: Alert when threshold >10 is exceeded (Requirement 11.2)

### Media Operations
- **`ingestion_media_downloads_total`** (Counter)
  - Total media files downloaded
  - Labels: `type` (photo/video/document)
  - Use: Track media download volume

### API Performance
- **`ingestion_api_request_duration_seconds`** (Histogram)
  - Duration of API requests
  - Labels: `endpoint`, `method`, `status`
  - Buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]
  - Use: Monitor API latency

## Usage

### In Services

Inject `MetricsService` and update metrics:

```typescript
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class MyService {
  constructor(private readonly metrics: MetricsService) {}

  async processMessage(message: TelegramRawMessage) {
    // Track message received
    this.metrics.messagesReceivedTotal.inc({
      channelId: message.peerId,
      type: message.isKol ? 'kol' : 'news',
    });

    // Measure broadcast duration
    const timer = this.metrics.messagesBroadcastDuration.startTimer();
    await this.broadcast(message);
    timer();
  }
}
```

### Accessing Metrics

Metrics are exposed at:

```
GET /metrics
```

Response format: Prometheus text format

```
# HELP ingestion_mtproto_connected MTProto connection status (0=disconnected, 1=connected)
# TYPE ingestion_mtproto_connected gauge
ingestion_mtproto_connected 1

# HELP ingestion_messages_received_total Total number of messages received from Telegram
# TYPE ingestion_messages_received_total counter
ingestion_messages_received_total{channelId="-1001234567890",type="kol"} 42

...
```

## Monitoring & Alerting

### Recommended Alerts

1. **MTProto Disconnected**
   - Alert: `ingestion_mtproto_connected == 0 for 5m`
   - Severity: Critical
   - Action: Check MTProto session, restart service

2. **No SSE Clients**
   - Alert: `ingestion_sse_clients_connected == 0 for 10m`
   - Severity: Warning
   - Action: Check backend connectivity

3. **High FLOOD_WAIT Count**
   - Alert: `ingestion_flood_wait_count_24h > 10`
   - Severity: Warning
   - Action: Review polling configuration, check for Telegram API issues

4. **Slow Broadcast Latency**
   - Alert: `histogram_quantile(0.95, ingestion_messages_broadcast_duration_seconds) > 0.5`
   - Severity: Warning
   - Action: Check SSE client performance, network latency

5. **Media Download Volume Spike**
   - Alert: `rate(ingestion_media_downloads_total[5m]) > threshold`
   - Severity: Info
   - Action: Monitor storage usage

## Architecture

```
MetricsModule
├── MetricsService      # Prometheus metrics collection
├── MetricsController   # /metrics endpoint
└── MetricsModule       # NestJS module wiring
```

## Dependencies

- `@willsoto/nestjs-prometheus` - NestJS integration for Prometheus
- `prom-client` - Prometheus client library

## Testing

Unit tests verify:
- Metric initialization
- Value updates
- Label handling
- Prometheus format output

Run tests:
```bash
npm test -- metrics
```
