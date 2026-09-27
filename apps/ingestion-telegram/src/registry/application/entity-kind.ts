import { BadRequestException } from '@nestjs/common';

/**
 * P57/P57-bis entity-kind taxonomy (central todo 11).
 *
 * SINGLE `client.getEntity()` returns `User|Chat|Channel` (`className`)
 * + the `bot` flag in ONE call (GramJS docs pattern) — no title/name
 * heuristics. `avatar/` photo fetch stays a separate call (todo 12).
 */
export type TelegramEntityKind =
  | 'channel'
  | 'supergroup'
  | 'group'
  | 'user'
  | 'bot'
  | 'unknown';

/** Kinds the ingestion listener can subscribe to. */
export const SUBSCRIBABLE_KINDS: ReadonlyArray<TelegramEntityKind> = [
  'channel',
  'supergroup',
  'group',
];

const REJECTED_KINDS: ReadonlyArray<TelegramEntityKind> = [
  'user',
  'bot',
  'unknown',
];

interface GramjsEntityShape {
  readonly className?: string;
  readonly bot?: boolean;
  readonly broadcast?: boolean;
  readonly megagroup?: boolean;
}

/**
 * Classify a GramJS entity by its real taxonomy.
 *
 * Per Requirement P57-bis: `instanceof`/`className` + `bot` flag only.
 */
export function classifyEntityKind(
  entity: GramjsEntityShape | null | undefined,
): TelegramEntityKind {
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
 * Channel/group-only guard for register/batch/subscribe paths.
 *
 * @throws BadRequestException (explicit 400) for user/bot/unknown.
 */
export function assertSubscribableKind(
  kind: TelegramEntityKind,
  rawInput: string,
): void {
  if (REJECTED_KINDS.includes(kind)) {
    throw new BadRequestException(
      `Cannot subscribe to ${kind} "${rawInput}": only Telegram channels and groups can be registered as feed sources (bots and users are rejected).`,
    );
  }
}

/**
 * Normalize a resolve input (`@handle` | numeric id | `t.me/…` URL) into
 * the single string `client.getEntity()` accepts.
 *
 * @throws BadRequestException on empty input or invite (`+hash`) links.
 */
export function normalizeResolveInput(input: string): string {
  const trimmed = (input ?? '').trim();
  if (trimmed.length === 0) {
    throw new BadRequestException(
      'input cannot be empty: expected @handle, numeric id, or t.me URL',
    );
  }
  const withoutScheme = trimmed
    .replace(/^https?:\/\//i, '')
    .replace(/^telegram\.me\//i, '')
    .replace(/^t\.me\//i, '');
  const segment = withoutScheme.split(/[?#/]/)[0]?.trim() ?? '';
  if (segment.length === 0) {
    throw new BadRequestException(
      `Cannot parse resolve input "${trimmed}": expected @handle, numeric id, or t.me URL`,
    );
  }
  if (segment.startsWith('+')) {
    throw new BadRequestException(
      `Cannot resolve invite link "${trimmed}": join the channel first, then resolve its @handle or id`,
    );
  }
  if (/^-?\d+$/.test(segment)) {
    return segment;
  }
  return segment.startsWith('@') ? segment : `@${segment}`;
}
