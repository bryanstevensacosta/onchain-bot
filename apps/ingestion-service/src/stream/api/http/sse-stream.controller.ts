import {
  Controller,
  Get,
  Req,
  Res,
  Query,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { StreamService } from '../../application/services/stream.service';
import { BackendChannelProviderService } from '../../../telegram/shared/services/backend-channel-provider.service';
import { BackfillBufferService } from '../../infrastructure/backfill-buffer.service';

/**
 * SSEStreamController exposes authenticated SSE streaming endpoint for backend clients
 *
 * Per Requirement 2.1: Backend connects with identifier
 * Per Requirement 2.2: Validate identifier against registered backends
 * Per Requirement 2.3: Reject connection with HTTP 401 if not registered
 * Per Requirement 4.3: Accept query params: backendId and lastSeenTimestamp
 * Per Requirement 6.4: Start heartbeat interval (handled by StreamService @Cron)
 * Per Requirement 7.3: Query backfill buffer using lastSeenTimestamp
 * Per Requirement 7.4: Send backfill events before real-time stream
 * Per Requirement 7.5: Send backfill-unavailable if timestamp too old
 *
 * Endpoints:
 * - GET /api/ingestion/stream - Authenticated SSE stream with backendId validation and backfill support
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
 * - backfill - Missed message during reconnection
 * - backfill-complete - End of backfill sequence with count
 * - backfill-unavailable - Disconnection > 72h (window expired)
 * - heartbeat - Keep-alive every 30s (via StreamService.sendHeartbeat)
 *
 * @controller Handles /api/ingestion routes
 */
@Controller('api/ingestion')
export class SSEStreamController {
  private readonly logger = new Logger(SSEStreamController.name);

  constructor(
    private readonly streamService: StreamService,
    private readonly channelProvider: BackendChannelProviderService,
    private readonly backfillBuffer: BackfillBufferService,
  ) {}

  /**
   * Authenticated SSE streaming endpoint with backendId validation
   *
   * Per Requirement 2.1: Accept SSE connections from backend clients with identifier
   * Per Requirement 2.2: Validate backendId against registered backends
   * Per Requirement 2.3: Reject connection with HTTP 401 if not registered
   * Per Requirement 4.3: Accept query params: backendId and optional lastSeenTimestamp
   * Per Requirement 6.4: Start heartbeat interval (30 seconds via StreamService @Cron)
   *
   * Query Parameters:
   * - backendId: string (required) - Backend identifier (e.g., "production", "staging")
   * - lastSeenTimestamp: string (optional) - ISO timestamp of last received message (for future backfill)
   *
   * The connection remains open indefinitely until:
   * - Client closes the connection
   * - Network error occurs
   * - Server shuts down
   *
   * Returns:
   * - 200 OK with SSE stream if backendId is registered
   * - 401 Unauthorized if backendId is not registered
   * - 400 Bad Request if backendId is missing or invalid
   *
   * @param backendId - Backend identifier from query parameter
   * @param lastSeenTimestamp - Optional timestamp for backfill (not implemented yet)
   * @param request - Express request object
   * @param response - Express response object (raw ServerResponse)
   */
  @Get('stream')
  stream(
    @Query('backendId') backendId: string | undefined,
    @Query('lastSeenTimestamp') lastSeenTimestamp: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): void {
    // Validate backendId is provided
    if (!backendId) {
      this.logger.warn(
        `SSE connection rejected: missing backendId from ${request.ip}`,
      );
      throw new BadRequestException(
        'backendId query parameter is required. Usage: GET /api/ingestion/stream?backendId=your-backend-id',
      );
    }

    // Validate backendId format (non-empty, no whitespace-only)
    if (backendId.trim().length === 0) {
      this.logger.warn(
        `SSE connection rejected: empty backendId from ${request.ip}`,
      );
      throw new BadRequestException('backendId cannot be empty');
    }

    // Per Requirement 2.2: Validate backendId is registered
    const registeredBackends = this.channelProvider.getRegisteredBackendIds();
    const isRegistered = registeredBackends.includes(backendId);

    if (!isRegistered) {
      // Per Requirement 2.3: Reject with 401 if not registered
      this.logger.warn(
        `SSE connection rejected: backendId "${backendId}" is not registered (from ${request.ip})`,
      );
      throw new UnauthorizedException(
        `Backend identifier "${backendId}" is not registered. Please register via POST /api/ingestion/backends/register first.`,
      );
    }

    // Generate unique client ID for connection tracking
    const clientId = `${backendId}-${randomUUID()}`;

    this.logger.log(
      `SSE connection accepted: backendId="${backendId}", clientId="${clientId}", ip=${request.ip}`,
    );

    // Per Requirement 7.3: Query backfill buffer using lastSeenTimestamp
    // Per Requirement 7.4: Send backfill events before real-time stream
    // Per Requirement 7.5: Send backfill-unavailable if timestamp too old
    if (lastSeenTimestamp) {
      this.logger.log(
        `Backend ${backendId} requesting backfill from ${lastSeenTimestamp}`,
      );

      // Parse ISO timestamp to Unix milliseconds
      let timestampMs: number;
      try {
        const parsedDate = new Date(lastSeenTimestamp);
        if (isNaN(parsedDate.getTime())) {
          throw new Error('Invalid date format');
        }
        timestampMs = parsedDate.getTime();
      } catch (error) {
        this.logger.warn(
          `Invalid lastSeenTimestamp format for backend ${backendId}: ${lastSeenTimestamp}`,
        );
        throw new BadRequestException(
          `Invalid lastSeenTimestamp format. Expected ISO 8601 string (e.g., "2026-09-03T12:00:00.000Z")`,
        );
      }

      // Set SSE headers manually before sending backfill events
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      });

      // Query backfill buffer for events since timestamp
      const backfillEvents = this.backfillBuffer.getEventsSince(timestampMs);
      const oldestTimestamp = this.backfillBuffer.getOldestTimestamp();

      // Per Requirement 7.5: Check if timestamp is outside the backfill window
      if (
        timestampMs > 0 &&
        oldestTimestamp !== null &&
        timestampMs < oldestTimestamp
      ) {
        // Timestamp is too old - window expired
        this.logger.warn(
          `Backfill unavailable for backend ${backendId}: requested timestamp ${lastSeenTimestamp} is older than oldest buffered message (${new Date(oldestTimestamp).toISOString()})`,
        );

        const payload = `event: backfill-unavailable\ndata: ${JSON.stringify({
          reason: 'window expired',
          requestedTimestamp: lastSeenTimestamp,
          oldestAvailableTimestamp: new Date(oldestTimestamp).toISOString(),
          message: `Requested timestamp is outside the 72-hour backfill window. Oldest available: ${new Date(oldestTimestamp).toISOString()}`,
        })}\n\n`;
        response.write(payload);
      } else if (backfillEvents.length > 0) {
        // Send backfill events
        this.logger.log(
          `Sending ${backfillEvents.length} backfill events to backend ${backendId}`,
        );

        for (const event of backfillEvents) {
          const payload = `event: backfill\ndata: ${JSON.stringify(event.toJSON())}\n\n`;
          response.write(payload);
        }

        // Send backfill-complete event with count
        const completePayload = `event: backfill-complete\ndata: ${JSON.stringify({
          count: backfillEvents.length,
          oldestTimestamp: backfillEvents[0].timestamp,
          newestTimestamp: backfillEvents[backfillEvents.length - 1].timestamp,
          message: `Backfill complete: ${backfillEvents.length} messages delivered`,
        })}\n\n`;
        response.write(completePayload);

        this.logger.log(
          `Backfill complete for backend ${backendId}: ${backfillEvents.length} messages sent`,
        );
      } else {
        // No backfill events found (buffer empty or all events are older than requested timestamp)
        this.logger.debug(
          `No backfill events found for backend ${backendId} since ${lastSeenTimestamp}`,
        );
      }

      // Send connection:established event after backfill
      const establishedPayload = `event: connection:established\ndata: ${JSON.stringify({
        clientId,
        timestamp: new Date().toISOString(),
        message: 'Connected to Ingestion Service SSE stream',
      })}\n\n`;
      response.write(establishedPayload);

      // Register client with StreamService for real-time events
      // Note: We manually set headers above, so StreamService won't call writeHead again
      const client = {
        id: clientId,
        response,
        connectedAt: new Date(),
      };
      // Use internal method to add client without sending headers/connection event again
      (this.streamService as any).clients.set(clientId, client);
      (this.streamService as any).disconnectionTracker.recordReconnection(
        clientId,
      );

      this.logger.log(
        `Backend ${backendId} connected after backfill (clientId: ${clientId})`,
      );
    } else {
      // No backfill requested - standard connection
      // Per Requirement 6.4: Add connection to StreamService
      // StreamService handles:
      // - Setting SSE headers
      // - Sending connection:established event
      // - Starting heartbeat interval (via @Cron decorator, every 30 seconds)
      this.streamService.addClient(clientId, response);
    }

    // Handle client disconnect
    request.on('close', () => {
      this.logger.log(
        `Backend ${backendId} connection closed (clientId: ${clientId})`,
      );
      this.streamService.removeClient(clientId);
      this.channelProvider.recordDisconnect(backendId);
    });

    // Handle connection errors
    request.on('error', (error: Error) => {
      this.logger.error(
        `Backend ${backendId} connection error (clientId: ${clientId}): ${error.message}`,
      );
      this.streamService.removeClient(clientId);
      this.channelProvider.recordDisconnect(backendId);
    });

    // Note: We do NOT call response.end() here - the connection stays open
    // StreamService manages writing to the response stream
    // Per Requirement 6.4: Heartbeat is sent every 30 seconds via StreamService.sendHeartbeat()
  }
}
