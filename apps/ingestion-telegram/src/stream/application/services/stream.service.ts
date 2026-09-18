import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { DisconnectionTracker } from './disconnection-tracker.service';

/**
 * SSE event payload structure
 *
 * Per Requirement 2.1: Events streamed to clients must follow this structure
 */
export interface SSEEvent {
  type: string;
  data: unknown;
}

/**
 * SSE client connection metadata
 */
interface SSEClient {
  id: string;
  response: ServerResponse;
  connectedAt: Date;
}

/**
 * StreamService manages Server-Sent Events (SSE) connections to backend clients.
 *
 * Per Requirement 2.1: Provides SSE streaming for real-time message distribution
 * Per Requirement 2.3: Maintains low-latency (<500ms) push-based delivery
 * Per Requirement 2.4: Handles client reconnection gracefully
 *
 * Features:
 * - Client registration and lifecycle management
 * - Broadcast messaging to all connected clients
 * - Automatic heartbeat to prevent proxy timeouts (Per Requirement 2.5)
 * - Graceful error handling and client cleanup
 *
 * @injectable NestJS service
 */
@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);
  private readonly clients = new Map<string, SSEClient>();

  constructor(private readonly disconnectionTracker: DisconnectionTracker) {}

  /**
   * Register a new SSE client connection
   *
   * Per Requirement 2.1: Accept incoming SSE connections from backend clients
   * Per GAP 3: Track reconnection via DisconnectionTracker
   * Per Requirement 9.2: Structured logging for client connection events
   *
   * @param clientId - Unique identifier for this client
   * @param response - HTTP ServerResponse for writing SSE events
   */
  addClient(clientId: string, response: ServerResponse): void {
    // Set SSE headers per EventSource spec
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    this.clients.set(clientId, {
      id: clientId,
      response,
      connectedAt: new Date(),
    });

    // Per GAP 3: Record reconnection (or initial connection)
    this.disconnectionTracker.recordReconnection(clientId);

    // Per Requirement 9.2: Structured logging for client connections
    this.logger.log({
      event: 'sse:client:connected',
      clientId,
      totalClients: this.clients.size,
      timestamp: new Date().toISOString(),
    });

    // Send initial connection event
    this.sendToClient(clientId, {
      type: 'connection:established',
      data: {
        clientId,
        timestamp: new Date().toISOString(),
        message: 'Connected to Ingestion Service SSE stream',
      },
    });
  }

  /**
   * Remove a client connection
   *
   * Per Requirement 2.4: Clean up disconnected clients to prevent memory leaks
   * Per GAP 3: Track disconnection via DisconnectionTracker
   * Per Requirement 9.2: Structured logging for client disconnection events
   *
   * @param clientId - Unique identifier of the client to remove
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Close the response stream if still open
    try {
      if (!client.response.writableEnded) {
        client.response.end();
      }
    } catch (error) {
      // Ignore errors during cleanup
    }

    this.clients.delete(clientId);

    // Per GAP 3: Record disconnection
    this.disconnectionTracker.recordDisconnection(clientId);

    // Per Requirement 9.2: Structured logging for client disconnections
    this.logger.log({
      event: 'sse:client:disconnected',
      clientId,
      totalClients: this.clients.size,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast an event to all connected clients
   *
   * Per Requirement 2.1: Distribute messages to all backend environments
   * Per Requirement 2.3: Push-based delivery with low latency
   *
   * **No-Duplication Architecture:**
   * This service follows a fan-out pattern where each message from Telegram is
   * broadcast ONCE to each connected backend (dev/staging/production). There is
   * NO message duplication at the ingestion layer.
   *
   * Example: If staging and production both listen to channel A:
   * 1. Ingestion service receives message from channel A (once from Telegram MTProto)
   * 2. Message is broadcast once to staging SSE connection
   * 3. Message is broadcast once to production SSE connection
   * 4. Each backend filters client-side based on its own channel subscription list
   *
   * The Channel_Union (computed from all backends' active channels) determines which
   * channels the ingestion service subscribes to. When a message arrives from any
   * subscribed channel, it's distributed to ALL connected backends. Each backend is
   * responsible for filtering messages relevant to its own configuration.
   *
   * @param event - Event payload containing type and data
   */
  broadcast(event: SSEEvent): void {
    const deadClients: string[] = [];

    for (const [clientId, client] of this.clients) {
      try {
        // Check if response is still writable
        if (client.response.writableEnded) {
          deadClients.push(clientId);
          continue;
        }

        this.sendEvent(client.response, event.type, event.data);
      } catch (error) {
        this.logger.error(
          `Failed to send to client ${clientId}: ${(error as Error).message}`,
        );
        deadClients.push(clientId);
      }
    }

    // Clean up dead connections
    for (const clientId of deadClients) {
      this.removeClient(clientId);
    }
  }

  /**
   * Send an event to a specific client
   *
   * @param clientId - Target client identifier
   * @param event - Event payload
   */
  private sendToClient(clientId: string, event: SSEEvent): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      if (client.response.writableEnded) {
        this.removeClient(clientId);
        return;
      }

      this.sendEvent(client.response, event.type, event.data);
    } catch (error) {
      this.logger.error(
        `Failed to send to client ${clientId}: ${(error as Error).message}`,
      );
      this.removeClient(clientId);
    }
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

  /**
   * Send periodic heartbeat to all clients
   *
   * Per Requirement 2.5: Prevent proxy/CDN timeouts on idle connections
   * Per Requirement 2.4: Detect dead connections early
   *
   * Runs every 30 seconds via NestJS scheduler
   */
  @Cron('*/30 * * * * *')
  sendHeartbeat(): void {
    const now = new Date();
    this.broadcast({
      type: 'health:ping',
      data: {
        timestamp: now.toISOString(),
        uptime: process.uptime(),
        connectedClients: this.clients.size,
      },
    });
  }

  /**
   * Get count of currently connected clients
   *
   * @returns Number of active SSE connections
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get metadata about all connected clients
   *
   * @returns Array of client metadata (without response objects)
   */
  getConnectedClients(): Array<{ id: string; connectedAt: Date }> {
    return Array.from(this.clients.values()).map((client) => ({
      id: client.id,
      connectedAt: client.connectedAt,
    }));
  }

  /**
   * Shutdown all client connections gracefully
   *
   * Called on module destroy to clean up resources
   */
  shutdown(): void {
    this.logger.log(
      `Shutting down StreamService (${this.clients.size} clients)`,
    );

    for (const [clientId] of this.clients) {
      this.removeClient(clientId);
    }
  }
}
