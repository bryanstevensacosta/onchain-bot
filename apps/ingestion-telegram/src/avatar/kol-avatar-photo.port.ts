/**
 * Outbound port for KOL channel profile-photo bytes (Tramo 1, todo 13, P19).
 *
 * @deprecated P58: absorbed by `MetadataPhotoPort`
 * (`src/metadata/metadata-photo.port.ts`, same contract). This port stays
 * wired during dual-write; new code depends on the metadata port.
 *
 * Production implementation resolves the photo over MTProto
 * (`MtprotoAvatarPhotoAdapter`, serialized + flood-guard protected per P29).
 * Returns `null` when the channel has no photo, the session is unavailable,
 * or Telegram rejects the fetch — the service then serves the placeholder
 * (MTProto failure → placeholder + deferred explicit retry, never a throw).
 */
export abstract class KolAvatarPhotoPort {
  public abstract fetchChannelPhoto(channelId: string): Promise<Buffer | null>;
}
