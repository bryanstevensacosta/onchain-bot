/**
 * Metadata constants (P58 central `metadata/` BC).
 *
 * The avatar directory has ONE owner: this module re-exports the avatar
 * constants (no second dir name, no second extension — the no-dup pin in
 * `metadata-no-dup.spec.ts` asserts the identity). Files still live under
 * `{uploadsRoot}/avatar/`; ownership moved from `src/avatar/` here, the
 * old paths stay servable with deprecation headers until staging is green
 * (deletion after, schema §4 step 5).
 */
import {
  KOL_AVATAR_CONTENT_TYPE,
  KOL_AVATAR_DIR_NAME,
  KOL_AVATAR_FILE_EXTENSION,
  KOL_AVATAR_PLACEHOLDER_CONTENT_TYPE,
  KOL_AVATAR_PLACEHOLDER_SVG,
  avatarFileNameFor,
  kolAvatarUrlFor,
  sanitizeAvatarChannelId,
  sanitizeAvatarHandle,
  sourceUrlFor,
} from '../avatar/avatar.constants';

export const METADATA_AVATAR_DIR_NAME = KOL_AVATAR_DIR_NAME;

export const METADATA_AVATAR_FILE_EXTENSION = KOL_AVATAR_FILE_EXTENSION;

export const METADATA_AVATAR_CONTENT_TYPE = KOL_AVATAR_CONTENT_TYPE;

export const METADATA_AVATAR_PLACEHOLDER_CONTENT_TYPE =
  KOL_AVATAR_PLACEHOLDER_CONTENT_TYPE;

export const METADATA_AVATAR_PLACEHOLDER_SVG = KOL_AVATAR_PLACEHOLDER_SVG;

export {
  avatarFileNameFor,
  kolAvatarUrlFor,
  sanitizeAvatarChannelId,
  sanitizeAvatarHandle,
  sourceUrlFor,
};

/**
 * Canonical (successor) avatar URL owned by metadata.
 */
export function metadataAvatarUrlFor(channelId: string): string {
  return `/api/metadata/${channelId}/avatar`;
}

/**
 * Deprecation headers for the old `/api/kol-avatar/*` paths (P58 §5).
 *
 * The old routes keep serving bytes (200) — these headers are the only
 * behavior change: `Deprecation: true` + `Sunset` (deletion after staging
 * green) + `Link: <successor>; rel='successor-version'` (redirect note).
 */
export const METADATA_AVATAR_DEPRECATION_SUNSET =
  'Thu, 31 Dec 2026 23:59:59 GMT';

export function avatarDeprecationHeaders(channelId: string): {
  Deprecation: string;
  Sunset: string;
  Link: string;
} {
  return {
    Deprecation: 'true',
    Sunset: METADATA_AVATAR_DEPRECATION_SUNSET,
    Link: `<${metadataAvatarUrlFor(channelId)}>; rel='successor-version'`,
  };
}
