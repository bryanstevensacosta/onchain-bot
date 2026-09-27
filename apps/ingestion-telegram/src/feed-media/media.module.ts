import { Module } from '@nestjs/common';
import { MediaController } from './api/http/media.controller';
import { SharedModule } from 'core/shared.module';

/**
 * MediaModule provides HTTP serving for Telegram media files
 *
 * Lives at `src/feed-media/` (moved from `src/media/` in the uploads
 * unification; class names kept — see CHANGELOG Unreleased entry).
 *
 * Per Requirement 4.1, 4.2: Serves photos/videos downloaded by MTProto layer
 * Per Invariant 5: Path-based URLs (/api/media/:channelId/:messageId/:index)
 *
 * Controllers:
 * - MediaController: GET /api/media/:channelId/:messageId/:index
 *   (unified home `uploads/feed-media/`, legacy fallback + log)
 *
 * MediaDownloaderService is provided by SharedModule to avoid circular deps
 *
 * @module MediaModule
 */
@Module({
  imports: [SharedModule],
  controllers: [MediaController],
})
export class MediaModule {}
