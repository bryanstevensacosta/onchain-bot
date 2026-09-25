import { Injectable } from '@nestjs/common';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { toApiKeyView, type ApiKeyRecord, type ApiKeyView } from '../domain/api-key-record';
import { generateApiKey, hashApiKey, isValidScope, keyPrefix, type ApiKeyScope } from '../domain/api-key-scope';

export interface CreateKeyInput {
  readonly name: string;
  readonly scopes: ReadonlyArray<ApiKeyScope>;
  readonly rateLimitPerMin?: number;
  readonly expiresAt?: string | null;
}

export interface CreatedKey {
  /** Plaintext shown EXACTLY ONCE (create/rotate response only). */
  readonly plaintext: string;
  readonly record: ApiKeyRecord;
}

interface StoredEntry extends ApiKeyRecord {
  retiredAt: number | null;
}

/**
 * In-memory API-key store (Tramo 3, todo 10, P46).
 *
 * - Stores ONLY SHA-256 hashes (never plaintext).
 * - Rotation is zero-downtime: the old hash stays valid for the grace
 *   window while the new key is live; both verify until grace expires.
 * - No logs, no responses, no errors ever carry key material — callers
 *   must treat `plaintext` as write-only.
 * - v1 is in-memory (no redeploy needed for rotation: admin endpoint
 *   mutates this store at runtime). Persistence (TypeORM `api_keys`
 *   table, GAP-1) reuses the same record shape.
 */
@Injectable()
export class ApiKeyService {
  private readonly entries = new Map<string, StoredEntry>();

  public async create(input: CreateKeyInput): Promise<CreatedKey> {
    const name = (input.name ?? '').trim();
    if (name === '') {
      throw new Error('Key name is required');
    }
    const scopes = [...input.scopes];
    if (scopes.length === 0 || !scopes.every(isValidScope)) {
      throw new Error('At least one valid scope is required (read|snapshot|admin)');
    }
    const rateLimitPerMin = input.rateLimitPerMin ?? 60;
    if (!Number.isFinite(rateLimitPerMin) || rateLimitPerMin < 1) {
      throw new Error('rateLimitPerMin must be >= 1');
    }
    const plaintext = generateApiKey();
    const now = new Date().toISOString();
    const entry: StoredEntry = {
      id: randomUUID(),
      keyHash: hashApiKey(plaintext),
      keyPrefix: keyPrefix(plaintext),
      name,
      scopes,
      rateLimitPerMin: Math.floor(rateLimitPerMin),
      createdAt: now,
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
      retiredAt: null,
    };
    this.entries.set(entry.id, entry);
    return { plaintext, record: { ...entry, retiredAt: undefined } as ApiKeyRecord };
  }

  public verify(plaintext: string): ApiKeyRecord | null {
    if (typeof plaintext !== 'string' || plaintext === '') {
      return null;
    }
    const candidate = hashApiKey(plaintext);
    const now = Date.now();
    for (const entry of this.entries.values()) {
      if (entry.revokedAt !== null) {
        continue;
      }
      if (entry.retiredAt !== null && now > entry.retiredAt) {
        continue;
      }
      if (entry.expiresAt !== null && Date.now() > Date.parse(entry.expiresAt)) {
        continue;
      }
      const a = Buffer.from(entry.keyHash, 'utf8');
      const b = Buffer.from(candidate, 'utf8');
      if (a.length === b.length && timingSafeEqual(a, b)) {
        return { ...entry };
      }
    }
    return null;
  }

  /** Rotation without redeploy: new key live immediately, old key in grace. */
  public async rotate(id: string, graceMs = 10 * 60 * 1000): Promise<CreatedKey> {
    const current = this.entries.get(id);
    if (!current || current.revokedAt !== null) {
      throw new Error(`Unknown key: ${id}`);
    }
    const created = await this.create({
      name: current.name,
      scopes: [...current.scopes],
      rateLimitPerMin: current.rateLimitPerMin,
      expiresAt: current.expiresAt,
    });
    current.retiredAt = Date.now() + Math.max(0, graceMs);
    return created;
  }

  public revoke(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new Error(`Unknown key: ${id}`);
    }
    this.entries.set(id, { ...entry, revokedAt: new Date().toISOString() });
  }

  public list(): ApiKeyView[] {
    return [...this.entries.values()].map(toApiKeyView);
  }

  public clear(): void {
    this.entries.clear();
  }
}
