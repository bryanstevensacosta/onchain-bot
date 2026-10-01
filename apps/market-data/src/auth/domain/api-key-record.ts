import type { ApiKeyScope } from './api-key-scope';

/**
 * Stored API-key record (Tramo 3, todo 10, P46).
 *
 * NEVER holds the plaintext: only `keyHash` (SHA-256 hex) plus a short
 * display `keyPrefix`. Sanitized views omit even the hash.
 */
export interface ApiKeyRecord {
  readonly id: string;
  readonly keyHash: string;
  readonly keyPrefix: string;
  readonly name: string;
  readonly scopes: ReadonlyArray<ApiKeyScope>;
  readonly rateLimitPerMin: number;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
}

/** Public view: safe to return from admin endpoints and audit joins. */
export interface ApiKeyView {
  readonly id: string;
  readonly keyPrefix: string;
  readonly name: string;
  readonly scopes: ReadonlyArray<ApiKeyScope>;
  readonly rateLimitPerMin: number;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
}

export function toApiKeyView(record: ApiKeyRecord): ApiKeyView {
  return {
    id: record.id,
    keyPrefix: record.keyPrefix,
    name: record.name,
    scopes: record.scopes,
    rateLimitPerMin: record.rateLimitPerMin,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
  };
}
