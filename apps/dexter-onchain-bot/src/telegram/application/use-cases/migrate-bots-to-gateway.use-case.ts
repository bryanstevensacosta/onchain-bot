import { Injectable } from '@nestjs/common';
import { DexterBotConfigService } from '../../../settings/infrastructure/config/bot.config';
import { GatewayHmacSigner } from '../../infrastructure/gateway/gateway-hmac-signer.service';
import { GatewayBotMappingService } from '../../infrastructure/gateway/gateway-bot-mapping.service';

export interface DexterGatewayMigrationResult {
  readonly migrated: Array<{
    readonly localId: string;
    readonly gatewayId: string;
    readonly label: string;
  }>;
  readonly failed: Array<{
    readonly localId: string;
    readonly label: string;
    readonly reason: string;
  }>;
}

/**
 * Env-token → vault migration (telegram-bots-gateway todo 6).
 *
 * The single dexter bot token (`DEXTER_BOT_TOKEN`, legacy
 * `CHAIN_DEXTER_BOT_TOKEN` fallback) is registered into the gateway
 * vault (`POST /api/vault/bots`, `admin` scope, HMAC-signed,
 * `ownerApp: 'dexter-onchain-bot'`) — the gateway re-encrypts with its
 * own `ENCRYPTION_KEY` before persisting, so the token is plaintext
 * ONLY inside the TLS request body, never at rest outside a vault,
 * never in logs (only labels/ids are recorded here). The local label
 * `dexter` → vault id pair is stored in `GatewayBotMappingService`.
 * Missing token fails per-bot without touching the gateway;
 * already-mapped labels are skipped (no duplicate vault entries).
 */
@Injectable()
export class MigrateBotsToGatewayUseCase {
  private static readonly TIMEOUT_MS = 10_000;
  public static readonly LOCAL_ID = 'dexter';

  public constructor(
    private readonly botConfig: DexterBotConfigService,
    private readonly signer: GatewayHmacSigner,
    private readonly mapping: GatewayBotMappingService,
  ) {}

  public async execute(): Promise<DexterGatewayMigrationResult> {
    const cfg = this.botConfig.get();
    const localId = MigrateBotsToGatewayUseCase.LOCAL_ID;
    if (this.mapping.resolveGatewayId(localId) !== localId) {
      return { migrated: [], failed: [] };
    }
    if (!cfg.botToken) {
      return {
        migrated: [],
        failed: [
          {
            localId,
            label: localId,
            reason: 'DEXTER_BOT_TOKEN not configured — nothing to migrate',
          },
        ],
      };
    }
    try {
      const gatewayId = await this.registerRemote(localId, cfg.botToken);
      this.mapping.register(localId, gatewayId);
      return { migrated: [{ localId, gatewayId, label: localId }], failed: [] };
    } catch (err) {
      return {
        migrated: [],
        failed: [
          {
            localId,
            label: localId,
            reason:
              err instanceof Error ? err.message : 'gateway register failed',
          },
        ],
      };
    }
  }

  private async registerRemote(label: string, token: string): Promise<string> {
    const rawBody = JSON.stringify({
      label,
      token,
      ownerApp: 'dexter-onchain-bot',
    });
    const path = '/api/vault/bots';
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...this.signer.authHeaders('POST', path, rawBody),
    };
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      MigrateBotsToGatewayUseCase.TIMEOUT_MS,
    );
    try {
      const res = await fetch(
        `${this.botConfig.get().botsGatewayBaseUrl}${path}`,
        {
          method: 'POST',
          headers,
          body: rawBody,
          signal: controller.signal,
        },
      );
      const json = (await res.json().catch(() => null)) as {
        id?: unknown;
        message?: unknown;
      } | null;
      if (!res.ok || typeof json?.id !== 'string' || !json.id) {
        throw new Error(
          typeof json?.message === 'string'
            ? json.message
            : `gateway vault register failed (http ${res.status})`,
        );
      }
      return json.id;
    } finally {
      clearTimeout(timer);
    }
  }
}
