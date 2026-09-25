/**
 * KOL avatar constants (Tramo 1, todo 13, P19).
 *
 * Avatars are permanent channel profile photos owned by ingestion-telegram
 * (media-owner invariant): stored under `{uploadsRoot}/avatar/`, served at
 * `GET /api/kol-avatar/:channelId`, projected as `avatarUrl` in
 * `GET /api/feed/sources`. The 72h retention janitor only touches
 * `telegram_feed_messages*` tables + `uploads/feed/media/` — this directory
 * is excluded by construction (pinned by `kol-avatar.janitor.spec.ts`).
 */
export const KOL_AVATAR_DIR_NAME = 'avatar';

export const KOL_AVATAR_FILE_EXTENSION = '.jpg';

export const KOL_AVATAR_CONTENT_TYPE = 'image/jpeg';

export const KOL_AVATAR_PLACEHOLDER_CONTENT_TYPE = 'image/svg+xml';

export const KOL_AVATAR_PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">' +
  '<rect width="96" height="96" rx="48" fill="#1f2937"/>' +
  '<text x="48" y="62" font-family="sans-serif" font-size="44" fill="#9ca3af" text-anchor="middle">?</text>' +
  '</svg>';

/**
 * Public URL for a channel avatar. Always servable: the controller falls
 * back to the placeholder SVG (200) when no photo was fetched.
 */
export function kolAvatarUrlFor(channelId: string): string {
  return `/api/kol-avatar/${channelId}`;
}

/**
 * Filename-safe channel id for avatar storage. Keeps Telegram id chars
 * (`-100…`); hostile ids sanitize to `''` (callers must 400 on empty).
 */
export function sanitizeAvatarChannelId(channelId: string): string {
  return (channelId ?? '').replace(/[^a-zA-Z0-9-]/g, '');
}
