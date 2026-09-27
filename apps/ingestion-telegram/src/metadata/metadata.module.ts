import { Module } from '@nestjs/common';
import { SharedModule } from '../core/shared.module';
import { MetadataController } from './metadata.controller';
import { MetadataService } from './metadata.service';
import { MetadataPhotoPort } from './metadata-photo.port';
import { MtprotoMetadataPhotoAdapter } from './mtproto-metadata-photo.adapter';

/**
 * MetadataModule — central channel-metadata BC (P58, absorbs `avatar/`).
 *
 * Owner of `telegram_channel_metadata` (identity per id: kind/handle/
 * phone-if-present/photo/url/type) + `{uploadsRoot}/avatar/` (permanent
 * profile-photo files, janitor-excluded) + the canonical routes
 * (`GET /api/metadata/:id`, `GET /api/metadata/:id/avatar`, refresh,
 * backfill).
 *
 * Reuses SharedModule (MTProto client manager, peer resolver, flood guard,
 * `MetadataRepository`, source repository) — no own limiter, no own MTProto
 * client (media-owner invariant: one MTProto session per instance lives in
 * SharedModule). Imported by RetentionModule so the registry use-case and
 * sources controller resolve `MetadataService` for dual-write.
 */
@Module({
  imports: [SharedModule],
  controllers: [MetadataController],
  providers: [
    MetadataService,
    {
      provide: MetadataPhotoPort,
      useClass: MtprotoMetadataPhotoAdapter,
    },
  ],
  exports: [MetadataService, MetadataPhotoPort],
})
export class MetadataModule {}
