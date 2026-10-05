/**
 * Delivery targets for feed publishing (Tramo 2, todo 12, P33).
 *
 * A content template addresses one target (`telegram` xor `threads`) or
 * both. The telegram adapters for both targets already exist (todo 7,
 * C2); the template only routes, it never transports.
 */
export type PublishTarget = 'telegram' | 'threads';

export const PUBLISH_TARGETS: ReadonlyArray<PublishTarget> = [
  'telegram',
  'threads',
];

export function isPublishTarget(value: unknown): value is PublishTarget {
  return value === 'telegram' || value === 'threads';
}
