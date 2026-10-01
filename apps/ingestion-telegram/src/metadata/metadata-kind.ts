/**
 * P58 entity-metadata taxonomy (central `metadata/` BC).
 *
 * SINGLE `client.getEntity()` returns `User|Chat|Channel` (`className`)
 * + the `bot` flag in ONE call (GramJS docs pattern) — no title/name
 * heuristics. Same classification as the registry `entity-kind.ts` guard
 * (parity pinned by `metadata-kind.spec.ts`); owned here so identity
 * taxonomy lives with the metadata table, not the subscription catalog.
 *
 * `MetadataKind` is the fine taxonomy (channel/supergroup/group/user/bot).
 * `MetadataPeerType` is the coarse storage projection from the schema
 * (§1 #2: `user|chat|channel`): channels + supergroups collapse to
 * `channel`, basic groups to `chat`, users + bots to `user`. `unknown`
 * (unresolved/min-shape) projects to NULL — the row stays fail-open.
 */
export type MetadataPeerType = 'user' | 'chat' | 'channel';

export type MetadataKind =
  | 'channel'
  | 'supergroup'
  | 'group'
  | 'user'
  | 'bot'
  | 'unknown';

/** Kinds the ingestion listener can subscribe to. */
export const SUBSCRIBABLE_METADATA_KINDS: ReadonlyArray<MetadataKind> = [
  'channel',
  'supergroup',
  'group',
];

/** Fetch outcome bookkeeping (schema §2 `fetch_status`). */
export type MetadataFetchStatus = 'ok' | 'min' | 'miss' | 'flood';

interface GramjsEntityShape {
  readonly className?: string;
  readonly bot?: boolean;
  readonly broadcast?: boolean;
  readonly megagroup?: boolean;
}

/**
 * Classify a GramJS entity by its real taxonomy.
 *
 * `instanceof`/`className` + `bot` flag only — never title heuristics.
 */
export function classifyMetadataKind(
  entity: GramjsEntityShape | null | undefined,
): MetadataKind {
  const className = entity?.className;
  if (className === 'Channel') {
    if (entity?.megagroup === true) {
      return 'supergroup';
    }
    return 'channel';
  }
  if (className === 'Chat') {
    return 'group';
  }
  if (className === 'User') {
    return entity?.bot === true ? 'bot' : 'user';
  }
  return 'unknown';
}

/**
 * Coarse storage projection for the `peer_type` column (schema §1 #2).
 *
 * `unknown` (unresolved) projects to NULL — the row persists fail-open
 * and the register guard skips the kind check until MTProto resolves it.
 */
export function peerTypeForKind(kind: MetadataKind): MetadataPeerType | null {
  if (kind === 'channel' || kind === 'supergroup') {
    return 'channel';
  }
  if (kind === 'group') {
    return 'chat';
  }
  if (kind === 'user' || kind === 'bot') {
    return 'user';
  }
  return null;
}

/**
 * Channel/group-only rule for register/subscribe paths.
 *
 * Mirrors the registry guard: user/bot/unknown are never subscribed.
 * Returns a boolean (callers throw their own 400 with context).
 */
export function isSubscribableMetadataKind(kind: MetadataKind): boolean {
  return SUBSCRIBABLE_METADATA_KINDS.includes(kind);
}
