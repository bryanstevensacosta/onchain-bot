import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  BOT_USERNAME_PATTERN,
  DexterBotConfigService,
} from '@/settings/infrastructure/config/bot.config';
import { GatewayBotMappingService } from '@/gateway/infrastructure/gateway/gateway-bot-mapping.service';
import { GatewayHmacSigner } from '@/gateway/infrastructure/gateway/gateway-hmac-signer.service';

/** Bot API `getMe` budget: one HTTPS GET, then the chain moves on. */
export const BOT_IDENTITY_TIMEOUT_MS = 5_000;

/**
 * White-label bot identity (plan todo 11 hybrid design, todo 12
 * profile source).
 *
 * HOME: `settings/` — identity is bot self-config, a sibling of
 * `DexterBotConfigService`. `gateway/` is message transport (sends,
 * ingress, vault mapping); identity is consumed by the template
 * renderer, never by a send path, so it does not belong there.
 *
 * Resolves ONCE at bootstrap (`onApplicationBootstrap`, never
 * blocking boot — every step is fail-open with a catch-all per
 * source): bound-vault `GET /api/bots/:id/profile` `username` →
 * Bot API `getMe` with `DEXTER_BOT_TOKEN` (one fetch, 5 s timeout,
 * token never logged) → `BOT_USERNAME` env → `""`. Warns (never
 * throws) when the env var is set but disagrees with a live source.
 *
 * PROFILE SOURCE (todo 12, replaces the todo-11 inventory probe,
 * deleted — the inventory shape is
 * `{ id, label, ownerApp, boundApp, available }` with NO `username`
 * by design, so that probe always skipped): the vault id comes from
 * the EXISTING local mapping — `GatewayBotMappingService`
 * (`'dexter'` label, same getter the sender uses) with the
 * `DEXTER_BOT_VAULT_ID` config fallback (same order as
 * `TelegramBotClient.resolveVaultId`). Unmapped + no vault id →
 * null immediately, zero network.
 *
 * CLIENT CHOICE (documented): `GatewaySendClient` only POSTs sends
 * (`/api/bots/:id/send`, no GET support), so reusing it for a
 * profile GET would shoehorn a read through a send-only client.
 * Instead this service does a minimal signed GET mirroring
 * `DexterBotBindingService.inventory()` (same `GatewayHmacSigner`
 * `authHeaders('GET', path, '')` + same base URL, `send` scope —
 * the profile endpoint the sender already holds). NO gateway code
 * was added or changed. Avatar ignored — `username` only.
 *
 * In-memory cache, no refresh loops, no MTProto/gramjs (explicitly
 * out — a full MTProto session to replace one HTTPS GET is overkill;
 * dexter stays Bot-API-only by design).
 */
@Injectable()
export class BotIdentityService {
  private readonly logger = new Logger(BotIdentityService.name);
  private username = '';
  private resolved = false;

  public constructor(
    private readonly botConfig: DexterBotConfigService,
    @Inject(GatewayBotMappingService)
    @Optional()
    private readonly mapping?: GatewayBotMappingService | null,
    @Inject(GatewayHmacSigner)
    @Optional()
    private readonly signer?: GatewayHmacSigner | null,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      this.username = await this.resolve();
    } catch (err) {
      this.logger.warn(
        `Bot identity resolution failed — deep-link keys render "": ${err instanceof Error ? err.message : 'unknown'}`,
      );
      this.username = '';
    }
    this.resolved = true;
  }

  public getUsername(): string {
    return this.username;
  }

  public isResolved(): boolean {
    return this.resolved;
  }

  private async resolve(): Promise<string> {
    const env = this.botConfig.get().botUsername;
    const live =
      (await this.fromBoundVaultProfile()) ?? (await this.fromGetMe());
    if (live) {
      if (env && live.toLowerCase() !== env.toLowerCase()) {
        this.logger.warn(
          `BOT_USERNAME disagrees with the live bot username — using the live value (env kept as fallback)`,
        );
      }
      return live;
    }
    return env;
  }

  /**
   * Bound-vault profile `username` (same vault resolution as the
   * sender: local `'dexter'` mapping first, `DEXTER_BOT_VAULT_ID`
   * config fallback). Unmapped + no vault id → null immediately,
   * zero network. 403/404/timeout/invalid shape → null with a warn
   * (fail-open — the chain moves on to `getMe`).
   */
  private async fromBoundVaultProfile(): Promise<string | null> {
    const vaultId = this.resolveVaultId();
    if (!vaultId) {
      this.logger.warn(
        'No bound gateway vault for dexter — skipping (getMe next)',
      );
      return null;
    }
    const path = `/api/bots/${encodeURIComponent(vaultId)}/profile`;
    let baseUrl = 'http://localhost:4070';
    try {
      baseUrl = this.botConfig.get().botsGatewayBaseUrl || baseUrl;
    } catch {
      this.logger.warn(
        'Bot config unreadable for the gateway base URL — using localhost:4070 (getMe next on failure)',
      );
    }
    const headers: Record<string, string> = {
      ...this.signer?.authHeaders('GET', path, ''),
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BOT_IDENTITY_TIMEOUT_MS);
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(
          `Bound vault profile unreachable (http ${res.status}) — skipping (getMe next)`,
        );
        return null;
      }
      const json = (await res.json().catch(() => null)) as {
        username?: unknown;
        result?: { username?: unknown };
      } | null;
      const raw = json?.username ?? json?.result?.username;
      if (
        typeof raw === 'string' &&
        raw.trim() &&
        BOT_USERNAME_PATTERN.test(raw.trim())
      ) {
        return raw.trim();
      }
      this.logger.warn(
        'Bound vault profile returned no username — skipping (getMe next)',
      );
      return null;
    } catch (err) {
      this.logger.warn(
        `Bound vault profile unreachable — skipping (getMe next): ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Vault resolution mirroring `TelegramBotClient.resolveVaultId`
   * (single source of truth for "which vault is bound"): the local
   * `'dexter'` → vault mapping first, `DEXTER_BOT_VAULT_ID` config
   * fallback. `''` = unbound.
   */
  private resolveVaultId(): string {
    const mapped = this.mapping?.resolveGatewayId('dexter') ?? 'dexter';
    if (mapped !== 'dexter') return mapped;
    try {
      return this.botConfig.get().botVaultId ?? '';
    } catch {
      return '';
    }
  }

  private async fromGetMe(): Promise<string | null> {
    const token = this.botConfig.get().botToken;
    if (!token) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BOT_IDENTITY_TIMEOUT_MS);
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(
          `Bot API getMe failed (http ${res.status}) — skipping (env next)`,
        );
        return null;
      }
      const json = (await res.json().catch(() => null)) as {
        result?: { username?: unknown };
      } | null;
      const username = json?.result?.username;
      if (
        typeof username === 'string' &&
        username &&
        BOT_USERNAME_PATTERN.test(username)
      ) {
        return username;
      }
      this.logger.warn(
        'Bot API getMe returned no username — skipping (env next)',
      );
      return null;
    } catch (err) {
      this.logger.warn(
        `Bot API getMe unreachable — skipping (env next): ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
