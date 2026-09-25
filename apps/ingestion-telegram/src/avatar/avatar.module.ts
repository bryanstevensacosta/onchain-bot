import { Module } from '@nestjs/common';
import { SharedModule } from '../core/shared.module';
import { KolAvatarController } from './kol-avatar.controller';
import { KolAvatarService } from './kol-avatar.service';
import { KolAvatarPhotoPort } from './kol-avatar-photo.port';
import { MtprotoAvatarPhotoAdapter } from './mtproto-avatar-photo.adapter';

/**
 * AvatarModule — KOL channel avatars (Tramo 1, todo 13, P19 + P29).
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
