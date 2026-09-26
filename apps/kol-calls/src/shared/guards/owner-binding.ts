import { DomainError, ErrorCode } from '../kernel/domain-error';

/** HTTP header carrying the template/session binding owner (P50). */
export const OWNER_ID_HEADER = 'x-owner-id';

/** Owner stamped on ownerless templates (seed + pre-todo-23 rows). */
export const DEFAULT_OWNER_ID = 'default';

/**
 * Normalizes a raw owner binding value. Blank/non-string input means the
 * caller presented NO binding (null) — distinct from `undefined`, which
 * marks internal direct calls with no HTTP context at all.
 */
export function normalizeOwnerId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Ownership gate for publishing (Tramo 1, todo 23, P50).
 *
 * The binding belongs to the owner who created it: publishing on a template
 * requires presenting that same owner in `x-owner-id`. A foreign binding is
 * a 403 FORBIDDEN (exploit: publishing on somebody else channel binding).
 *
 * - `undefined` requester = internal direct call, no HTTP binding — skip.
 * - `null` requester = HTTP call WITHOUT a binding — FORBIDDEN.
 */
export function assertBindingOwner(
  templateOwnerId: string,
  requesterOwnerId: string | null | undefined,
  templateId: string,
): void {
  if (requesterOwnerId === undefined) return;
  if (requesterOwnerId === null) {
    throw new DomainError(
      ErrorCode.FORBIDDEN,
      'owner binding required (x-owner-id)',
      {
        templateId,
      },
    );
  }
  if (requesterOwnerId !== templateOwnerId) {
    throw new DomainError(
      ErrorCode.FORBIDDEN,
      'foreign template binding (ownership mismatch)',
      {
        templateId,
      },
    );
  }
}
