import { createHash, randomBytes } from 'node:crypto';

/**
 * API-key scopes (Tramo 3, todo 10, P46 seguridad).
 *
 * Hierarchy: admin > snapshot > read. A key holding a higher scope
 * satisfies every lower requirement; nothing is inferred upward.
 */
export type ApiKeyScope = 'read' | 'snapshot' | 'admin';

export const API_KEY_SCOPES: ReadonlyArray<ApiKeyScope> = ['read', 'snapshot', 'admin'];

const SCOPE_RANK: Record<ApiKeyScope, number> = {
  read: 1,
  snapshot: 2,
  admin: 3,
};

export function satisfiesScope(granted: ReadonlyArray<ApiKeyScope>, required: ApiKeyScope): boolean {
  const best = Math.max(0, ...granted.map((s) => SCOPE_RANK[s] ?? 0));
  return best >= (SCOPE_RANK[required] ?? Infinity);
}

/**
 * SHA-256 hex of the presented key. The plaintext is NEVER persisted:
 * only this hash is stored and compared (timing-safe at the service).
 */
export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

/** 256-bit entropy key, `md_` prefixed so it is recognizable in headers. */
export function generateApiKey(): string {
  return `md_${randomBytes(32).toString('base64url')}`;
}

/**
 * Non-identifying prefix stored alongside the hash for operator display
 * (`md_XXXXXXXX`: 11 chars max, never enough to authenticate).
 */
export function keyPrefix(plaintext: string): string {
  return plaintext.slice(0, 11);
}

export function isValidScope(value: unknown): value is ApiKeyScope {
  return value === 'read' || value === 'snapshot' || value === 'admin';
}
