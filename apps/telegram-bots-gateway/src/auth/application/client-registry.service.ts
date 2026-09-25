import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../shared/kernel/domain-error';
import type { ClientCredential, ClientScope } from '../domain/client-credential';

/**
 * Per-client API-key registry (todo 2, service-to-service auth).
 *
 * Runtime source: `BOTS_GATEWAY_CLIENTS` JSON env
 * (`{"kol-system":{"secret":"…","scopes":["send"]}}`). Empty/absent =
 * keyless dev (guards fail open, kol-system mirror). Tests register
 * clients programmatically via `registerClient()`. Secrets live here
 * only — never logged, never in responses.
 */
@Injectable()
export class ClientRegistryService {
  private readonly clients = new Map<string, ClientCredential>();

  public constructor() {
    for (const cred of ClientRegistryService.parseEnv(
      process.env.BOTS_GATEWAY_CLIENTS,
    )) {
      this.clients.set(cred.id, cred);
    }
  }

  public static parseEnv(raw: string | undefined): ClientCredential[] {
    if (!raw || !raw.trim()) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(
        '[bots-gateway] BOTS_GATEWAY_CLIENTS is not valid JSON ({"id":{"secret":"…","scopes":["send"]}}). Refusing to boot.',
      );
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(
        '[bots-gateway] BOTS_GATEWAY_CLIENTS must be a JSON object keyed by client id.',
      );
    }
    return Object.entries(parsed as Record<string, unknown>).map(
      ([id, value]) => ClientRegistryService.parseEntry(id, value),
    );
  }

  private static parseEntry(id: string, value: unknown): ClientCredential {
    if (!id.trim()) {
      throw new Error('[bots-gateway] BOTS_GATEWAY_CLIENTS has an empty client id.');
    }
    const entry = value as { secret?: unknown; scopes?: unknown };
    if (typeof entry?.secret !== 'string' || !entry.secret) {
      throw new Error(
        `[bots-gateway] BOTS_GATEWAY_CLIENTS client "${id}" needs a non-empty secret.`,
      );
    }
    const scopes = Array.isArray(entry.scopes) ? entry.scopes : [];
    for (const scope of scopes) {
      if (scope !== 'send' && scope !== 'admin') {
        throw new Error(
          `[bots-gateway] BOTS_GATEWAY_CLIENTS client "${id}" has unknown scope "${String(scope)}" (send|admin).`,
        );
      }
    }
    return { id, secret: entry.secret, scopes: scopes as ClientScope[] };
  }

  public isKeyless(): boolean {
    return this.clients.size === 0;
  }

  public findById(id: string): ClientCredential | undefined {
    return this.clients.get(id);
  }

  public registerClient(
    id: string,
    secret: string,
    scopes: readonly ClientScope[],
  ): void {
    if (!id.trim() || !secret) {
      throw new DomainError(ErrorCode.VALIDATION, 'client id and secret are required');
    }
    for (const scope of scopes) {
      if (scope !== 'send' && scope !== 'admin') {
        throw new DomainError(ErrorCode.VALIDATION, `unknown scope "${scope}"`);
      }
    }
    this.clients.set(id, { id, secret, scopes: [...scopes] });
  }

  /** `admin` implies `send`. */
  public hasScope(cred: ClientCredential, required: ClientScope): boolean {
    if (cred.scopes.includes(required)) return true;
    return required === 'send' && cred.scopes.includes('admin');
  }
}
