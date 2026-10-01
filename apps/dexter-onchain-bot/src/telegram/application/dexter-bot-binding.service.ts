import { Injectable, Optional } from '@nestjs/common';
import { DexterBotConfigService } from '@/settings/infrastructure/config/bot.config';
import { GatewayHmacSigner } from '@/telegram/infrastructure/gateway/gateway-hmac-signer.service';
import { GatewayBotMappingService } from '@/telegram/infrastructure/gateway/gateway-bot-mapping.service';

export interface GatewayInventoryRow {
  readonly id: string;
  readonly label: string;
  readonly ownerApp: string;
  readonly boundApp: string | null;
  readonly available: boolean;
}

/**
 * Dexter bot binding against the gateway inventory
 * (exclusive-gateway task).
 *
 * Dexter binds its bot FROM the gateway inventory (never by pasting
 * a token into this app): `inventory` lists vault bots with
 * availability, `bindFromInventory` locks one vault bot to
 * `dexter-onchain-bot` (409 when another app holds it) and records
 * the local `dexter` → vault mapping, `unbindFromInventory`
 * releases it. Tokens never cross — only vault ids travel.
 */
@Injectable()
export class DexterBotBindingService {
  private static readonly TIMEOUT_MS = 10_000;
  public static readonly APP_ID = 'dexter-onchain-bot';
  public static readonly LOCAL_ID = 'dexter';

  public constructor(
    @Optional() private readonly botConfig?: DexterBotConfigService,
    @Optional() private readonly signer?: GatewayHmacSigner,
    @Optional() private readonly mapping?: GatewayBotMappingService,
  ) {}

  public async inventory(): Promise<GatewayInventoryRow[]> {
    const path = '/api/bots/inventory';
    const headers: Record<string, string> = {
      ...this.signer?.authHeaders('GET', path, ''),
    };
    const res = await this.fetchWithTimeout(`${this.baseUrl()}${path}`, {
      method: 'GET',
      headers,
    });
    if (!res.ok) {
      throw new Error(`gateway inventory failed (http ${res.status})`);
    }
    const json = (await res.json().catch(() => null)) as unknown;
    if (!Array.isArray(json)) {
      throw new Error('gateway inventory returned no list');
    }
    return json as GatewayInventoryRow[];
  }

  public async bindFromInventory(
    vaultId: string,
  ): Promise<{ ok: boolean; vaultId: string; error: string | null }> {
    const clean = (vaultId ?? '').trim();
    if (!clean) return { ok: false, vaultId: '', error: 'vaultId required' };
    const rawBody = JSON.stringify({ appId: DexterBotBindingService.APP_ID });
    const path = `/api/bots/${encodeURIComponent(clean)}/bind`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...this.signer?.authHeaders('POST', path, rawBody),
    };
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl()}${path}`, {
        method: 'POST',
        headers,
        body: rawBody,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        return {
          ok: false,
          vaultId: clean,
          error: detail || `gateway bind failed (http ${res.status})`,
        };
      }
      this.mapping?.register(DexterBotBindingService.LOCAL_ID, clean);
      return { ok: true, vaultId: clean, error: null };
    } catch (err) {
      return {
        ok: false,
        vaultId: clean,
        error: err instanceof Error ? err.message : 'gateway bind failed',
      };
    }
  }

  public async unbindFromInventory(
    vaultId: string,
  ): Promise<{ ok: boolean; vaultId: string; error: string | null }> {
    const clean = (vaultId ?? '').trim();
    if (!clean) return { ok: false, vaultId: '', error: 'vaultId required' };
    const rawBody = JSON.stringify({});
    const path = `/api/bots/${encodeURIComponent(clean)}/unbind`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...this.signer?.authHeaders('POST', path, rawBody),
    };
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl()}${path}`, {
        method: 'POST',
        headers,
        body: rawBody,
      });
      if (!res.ok) {
        return {
          ok: false,
          vaultId: clean,
          error: `gateway unbind failed (http ${res.status})`,
        };
      }
      return { ok: true, vaultId: clean, error: null };
    } catch (err) {
      return {
        ok: false,
        vaultId: clean,
        error: err instanceof Error ? err.message : 'gateway unbind failed',
      };
    }
  }

  private baseUrl(): string {
    try {
      const raw =
        this.botConfig?.get().botsGatewayBaseUrl ?? 'http://localhost:4070';
      return raw.replace(/\/+$/, '') || 'http://localhost:4070';
    } catch {
      return 'http://localhost:4070';
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      DexterBotBindingService.TIMEOUT_MS,
    );
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
