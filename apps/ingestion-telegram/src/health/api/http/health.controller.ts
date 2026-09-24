import {
  Controller,
  Get,
  Logger,
  HttpStatus,
  Optional,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { StreamService } from 'stream/application/services/stream.service';
import { TelegramClientManager } from 'core/infrastructure/services/telegram-client-manager.service';
import { FloodWaitCounterService } from 'core/infrastructure/services/flood-wait-counter.service';
import { TelegramFeedSourceRepository } from 'registry/infrastructure/persistence/typeorm/repositories/typeorm-feed-source.repository';

/**
 * Health check response interface
 *
 * Per Requirement 5.1, 5.2: Health endpoint structure
 */
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  warnings?: string[];
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
  };
  floodWait?: {
    count24h: number;
    maxSeconds24h: number;
    consecutiveFailures: number;
  };
  uptime: number; // milliseconds
  // T2 version-match (prod-safety-gates item 2): additive-only served image
  // revision (build-time IMAGE_REVISION, 'unknown' when unbaked). Optional so
  // pre-T2 health consumers and strict-shape validators keep working.
  imageRevision?: string;
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
 * Wiring (gap 2): injects the REAL TelegramClientManager,
 * FloodWaitCounterService and TelegramFeedSourceRepository (all @Global via
 * SharedModule) with @Optional safe fallbacks. Missing/downstream-failure
 * reads as degraded with a warnings[] reason — never fake-healthy.
 *
 * MetricsService is deliberately NOT wired here: nobody feeds it (gap 4 —
 * all gauges sit at 0), so surfacing it would imply live metrics that do
 * not exist. Flood-wait health comes straight from FloodWaitCounterService;
 * Prometheus stays the metrics source via GET /metrics.
 *
 * @controller Handles /api/health routes
 */
@Controller('api/health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly startTime: number;

  constructor(
    private readonly streamService: StreamService,
    @Optional() private readonly clientManager?: TelegramClientManager,
    @Optional() private readonly floodWaitCounter?: FloodWaitCounterService,
    @Optional() private readonly feedSourceRepo?: TelegramFeedSourceRepository,
  ) {
    this.startTime = Date.now();
  }

  /**
   * Main health check endpoint
   *
   * Per Requirement 5.1, 5.2: Returns service health status
   * Per Requirement 5.4: Returns 200 (ok) when MTProto connected
   * Per Requirement 5.5: Returns 503 (degraded) when MTProto disconnected
   *
   * @returns Health response with detailed metrics
   */
  @Get()
  async getHealth(@Res() res: Response): Promise<void> {
    // Per Requirement 5.4, 5.5: Check MTProto connection status.
    // Honest fallback: no manager (or a throwing probe) means we cannot
    // prove connectivity, so report disconnected + degraded with a reason.
    const warnings: string[] = [];
    let mtprotoConnected = false;
    let mtprotoAuthorized = false;
    let lastPollAt: string | undefined;

    if (!this.clientManager) {
      warnings.push('mtproto-manager-unavailable');
    } else {
      try {
        mtprotoConnected = await Promise.resolve(
          this.clientManager.isConnected(),
        );
      } catch (err) {
        warnings.push('mtproto-connected-probe-failed');
        this.logger.warn(
          `isConnected() probe failed: ${(err as Error).message}`,
        );
      }
      try {
        mtprotoAuthorized = await Promise.resolve(
          this.clientManager.isAuthorized(),
        );
      } catch (err) {
        warnings.push('mtproto-authorized-probe-failed');
        this.logger.warn(
          `isAuthorized() probe failed: ${(err as Error).message}`,
        );
      }
      try {
        const lastPoll = this.clientManager.getLastPollTimestamp();
        if (lastPoll) lastPollAt = lastPoll.toISOString();
      } catch (err) {
        warnings.push('mtproto-last-poll-probe-failed');
        this.logger.warn(
          `getLastPollTimestamp() probe failed: ${(err as Error).message}`,
        );
      }
    }

    if (!mtprotoConnected) warnings.push('mtproto-disconnected');
    if (mtprotoConnected && !mtprotoAuthorized)
      warnings.push('mtproto-unauthorized');

    const status = mtprotoConnected && mtprotoAuthorized ? 'ok' : 'degraded';

    // Honest channel counts from the local feed registry (fail-open []).
    let total = 0;
    let kol = 0;
    let news = 0;
    if (!this.feedSourceRepo) {
      warnings.push('channel-registry-unavailable');
    } else {
      try {
        const sources = await this.feedSourceRepo.findAllActiveWithTypes();
        total = sources.length;
        kol = sources.filter((s) => s.type !== 'crypto-news').length;
        news = sources.filter((s) => s.type === 'crypto-news').length;
      } catch (err) {
        warnings.push('channel-registry-read-failed');
        this.logger.warn(
          `findAllActiveWithTypes() failed: ${(err as Error).message}`,
        );
      }
    }

    const response: HealthResponse = {
      status,
      // Served revision for the T2 version-match gate: read straight from the
      // environment (same source app.config exposes) so no DI change is needed
      // and HealthModule/spec wiring stays untouched. Never blocks: 'unknown'.
      imageRevision: (process.env.IMAGE_REVISION || '').trim() || 'unknown',
      mtproto: {
        connected: mtprotoConnected,
        authorized: mtprotoAuthorized,
        ...(lastPollAt ? { lastPollAt } : {}),
      },
      channels: {
        total,
        active: total,
        kol,
        news,
      },
      clients: {
        connected: this.streamService.getClientCount(),
      },
      uptime: Date.now() - this.startTime,
    };

    // Add warnings array if any warnings exist
    if (warnings.length > 0) {
      response.warnings = warnings;
    }

    // Per Requirement 5.6: Include flood wait metrics when available
    if (this.floodWaitCounter) {
      try {
        response.floodWait = {
          count24h: this.floodWaitCounter.getCount24h(),
          maxSeconds24h: this.floodWaitCounter.getMaxSeconds24h(),
          consecutiveFailures: this.floodWaitCounter.getConsecutiveFailures(),
        };
      } catch (err) {
        response.warnings = [
          ...(response.warnings ?? []),
          'flood-wait-read-failed',
        ];
        this.logger.warn(
          `FloodWaitCounter read failed: ${(err as Error).message}`,
        );
      }
    }

    // Per Requirement 5.4, 5.5: Set HTTP status code based on service health
    const httpStatus =
      status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
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
    if (!this.feedSourceRepo) {
      this.logger.debug(
        'TelegramFeedSourceRepository not wired - returning empty array',
      );
      return [];
    }

    try {
      const sources = await this.feedSourceRepo.findAllActiveWithTypes();
      return sources.map((s) => ({
        id: s.channelId,
        title: s.title,
        type: s.type === 'crypto-news' ? 'crypto-news' : 'kol',
      }));
    } catch (err) {
      this.logger.warn(
        `Channel registry read failed: ${(err as Error).message}`,
      );
      return [];
    }
  }
}
