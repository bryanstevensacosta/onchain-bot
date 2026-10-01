import { createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * API-key scopes (ai-ml, todo 0).
 *
 * Hierarchy: admin > generate > read. A key holding a higher scope
 * satisfies every lower requirement; nothing is inferred upward.
 */
export type ApiKeyScope = 'read' | 'generate' | 'admin';

export const API_KEY_SCOPES: ReadonlyArray<ApiKeyScope> = [
  'read',
  'generate',
  'admin',
];

const SCOPE_RANK: Record<ApiKeyScope, number> = {
  read: 1,
  generate: 2,
  admin: 3,
};

export function satisfiesScope(
  granted: ReadonlyArray<ApiKeyScope>,
  required: ApiKeyScope,
): boolean {
  const best = Math.max(0, ...granted.map((s) => SCOPE_RANK[s] ?? 0));
  return best >= (SCOPE_RANK[required] ?? Infinity);
}

/**
 * HMAC-SHA256 hex of the presented key peppered with ENCRYPTION_KEY.
 * The plaintext is NEVER persisted: only this hash is stored and
 * compared (timing-safe at the service).
 */
export function hashApiKey(plaintext: string, pepper: string): string {
  return createHmac('sha256', pepper).update(plaintext, 'utf8').digest('hex');
}

/** 256-bit entropy key, `aiml_` prefixed so it is recognizable in headers. */
export function generateApiKey(): string {
  return `aiml_${randomBytes(32).toString('base64url')}`;
}

/**
 * Non-identifying prefix stored alongside the hash for operator display
 * (`aiml_XXXXXX`: 11 chars max, never enough to authenticate).
 */
export function keyPrefix(plaintext: string): string {
  return plaintext.slice(0, 11);
}

export function isValidScope(value: unknown): value is ApiKeyScope {
  return value === 'read' || value === 'generate' || value === 'admin';
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
