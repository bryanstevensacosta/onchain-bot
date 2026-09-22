import { Controller, Get, Req, Res, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StreamService } from '../../application/services/stream.service';

/**
 * SSEStreamController exposes the SSE streaming endpoint for backend clients.
 *
 * Per-env-ingestion item 4: per-env model — ONE ingestion per env, so the
 * multi-backend registration gate (backendId 401 + BackfillBuffer replay via
 * lastSeenTimestamp) is deleted. Any backend connects with NO prior register
 * step; StreamService is the única vía (broadcast + 30s heartbeat).
 * Per Requirement 6.4: Connection cleanup on disconnect.
 *
 * Endpoints:
 * - GET /api/ingestion/stream - Open SSE stream (stays open)
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
 * - health:ping - Keep-alive every 30s (via StreamService.sendHeartbeat)
 *
 * @controller Handles /api/ingestion routes
 */
@ApiTags('stream')
@Controller('api/ingestion')
export class SSEStreamController {
  private readonly logger = new Logger(SSEStreamController.name);

  constructor(private readonly streamService: StreamService) {}

  /**
   * Open SSE streaming endpoint (no registration gate).
   *
   * The connection remains open indefinitely until:
   * - Client closes the connection
   * - Network error occurs
   * - Server shuts down
   *
   * Returns:
   * - 200 OK with SSE stream (text/event-stream)
   *
   * @param request - Express request object
   * @param response - Express response object (raw ServerResponse)
   */
  @Get('stream')
  @ApiOperation({ summary: 'SSE stream for backend clients (stays open)' })
  @ApiResponse({
    status: 200,
    description: 'SSE event stream (text/event-stream)',
  })
  stream(@Req() request: Request, @Res() response: Response): void {
    // Generate unique client ID for connection tracking
    const clientId = randomUUID();

    this.logger.log(
      `SSE connection accepted: clientId="${clientId}", ip=${request.ip}`,
    );

    // Per Requirement 6.4: Add connection to StreamService
    // StreamService handles:
    // - Setting SSE headers
    // - Sending connection:established event
    // - Starting heartbeat interval (via @Cron decorator, every 30 seconds)
    this.streamService.addClient(clientId, response);

    // Handle client disconnect
    request.on('close', () => {
      this.logger.log(`SSE connection closed (clientId: ${clientId})`);
      this.streamService.removeClient(clientId);
    });

    // Handle connection errors
    request.on('error', (error: Error) => {
      this.logger.error(
        `SSE connection error (clientId: ${clientId}): ${error.message}`,
      );
      this.streamService.removeClient(clientId);
    });

    // Note: We do NOT call response.end() here - the connection stays open
    // StreamService manages writing to the response stream
    // Per Requirement 6.4: Heartbeat is sent every 30 seconds via StreamService.sendHeartbeat()
  }
}
