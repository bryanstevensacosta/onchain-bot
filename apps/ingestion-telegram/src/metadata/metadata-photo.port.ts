/**
 * Outbound port for channel profile-photo bytes (P58 central metadata BC).
 *
 * Absorbed from `KolAvatarPhotoPort` (`src/avatar/`, now deprecated):
 * same contract — `fetchChannelPhoto` → `Buffer|null`, never throws.
 * Production implementation resolves the photo over MTProto
 * (`MtprotoMetadataPhotoAdapter`, serialized + flood-guard protected per
 * P29). Returns `null` when the channel has no photo, the session is
 * unavailable, or Telegram rejects the fetch — the service then serves
 * the placeholder (MTProto failure → placeholder + deferred explicit
 * retry, never a throw).
 */
export abstract class MetadataPhotoPort {
  public abstract fetchChannelPhoto(channelId: string): Promise<Buffer | null>;
}
