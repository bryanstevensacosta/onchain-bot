import { Controller, Get, Logger } from '@nestjs/common';
import { SSEBroadcastService } from '../../application/services/sse-broadcast.service';
import { BackendChannelProviderService } from '../../../telegram/shared/services/backend-channel-provider.service';
import { BackfillBufferService } from '../../infrastructure/backfill-buffer.service';

/**
 * StreamStatusController exposes operational status of multi-backend broadcast system
 *
 * Per Requirement 8.1: Exposes operational metrics for monitoring
 * Per Requirement 8.2: Real-time status of broadcast system components
 *
 * Endpoints:
 * - GET /api/ingestion/stream/status - System status and metrics
 *
 * @controller Handles /api/ingestion/stream routes
 */
@Controller('api/ingestion/stream')
export class StreamStatusController {
  private readonly logger = new Logger(StreamStatusController.name);

  constructor(
    private readonly sseBroadcast: SSEBroadcastService,
    private readonly channelProvider: BackendChannelProviderService,
    private readonly backfillBuffer: BackfillBufferService,
  ) {}

  /**
   * Get operational status of the broadcast system
   *
   * Returns real-time metrics including:
   * - Number of active backend connections
   * - Size of channel union
   * - Backfill buffer status
   * - MTProto connection status
   * - List of registered backends
   *
   * Per Requirement 8.1: Operational metrics endpoint
   * Per Requirement 8.2: Real-time system status
   *
   * @returns StreamStatusResponse with system metrics
   */
  @Get('status')
  getStatus() {
    const activeBackends = this.sseBroadcast.getActiveBackendCount();
    const channelUnionSize = this.channelProvider.getChannelUnionSize();
    const backfillBufferSize = this.backfillBuffer.getSize();
    const backfillBufferOldestTimestamp =
      this.backfillBuffer.getOldestTimestamp();
    const registeredBackends = this.channelProvider.getRegisteredBackendIds();

    // Note: mtprotoConnected is placeholder - TelegramModule doesn't expose this yet
    // In production, this should query TelegramClientManager.isConnected()
    const mtprotoConnected = true;

    const status = {
      activeBackends,
      channelUnionSize,
      backfillBufferSize,
      backfillBufferOldestTimestamp,
      mtprotoConnected,
      registeredBackends,
      timestamp: new Date().toISOString(),
    };

    this.logger.debug(`Stream status requested: ${JSON.stringify(status)}`);

    return status;
  }
}
