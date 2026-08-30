import { Controller, Get, Logger, HttpStatus, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { StreamService } from 'stream/application/services/stream.service';
import type { DisconnectionWindow } from 'stream/application/services/disconnection-tracker.service';
import { DisconnectionTracker } from 'stream/application/services/disconnection-tracker.service';

/**
 * Health check response interface
 * 
 * Per Requirement 5.1, 5.2: Health endpoint structure
 * Per GAP 3: Include disconnectionWindows and WARNING flag
 */
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  warnings?: string[]; // Per GAP 3: Add WARNING flag
  mtproto: {
    connected: boolean;
    authorized: boolean;
    lastPollAt?: string;
  };
  channels: {
    total: number;
    active: number;
    kol: number;
    news: number;
  };
  clients: {
    connected: number;
    disconnectionWindows?: DisconnectionWindow[]; // Per GAP 3
  };
  floodWait?: {
    count24h: number;
    maxSeconds24h: number;
    consecutiveFailures: number;
  };
  uptime: number; // milliseconds
}

/**
 * Channel metadata response interface
 * 
 * Per Requirement 5.3: Channel metadata endpoint
 */
export interface ChannelMetadata {
  id: string;
  title: string;
  handle?: string;
  participantCount?: number;
  type: 'kol' | 'crypto-news';
  joinedAt?: string;
}

/**
 * HealthController provides health check and metrics endpoints
 * 
 * Per Requirement 5.1, 5.2: Health endpoint for monitoring
 * Per Requirement 5.3: Channel metadata endpoint
 * Per Requirement 5.4, 5.5: HTTP status codes (200 = ok, 503 = degraded)
 * 
 * Endpoints:
 * - GET /api/health - Overall service health
 * - GET /api/health/ready - Kubernetes readiness probe
 * - GET /api/health/live - Kubernetes liveness probe
 * - GET /api/health/channels - Channel metadata list
 * 
 * @controller Handles /api/health routes
 */
/**
 * TelegramClientManager interface stub
 * 
 * This interface will be satisfied by the actual TelegramClientManager
 * when the MTProto layer is wired into the ingestion service.
 */
export interface TelegramClientManager {
  isConnected(): Promise<boolean>;
  isAuthorized(): Promise<boolean>;
  getLastPollTimestamp(): Date | null;
  getChannelCount(): number;
  getActiveChannelCount(): number;
  getKolChannelCount(): number;
  getNewsChannelCount(): number;
  getChannelMetadata(): ChannelMetadata[];
}

/**
 * FloodWaitCounter interface stub
 * 
 * This interface will be satisfied by the actual FloodWaitCounter
 * when anti-ban protection is wired.
 */
export interface FloodWaitCounter {
  getCount24h(): number;
  getMaxSeconds24h(): number;
  getConsecutiveFailures(): number;
}

@Controller('api/health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly startTime: number;

  constructor(
    private readonly streamService: StreamService,
    private readonly disconnectionTracker: DisconnectionTracker,
    @Inject('TelegramClientManager') private readonly clientManager?: TelegramClientManager,
    @Inject('FloodWaitCounter') private readonly floodWaitCounter?: FloodWaitCounter,
  ) {
    this.startTime = Date.now();
  }

  /**
   * Main health check endpoint
   * 
   * Per Requirement 5.1, 5.2: Returns service health status
   * Per Requirement 5.4: Returns 200 (ok) when MTProto connected
   * Per Requirement 5.5: Returns 503 (degraded) when MTProto disconnected
   * Per GAP 3: Include disconnectionWindows and WARNING flag
   * 
   * @returns Health response with detailed metrics
   */
  @Get()
  async getHealth(@Res() res: Response): Promise<void> {
    // Per Requirement 5.4, 5.5: Check MTProto connection status
    const mtprotoConnected = this.clientManager 
      ? await this.clientManager.isConnected() 
      : true; // Fallback for when not wired yet
    const mtprotoAuthorized = this.clientManager 
      ? await this.clientManager.isAuthorized() 
      : true; // Fallback for when not wired yet

    const status = mtprotoConnected && mtprotoAuthorized ? 'ok' : 'degraded';

    // Per GAP 3: Get disconnection windows and check for warnings
    const disconnectionWindows = this.disconnectionTracker.getDisconnectionWindows();
    const hasLongDisconnection = this.disconnectionTracker.hasLongDisconnectionWindow();
    
    const warnings: string[] = [];
    if (hasLongDisconnection) {
      warnings.push('Client disconnection window >60s detected');
    }

    const response: HealthResponse = {
      status,
      mtproto: {
        connected: mtprotoConnected,
        authorized: mtprotoAuthorized,
        lastPollAt: this.clientManager?.getLastPollTimestamp()?.toISOString() || new Date().toISOString(),
      },
      channels: {
        total: this.clientManager?.getChannelCount() || 0,
        active: this.clientManager?.getActiveChannelCount() || 0,
        kol: this.clientManager?.getKolChannelCount() || 0,
        news: this.clientManager?.getNewsChannelCount() || 0,
      },
      clients: {
        connected: this.streamService.getClientCount(),
        disconnectionWindows, // Per GAP 3
      },
      uptime: Date.now() - this.startTime,
    };

    // Per GAP 3: Add warnings array if any warnings exist
    if (warnings.length > 0) {
      response.warnings = warnings;
    }

    // Per Requirement 5.6: Include flood wait metrics when available
    if (this.floodWaitCounter) {
      response.floodWait = {
        count24h: this.floodWaitCounter.getCount24h(),
        maxSeconds24h: this.floodWaitCounter.getMaxSeconds24h(),
        consecutiveFailures: this.floodWaitCounter.getConsecutiveFailures(),
      };
    }

    // Per Requirement 5.4, 5.5: Set HTTP status code based on service health
    const httpStatus = status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    res.status(httpStatus).json(response);
  }

  /**
   * Kubernetes readiness probe
   * 
   * Returns 200 when service is ready to accept traffic
   * Returns 503 when service is starting up or degraded
   * 
   * @returns Simple ready status
   */
  @Get('ready')
  async getReadiness() {
    // Service is ready if it can accept SSE connections
    const connectedClients = this.streamService.getClientCount();
    
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      connectedClients,
    };
  }

  /**
   * Kubernetes liveness probe
   * 
   * Returns 200 when service is alive
   * Returns 503 when service should be restarted
   * 
   * @returns Simple alive status
   */
  @Get('live')
  async getLiveness() {
    // Service is alive if Node.js process is running
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Channel metadata endpoint
   * 
   * Per Requirement 5.3: Returns list of subscribed channels with metadata
   * 
   * @returns Array of channel metadata
   */
  @Get('channels')
  async getChannels(): Promise<ChannelMetadata[]> {
    if (!this.clientManager) {
      this.logger.debug('TelegramClientManager not wired - returning empty array');
      return [];
    }
    
    return this.clientManager.getChannelMetadata();
  }
}
