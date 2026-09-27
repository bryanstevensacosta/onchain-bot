/**
 * P58 metadata-kind matrix (central metadata BC).
 *
 * RED-first: `metadata-kind.ts` does not exist yet. This spec pins the full
 * getEntity taxonomy (`channel|supergroup|group|user|bot|unknown`), the
 * peer_type projection (`user|chat|channel`, NULL for unknown), and the
 * channel/group-only subscribability rule — parity with the registry
 * `entity-kind.ts` guard, owned here without duplicating its file.
 */
import {
  classifyMetadataKind,
  isSubscribableMetadataKind,
  peerTypeForKind,
  type MetadataKind,
} from './metadata-kind';

describe('metadata-kind matrix (P58)', () => {
  it.each([
    [{ className: 'Channel', broadcast: true }, 'channel'],
    [{ className: 'Channel' }, 'channel'],
    [{ className: 'Channel', megagroup: true }, 'supergroup'],
    [{ className: 'Chat' }, 'group'],
    [{ className: 'User' }, 'user'],
    [{ className: 'User', bot: true }, 'bot'],
  ] as Array<[unknown, MetadataKind]>)(
    'classifies %j as %s',
    (entity, expected) => {
      expect(
        classifyMetadataKind(
          entity as { className?: string; bot?: boolean; megagroup?: boolean },
        ),
      ).toBe(expected);
    },
  );

  it.each([[null], [undefined], [{}], [{ className: 'StickerSet' }]])(
    'classifies %j as unknown (fail-closed identity, rejected downstream)',
    (entity) => {
      expect(classifyMetadataKind(entity as { className?: string })).toBe(
        'unknown',
      );
    },
  );

  it.each([
    ['channel', 'channel'],
    ['supergroup', 'channel'],
    ['group', 'chat'],
    ['user', 'user'],
    ['bot', 'user'],
    ['unknown', null],
  ] as Array<[MetadataKind, 'user' | 'chat' | 'channel' | null]>)(
    'projects kind %s to peer_type %j (schema #2)',
    (kind, expected) => {
      expect(peerTypeForKind(kind)).toBe(expected);
    },
  );

  it.each([['channel'], ['supergroup'], ['group']] as Array<[MetadataKind]>)(
    'kind %s is subscribable',
    (kind) => {
      expect(isSubscribableMetadataKind(kind)).toBe(true);
    },
  );

  it.each([['user'], ['bot'], ['unknown']] as Array<[MetadataKind]>)(
    'kind %s is rejected (user/bot/unknown never subscribed)',
    (kind) => {
      expect(isSubscribableMetadataKind(kind)).toBe(false);
    },
  );
});
