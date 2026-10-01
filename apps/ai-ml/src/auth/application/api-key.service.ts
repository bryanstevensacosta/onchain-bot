import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  toApiKeyView,
  type ApiKeyRecord,
  type ApiKeyView,
} from '../domain/api-key-record';
import {
  generateApiKey,
  hashApiKey,
  isValidScope,
  keyPrefix,
  type ApiKeyScope,
} from '../domain/api-key-scope';

export interface CreateKeyInput {
  readonly name: string;
  readonly scopes: ReadonlyArray<ApiKeyScope>;
  readonly rateLimitPerMin?: number;
  readonly expiresAt?: string | null;
}

export interface CreatedKey {
  /** Plaintext shown EXACTLY ONCE (create response only). */
  readonly plaintext: string;
  readonly record: ApiKeyRecord;
}

interface StoredEntry extends ApiKeyRecord {
  retiredAt: number | null;
}

export const MISSING_ENCRYPTION_KEY_MESSAGE =
  'ENCRYPTION_KEY is required but empty (distinct per env — generate with `openssl rand -hex 32`)';

/**
 * In-memory API-key store (ai-ml, todo 0).
 *
 * - Stores ONLY HMAC-SHA256 hashes peppered with ENCRYPTION_KEY (never
 *   plaintext). Without ENCRYPTION_KEY every mutation/verify fails fast
 *   with a clear error (adversarial guard: missing secret is loud,
 *   never silent).
 * - No logs, no responses, no errors ever carry key material — callers
 *   must treat `plaintext` as write-only.
 * - v1 is in-memory (no redeploy needed for rotation: admin endpoint
 *   mutates this store at runtime). Persistence (TypeORM `api_keys`
 *   table) reuses the same record shape.
 */
@Injectable()
export class ApiKeyService {
  private readonly entries = new Map<string, StoredEntry>();

  public constructor(private readonly config: ConfigService) {}

  private pepper(): string {
    const raw = this.config.get<string>('ENCRYPTION_KEY', '').trim();
    if (!raw) {
      throw new Error(MISSING_ENCRYPTION_KEY_MESSAGE);
    }
    return raw;
  }

  public async create(input: CreateKeyInput): Promise<CreatedKey> {
    const pepper = this.pepper();
    const name = (input.name ?? '').trim();
    if (name === '') {
      throw new Error('Key name is required');
    }
    const scopes = [...input.scopes];
    if (scopes.length === 0 || !scopes.every(isValidScope)) {
      throw new Error(
        'At least one valid scope is required (read|generate|admin)',
      );
    }
    const rateLimitPerMin = input.rateLimitPerMin ?? 60;
    if (!Number.isFinite(rateLimitPerMin) || rateLimitPerMin < 1) {
      throw new Error('rateLimitPerMin must be >= 1');
    }
    const plaintext = generateApiKey();
    const now = new Date().toISOString();
    const entry: StoredEntry = {
      id: randomUUID(),
      keyHash: hashApiKey(plaintext, pepper),
      keyPrefix: keyPrefix(plaintext),
      name,
      scopes,
      rateLimitPerMin: Math.floor(rateLimitPerMin),
      createdAt: now,
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
      retiredAt: null,
    };
    this.entries.set(entry.keyHash, entry);
    return { plaintext, record: entry };
  }

  public async verify(plaintext: string): Promise<ApiKeyRecord | null> {
    const pepper = this.pepper();
    const candidate = hashApiKey(plaintext, pepper);
    const now = Date.now();
    for (const entry of this.entries.values()) {
      if (entry.keyHash.length !== candidate.length) {
        continue;
      }
      const match = timingSafeEqual(
        Buffer.from(entry.keyHash),
        Buffer.from(candidate),
      );
      if (!match) {
        continue;
      }
      if (entry.revokedAt !== null) {
        return null;
      }
      if (entry.expiresAt !== null && Date.parse(entry.expiresAt) <= now) {
        return null;
      }
      return entry;
    }
    return null;
  }

  public async revoke(id: string): Promise<boolean> {
    for (const entry of this.entries.values()) {
      if (entry.id === id && entry.revokedAt === null) {
        this.entries.set(entry.keyHash, {
          ...entry,
          revokedAt: new Date().toISOString(),
        });
        return true;
      }
    }
    return false;
  }

  public async list(): Promise<ReadonlyArray<ApiKeyView>> {
    return [...this.entries.values()].map(toApiKeyView);
  }

  public count(): number {
    return this.entries.size;
  }
}
