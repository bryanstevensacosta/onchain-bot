import { Module } from '@nestjs/common';
import { SharedModule } from '../core/shared.module';
import { KolAvatarController } from './kol-avatar.controller';
import { KolAvatarService } from './kol-avatar.service';
import { KolAvatarPhotoPort } from './kol-avatar-photo.port';
import { MtprotoAvatarPhotoAdapter } from './mtproto-avatar-photo.adapter';

/**
 * AvatarModule — KOL channel avatars (Tramo 1, todo 13, P19 + P29).
 *
 * @deprecated P58: ownership moved to `MetadataModule`
 * (`src/metadata/`, canonical `GET /api/metadata/:channelId/avatar`).
 * Kept during dual-write so `GET /api/kol-avatar/*` stays servable with
 * deprecation headers; RetentionModule still imports it for the
 * `RegisterNewsSourceUseCase` fetch-once hook. DELETION after staging is
 * green (schema §4 step 5) — do not add new providers/consumers here.
 *
 * Owner of `uploads/avatar/` (permanent, janitor-excluded) +
 * `GET /api/kol-avatar/:channelId` + `avatarUrl` projection support.
 * Reuses SharedModule (client manager, peer resolver, flood guard, source
 * repository) — no own limiter, no own MTProto client (media-owner
 * invariant: one MTProto session per instance lives in SharedModule).
 */
@Module({
  imports: [SharedModule],
  controllers: [KolAvatarController],
  providers: [
    KolAvatarService,
    {
      provide: KolAvatarPhotoPort,
      useClass: MtprotoAvatarPhotoAdapter,
    },
  ],
  exports: [KolAvatarService, KolAvatarPhotoPort],
})
export class AvatarModule {}
