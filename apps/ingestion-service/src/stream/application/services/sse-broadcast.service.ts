import { Injectable, Logger } from '@nestjs/common';
import { ServerResponse } from 'http';
import { MetricsService } from '../../../metrics/metrics.service';

/**
 * BroadcastEvent - Event payload for SSE broadcast
 *
 * Per Requirement 3.1: Structure for Broadcast_Event messages
 * Per Requirement 12: Round-trip serialization support
 */
export interface BroadcastEvent {
  eventId: string;
  timestamp: number;
  channelId: string;
  messageId: number;
  content?: string;
  title?: string;
  mediaPath?: string;
  publishedAt: number;
  [key: string]: unknown; // Allow additional fields for extensibility
}

/**
 * SSEBroadcastService manages Server-Sent Events connections to multiple backend instances.
 *
 * Per Requirement 3.2: Send Broadcast_Event to ALL connected Backend SSE streams
 * Per Requirement 3.3: Log failure and continue broadcasting to other Backends
 * Per Requirement 4.1: Backends filter by their Source_Whitelist client-side
 * Per Requirement 6.1: Track active backend connections via Prometheus metrics
 *
 * Features:
 * - Per-backend connection management (production, staging, etc.)
 * - Resilient broadcast that continues on individual failures
 * - Prometheus metrics for observability
 * - Graceful error handling without interrupting other backends
 *
 * @injectable NestJS service
 */
@Injectable()
export class SSEBroadcastService {
  private readonly logger = new Logger(SSEBroadcastService.name);
  private readonly connections = new Map<string, ServerResponse>();

  constructor(private readonly metricsService: MetricsService) {}

  /**
   * Add a new backend connection
   *
   * Per Requirement 2.1: Accept incoming SSE connections from backend instances
   * Per Requirement 8.5: Emit metric for active backend connections
   *
   * @param backendId - Unique identifier for the backend (e.g., "production", "staging")
   * @param response - HTTP ServerResponse for writing SSE events
   */
  addConnection(backendId: string, response: ServerResponse): void {
    this.connections.set(backendId, response);

    // Per Requirement 8.5: Update metrics for active backend count
    this.metricsService.sseClientsConnected.set(this.connections.size);
    this.metricsService.activeBackends.set(this.connections.size);

    this.logger.log({
      event: 'backend:connected',
      backendId,
      activeBackends: this.connections.size,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Remove a backend connection
   *
   * Per Requirement 8.1: Remove Backend from active connections list on failure
   * Per Requirement 8.4: Log Backend disconnections at WARN level
   * Per Requirement 8.5: Update metric for active backend connections
   *
   * @param backendId - Unique identifier of the backend to remove
   */
  removeConnection(backendId: string): void {
    const response = this.connections.get(backendId);
    if (!response) return;

    // Close the response stream if still open
    try {
      if (!response.writableEnded) {
        response.end();
      }
    } catch (error) {
      // Ignore errors during cleanup
    }

    this.connections.delete(backendId);

    // Per Requirement 8.5: Update metrics for active backend count
    this.metricsService.sseClientsConnected.set(this.connections.size);
    this.metricsService.activeBackends.set(this.connections.size);

    // Per Requirement 8.4: Log disconnections at WARN level
    this.logger.warn({
      event: 'backend:disconnected',
      backendId,
      activeBackends: this.connections.size,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast an event to all connected backends
   *
   * Per Requirement 3.2: Send event to ALL connected Backend SSE streams
   * Per Requirement 3.3: Log failure and continue broadcasting to other Backends
   * Per Requirement 8.2: Do NOT block or retry on individual backend failure
   * Per Requirement 6.1: Update broadcast metrics
   * Per Requirement 8.1, 8.3: Track per-backend broadcast success and failures
   *
   * This method is resilient - if one backend fails, others continue to receive the event.
   *
   * @param event - BroadcastEvent to send to all backends
   */
  async broadcast(event: BroadcastEvent): Promise<void> {
    const deadBackends: string[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const [backendId, response] of this.connections) {
      try {
        // Check if response is still writable
        if (response.writableEnded) {
          deadBackends.push(backendId);
          failureCount++;
          
          // Per Requirement 8.3: Track broadcast failures per backend
          this.metricsService.broadcastFailures.inc({
            backend_id: backendId,
            reason: 'connection_closed',
          });
          continue;
        }

        // Send the event
        this.sendEvent(response, 'message:telegram', event);
        successCount++;
        
        // Per Requirement 8.1: Track successful broadcasts per backend
        this.metricsService.broadcastTotal.inc({ backend_id: backendId });
      } catch (error) {
        // Per Requirement 3.3: Log failure and continue to other backends
        this.logger.error({
          event: 'broadcast:failed',
          backendId,
          error: (error as Error).message,
          timestamp: new Date().toISOString(),
        });
        deadBackends.push(backendId);
        failureCount++;
        
        // Per Requirement 8.3: Track broadcast failures per backend
        this.metricsService.broadcastFailures.inc({
          backend_id: backendId,
          reason: 'send_error',
        });
      }
    }

    // Per Requirement 6.1: Update Prometheus metrics (legacy counter)
    this.metricsService.messagesBroadcastTotal.inc(successCount);

    // Clean up dead connections
    for (const backendId of deadBackends) {
      this.removeConnection(backendId);
    }

    // Log summary if there were failures
    if (failureCount > 0) {
      this.logger.warn({
        event: 'broadcast:partial_failure',
        successCount,
        failureCount,
        activeBackends: this.connections.size,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get the number of currently active backend connections
   *
   * Per Requirement 10.1: Expose active Backend count for monitoring
   *
   * @returns Number of active backend SSE connections
   */
  getActiveBackendCount(): number {
    return this.connections.size;
  }

  /**
   * Check if a specific backend is connected
   *
   * @param backendId - Backend identifier to check
   * @returns true if the backend has an active connection
   */
  isBackendConnected(backendId: string): boolean {
    return this.connections.has(backendId);
  }

  /**
   * Format and write an SSE event to the response stream
   *
   * Per EventSource specification:
   * - Events are formatted as: event: <type>\ndata: <json>\n\n
   * - Multiple lines must be separated by \n
   * - Each message ends with double newline
   *
   * @param response - HTTP response stream
   * @param event - Event type name
   * @param data - Event payload (will be JSON stringified)
   */
  private sendEvent(
    response: ServerResponse,
    event: string,
    data: unknown,
  ): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    response.write(payload);
  }
}
