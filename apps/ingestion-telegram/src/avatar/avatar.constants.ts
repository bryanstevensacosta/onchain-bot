/**
 * KOL avatar constants (Tramo 1, todo 13, P19).
 *
 * Avatars are permanent channel profile photos owned by ingestion-telegram
 * (media-owner invariant): stored under `{uploadsRoot}/avatar/`, served at
 * `GET /api/kol-avatar/:channelId`, projected as `avatarUrl` in
 * `GET /api/feed/sources`. The 72h retention janitor only touches
 * `telegram_feed_messages*` tables + `uploads/feed-media/` — this directory
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
 * Handle-safe part of an avatar filename. Telegram usernames are
 * `[a-zA-Z0-9_]` (5-32 chars); anything else is stripped, leading `@`
 * tolerated. Empty (no handle / hostile handle) → `''` (caller falls
 * back to the legacy bare filename).
 */
export function sanitizeAvatarHandle(
  handle: string | null | undefined,
): string {
  const withoutAt = (handle ?? '').trim().replace(/^@+/, '');
  return withoutAt.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);
}

/**
 * Avatar filename for a channel (central todo 12, P57).
 *
 * - With a known handle: `{sanitizedChannelId}__{sanitizedHandle}.jpg`
 * - Without: legacy bare `{sanitizedChannelId}.jpg` (never-update: old
 *   rows keep serving until the migration renames them).
 *
 * The channel-id prefix keeps filenames unique across channels, so two
 * handles that sanitize identically can only collide within ONE channel
 * (deduped to a single file by the service — no-dup).
 */
export function avatarFileNameFor(
  channelId: string,
  handle?: string | null,
): string {
  const cleanHandle = sanitizeAvatarHandle(handle ?? null);
  const suffix = cleanHandle.length > 0 ? `__${cleanHandle}` : '';
  return `${sanitizeAvatarChannelId(channelId)}${suffix}${KOL_AVATAR_FILE_EXTENSION}`;
}

/**
 * Public t.me URL for a source row (central todo 12, P57).
 *
 * Handle-bearing channels link to `https://t.me/<handle>`; private
 * channels without a handle have no public link → `null` (column stays
 * NULL, never a guessed URL).
 */
export function sourceUrlFor(handle: string | null | undefined): string | null {
  const clean = sanitizeAvatarHandle(handle ?? null);
  return clean.length > 0 ? `https://t.me/${clean}` : null;
}

/**
 * Filename-safe channel id for avatar storage. Keeps Telegram id chars
 * (`-100…`); hostile ids sanitize to `''` (callers must 400 on empty).
 */
export function sanitizeAvatarChannelId(channelId: string): string {
  return (channelId ?? '').replace(/[^a-zA-Z0-9-]/g, '');
}
