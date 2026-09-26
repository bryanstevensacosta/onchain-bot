import type { ApiKeyScope } from './api-key-scope';

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
