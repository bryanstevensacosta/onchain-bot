import {
  Controller,
  Get,
  Req,
  Res,
  Logger,
  Param,
  Query,
  BadRequestException,
  Inject,
  Optional,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { StreamService } from '../../application/services/stream.service';
import { SSEBroadcastService } from '../../application/services/sse-broadcast.service';
import { BackfillBufferService } from '../../infrastructure/backfill-buffer.service';
import { BackendChannelProviderService } from '../../../telegram/shared/services/backend-channel-provider.service';

/**
 * Minimal TelegramListenerPort interface for backfill
 * Full interface will be imported when TelegramModule is wired
 */
interface TelegramListenerPort {
  backfill(channelId: string, limit: number): Promise<any[]>;
}

/**
 * StreamStatusResponse - Response structure for stream status endpoint
 *
 * Per Requirement 8.1: Expose operational status of multi-backend broadcast system
 * Per Requirement 8.2: Provide real-time metrics for monitoring
 */
interface StreamStatusResponse {
  activeBackends: number;
  channelUnionSize: number;
  backfillBufferSize: number;
  backfillBufferOldestTimestamp: number | null;
  mtprotoConnected: boolean;
  registeredBackends: string[];
}

/**
 * StreamController exposes SSE streaming endpoint for backend clients
 *
 * Per Requirement 2.1: Provides HTTP SSE endpoint at GET /api/ingestion/stream
 * Per Requirement 2.4: Handles client connection lifecycle and cleanup
 * Per GAP 1 (Architectural Decision 1): Backfill endpoint with SSE streaming
 *
 * Endpoints:
 * - GET /api/ingestion/stream - Real-time SSE stream
 * - GET /api/ingestion/stream/status - Connection metrics
 * - GET /api/ingestion/backfill/:channelId - Historical messages via SSE
 *
 * Event Format:
 * ```
 * event: <event-type>
 * data: <json-payload>
 *
 * ```
 *
 * Event Types:
 * - connection:established - Initial handshake confirmation
 * - message:telegram - New Telegram message ingested (real-time)
 * - backfill:message - Historical message (backfill)
 * - backfill:complete - Backfill stream finished
 * - health:ping - Heartbeat (every 30s)
 *
 * @controller Handles /api/ingestion routes
 */
@Controller('api/ingestion')
export class StreamController {
  private readonly logger = new Logger(StreamController.name);

  constructor(
    private readonly streamService: StreamService,
    private readonly sseBroadcastService: SSEBroadcastService,
    private readonly backfillBufferService: BackfillBufferService,
    private readonly backendChannelProvider: BackendChannelProviderService,
    @Optional()
    @Inject('TelegramListenerPort')
    private readonly telegramListener?: TelegramListenerPort,
  ) {}

  /**
   * SSE streaming endpoint for real-time messages
   *
   * Per Requirement 2.1: Accept SSE connections from backend clients
   * Per Requirement 2.4: Clean up on client disconnect
   *
   * The connection remains open indefinitely until:
   * - Client closes the connection
   * - Network error occurs
   * - Server shuts down
   *
   * @param request - Express request object
   * @param response - Express response object (raw ServerResponse)
   */
  @Get('stream')
  stream(@Req() request: Request, @Res() response: Response): void {
    const clientId = randomUUID();

    this.logger.log(
      `New SSE connection request from ${request.ip} (client: ${clientId})`,
    );

    // Register client with StreamService
    this.streamService.addClient(clientId, response);

    // Handle client disconnect
    request.on('close', () => {
      this.logger.log(`Client ${clientId} connection closed`);
      this.streamService.removeClient(clientId);
    });

    // Handle connection errors
    request.on('error', (error: Error) => {
      this.logger.error(
        `Client ${clientId} connection error: ${error.message}`,
      );
      this.streamService.removeClient(clientId);
    });

    // Note: We do NOT call response.end() here - the connection stays open
    // The StreamService manages writing to the response stream
  }

  /**
   * Backfill endpoint - Stream historical messages via SSE
   *
   * Per GAP 1 (Architectural Decision 1): HTTP backfill with SSE streaming
   * Per Requirement 2.1: SSE-based delivery (consistent with real-time stream)
   *
   * Usage:
   * ```
   * GET /api/ingestion/backfill/:channelId?limit=50
   * ```
   *
   * Response: SSE stream with events:
   * - backfill:message (for each historical message)
   * - backfill:complete (stream finished)
   *
   * @param channelId - Telegram channel ID to backfill
   * @param limit - Number of recent messages to fetch (default: 100, max: 100)
   * @param request - Express request
   * @param response - Express response (SSE stream)
   */
  @Get('backfill/:channelId')
  async backfill(
    @Param('channelId') channelId: string,
    @Query('limit') limitQuery: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    // Parse and validate limit
    const limit = this.parseLimit(limitQuery);

    this.logger.log(
      `Backfill request: channelId=${channelId}, limit=${limit} from ${request.ip}`,
    );

    // Check if TelegramListener is available
    if (!this.telegramListener) {
      response.status(503).json({
        error: 'Service unavailable',
        message: 'Telegram MTProto layer not yet initialized',
      });
      return;
    }

    // Set SSE headers
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    try {
      // Fetch historical messages from MTProto listener
      const messages = await this.telegramListener.backfill(channelId, limit);

      this.logger.log(
        `Backfill fetched ${messages.length} messages for ${channelId}`,
      );

      // Stream each message as backfill:message event
      for (const message of messages) {
        const payload = `event: backfill:message\ndata: ${JSON.stringify(message)}\n\n`;
        response.write(payload);
      }

      // Send completion event
      const completePayload = `event: backfill:complete\ndata: ${JSON.stringify(
        {
          channelId,
          count: messages.length,
          timestamp: new Date().toISOString(),
        },
      )}\n\n`;
      response.write(completePayload);

      // Close the stream
      response.end();

      this.logger.log(
        `Backfill complete for ${channelId}: ${messages.length} messages streamed`,
      );
    } catch (error) {
      this.logger.error(
        `Backfill failed for ${channelId}: ${(error as Error).message}`,
        (error as Error).stack,
      );

      // Send error event before closing
      const errorPayload = `event: backfill:error\ndata: ${JSON.stringify({
        error: (error as Error).message,
        channelId,
      })}\n\n`;
      response.write(errorPayload);
      response.end();
    }
  }

  /**
   * Parse and validate limit query parameter
   *
   * @param limitQuery - Query string value
   * @returns Validated limit (1-100)
   */
  private parseLimit(limitQuery: string | undefined): number {
    const DEFAULT_LIMIT = 100;
    const MAX_LIMIT = 100;
    const MIN_LIMIT = 1;

    if (!limitQuery) {
      return DEFAULT_LIMIT;
    }

    const parsed = parseInt(limitQuery, 10);

    if (isNaN(parsed)) {
      throw new BadRequestException('Limit must be a number');
    }

    if (parsed < MIN_LIMIT) {
      throw new BadRequestException(`Limit must be at least ${MIN_LIMIT}`);
    }

    if (parsed > MAX_LIMIT) {
      throw new BadRequestException(`Limit must not exceed ${MAX_LIMIT}`);
    }

    return parsed;
  }

  /**
   * Operational status endpoint for multi-backend broadcast system
   *
   * Per Requirement 8.1: Expose metrics for active backends and channel union
   * Per Requirement 8.2: Real-time state for monitoring and alerting
   * Per Requirement 10.1: Status endpoint for observability
   *
   * Returns:
   * - activeBackends: Count from SSEBroadcastService
   * - channelUnionSize: From BackendChannelProviderService
   * - backfillBufferSize: From BackfillBufferService
   * - backfillBufferOldestTimestamp: From BackfillBufferService
   * - mtprotoConnected: Placeholder (true) - TelegramModule doesn't expose this yet
   * - registeredBackends: Array of backend IDs from BackendChannelProviderService
   *
   * @returns StreamStatusResponse with operational metrics
   */
  @Get('stream/status')
  getStreamStatus(): StreamStatusResponse {
    const activeBackends = this.sseBroadcastService.getActiveBackendCount();
    const channelUnionSize = this.backendChannelProvider.getChannelUnionSize();
    const backfillBufferSize = this.backfillBufferService.getSize();
    const backfillBufferOldestTimestamp =
      this.backfillBufferService.getOldestTimestamp();
    const registeredBackends =
      this.backendChannelProvider.getRegisteredBackendIds();

    // Note: mtprotoConnected is a placeholder (true) since TelegramModule
    // doesn't yet expose connection status. This will be implemented when
    // TelegramModule provides a getConnectionStatus() method.
    const mtprotoConnected = true;

    this.logger.debug({
      event: 'stream:status:requested',
      activeBackends,
      channelUnionSize,
      backfillBufferSize,
      registeredBackends: registeredBackends.length,
      timestamp: new Date().toISOString(),
    });

    return {
      activeBackends,
      channelUnionSize,
      backfillBufferSize,
      backfillBufferOldestTimestamp,
      mtprotoConnected,
      registeredBackends,
    };
  }
}
