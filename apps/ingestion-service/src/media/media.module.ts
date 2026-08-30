import { Module } from '@nestjs/common';
import { MediaController } from './api/http/media.controller';

/**
 * MediaModule provides HTTP serving for Telegram media files
 * 
 * Per Requirement 4.1, 4.2: Serves photos/videos downloaded by MTProto layer
 * Per Invariant 5: Path-based URLs (/api/media/:channelId/:messageId/:index)
 * 
 * Controllers:
 * - MediaController: GET /api/media/:channelId/:messageId/:index
 * 
 * @module MediaModule
 */
@Module({
  controllers: [MediaController],
})
export class MediaModule {}
