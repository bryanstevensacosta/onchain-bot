import { Injectable } from '@nestjs/common';

/**
 * AvatarResolver — optional caller-avatar port for template rankings (P51).
 *
 * Pre-split this was `KolAvatarResolverService` (ingestion module,
 * kol-calls side). The publisher owns no MTProto/avatar storage, so
 * rankings carry `avatarUrl: null` unless an adapter is provided
 * (dashboard renders the placeholder fallback). A kol-calls
 * HTTP-backed adapter (`GET /api/feed/sources?type=kol` projection)
 * is the follow-up; the port shape stays `resolveMany`.
 */
export abstract class AvatarResolver {
  public abstract resolveMany(
    callers: ReadonlyArray<string>,
  ): Promise<Record<string, string>>;
}

/** Default: no avatars (placeholder fallback downstream). */
@Injectable()
export class NoopAvatarResolver extends AvatarResolver {
  public async resolveMany(): Promise<Record<string, string>> {
    return {};
  }
}
