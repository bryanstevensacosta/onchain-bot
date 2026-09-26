import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TemplateBotRepository } from '../../../template/domain/ports/template-bot.repository';
import { TemplateEncryptionService } from '../../../template/application/services/template-encryption.service';
import { GatewayHmacSigner } from '../../infrastructure/gateway/gateway-hmac-signer.service';
import { GatewayBotMappingService } from '../../infrastructure/gateway/gateway-bot-mapping.service';
import type { TelegramConfig } from '../../../shared/config/telegram.config';

export interface GatewayMigrationResult {
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
 * Catalog + env-bot migration into the gateway vault
 * (telegram-bots-gateway todo 5).
 *
 * Each local `TemplateBot` entry is decrypted with the
 * `TemplateEncryptionService` and re-registered into the gateway vault
 * (`POST /api/vault/bots`, `admin` scope, HMAC-signed) — the gateway
 * re-encrypts with its own `ENCRYPTION_KEY` before persisting, so the
 * token is plaintext ONLY inside the TLS request body, never at rest
 * outside a vault, never in logs (only labels/ids are recorded here).
 * The crypto/threads env bots migrate the same way (plaintext read from
 * env, never logged). Tampered ciphertext fails per-bot without
 * touching the gateway. Already-mapped bots are skipped (no duplicate
 * vault entries per boot).
 */
@Injectable()
export class MigrateBotsToGatewayUseCase {
  private static readonly TIMEOUT_MS = 10_000;

  public constructor(
    private readonly bots: TemplateBotRepository,
    private readonly encryption: TemplateEncryptionService,
    private readonly signer: GatewayHmacSigner,
    private readonly mapping: GatewayBotMappingService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  public async execute(): Promise<GatewayMigrationResult> {
    const migrated: GatewayMigrationResult['migrated'] = [];
    const failed: GatewayMigrationResult['failed'] = [];
    const rows = await this.bots.list();
    for (const bot of rows) {
      if (this.mapping.resolveGatewayId(bot.id) !== bot.id) {
        continue;
      }
      let plaintext: string;
      try {
        plaintext = this.encryption.decrypt(bot.tokenCiphertext);
      } catch (err) {
        failed.push({
          localId: bot.id,
          label: bot.label,
          reason: err instanceof Error ? err.message : 'decrypt failed',
        });
        continue;
      }
      try {
        const gatewayId = await this.registerRemote(bot.label, plaintext);
        this.mapping.register(bot.id, gatewayId);
        migrated.push({ localId: bot.id, gatewayId, label: bot.label });
      } catch (err) {
        failed.push({
          localId: bot.id,
          label: bot.label,
          reason:
            err instanceof Error ? err.message : 'gateway register failed',
        });
      }
    }
    await this.migrateEnvBot(
      'CRYPTO_NEWS_BOT_TOKEN',
      'crypto-news',
      migrated,
      failed,
    );
    await this.migrateEnvBot('THREADS_BOT_TOKEN', 'threads', migrated, failed);
    return { migrated, failed };
  }

  private async migrateEnvBot(
    tokenEnvName: string,
    label: string,
    migrated: GatewayMigrationResult['migrated'],
    failed: GatewayMigrationResult['failed'],
  ): Promise<void> {
    const localId = `env:${tokenEnvName}`;
    if (this.mapping.resolveGatewayId(localId) !== localId) {
      return;
    }
    let token = '';
    try {
      const flatName =
        tokenEnvName === 'THREADS_BOT_TOKEN'
          ? 'THREADS_BOT_TOKEN'
          : 'CRYPTO_NEWS_BOT_TOKEN';
      const flat = this.config?.get<string>(flatName, '') ?? '';
      if (flat.trim()) {
        token = flat.trim();
      } else {
        const cfg = this.config?.get<TelegramConfig>('telegram');
        token =
          tokenEnvName === 'THREADS_BOT_TOKEN'
            ? (cfg?.threadsBotToken ?? '')
            : (cfg?.feedBotToken ?? '');
      }
    } catch {
      token = '';
    }
    if (!token.trim()) {
      return;
    }
    try {
      const gatewayId = await this.registerRemote(label, token.trim());
      this.mapping.register(localId, gatewayId);
      migrated.push({ localId, gatewayId, label });
    } catch (err) {
      failed.push({
        localId,
        label,
        reason: err instanceof Error ? err.message : 'gateway register failed',
      });
    }
  }

  private gateway(): { baseUrl: string } {
    try {
      const flat = this.config?.get<string>('BOTS_GATEWAY_URL', '') ?? '';
      const raw =
        (flat.trim() ||
          this.config?.get<TelegramConfig>('telegram')?.botsGateway?.baseUrl) ??
        'http://localhost:4070';
      return { baseUrl: raw.replace(/\/+$/, '') || 'http://localhost:4070' };
    } catch {
      return { baseUrl: 'http://localhost:4070' };
    }
  }

  private async registerRemote(label: string, token: string): Promise<string> {
    const rawBody = JSON.stringify({
      label,
      token,
      ownerApp: 'feed-publisher',
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
      const res = await fetch(`${this.gateway().baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: rawBody,
        signal: controller.signal,
      });
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
