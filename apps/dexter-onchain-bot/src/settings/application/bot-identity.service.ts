import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  BOT_USERNAME_PATTERN,
  DexterBotConfigService,
} from '@/settings/infrastructure/config/bot.config';
import { DexterBotBindingService } from '@/gateway/application/dexter-bot-binding.service';

/** Bot API `getMe` budget: one HTTPS GET, then the chain moves on. */
export const BOT_IDENTITY_TIMEOUT_MS = 5_000;

/**
 * White-label bot identity (plan todo 11, hybrid design).
 *
 * HOME: `settings/` — identity is bot self-config, a sibling of
 * `DexterBotConfigService`. `gateway/` is message transport (sends,
 * ingress, vault mapping); identity is consumed by the template
 * renderer, never by a send path, so it does not belong there.
 *
 * Resolves ONCE at bootstrap (`onApplicationBootstrap`, never
 * blocking boot — every step is fail-open with a catch-all per
 * source): gateway inventory bound-bot `username` → Bot API `getMe`
 * with `DEXTER_BOT_TOKEN` (one fetch, 5 s timeout, token never
 * logged) → `BOT_USERNAME` env → `""`. Warns (never throws) when
 * the env var is set but disagrees with a live source.
 *
 * FINDING (verified read-only): the gateway inventory shape is
 * `{ id, label, ownerApp, boundApp, available }`
 * (`BotBindingService.inventory()` via `GET /api/bots/inventory`) —
 * it exposes NO `username` (usernames live behind the per-vault
 * `GET /api/bots/:id/profile` resolver, which needs a vault id +
 * auth scope and is out of this todo's order). The inventory step
 * therefore probes rows defensively at runtime and always logs +
 * skips today; NO gateway code was added or changed.
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
    @Inject(DexterBotBindingService)
    @Optional()
    private readonly binding?: DexterBotBindingService | null,
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
      (await this.fromGatewayInventory()) ?? (await this.fromGetMe());
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

  private async fromGatewayInventory(): Promise<string | null> {
    if (!this.binding) return null;
    let rows: Awaited<ReturnType<DexterBotBindingService['inventory']>>;
    try {
      rows = await this.binding.inventory();
    } catch (err) {
      this.logger.warn(
        `Gateway inventory unreachable — skipping identity source (getMe next): ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return null;
    }
    const bound =
      rows.find((row) => row.boundApp === DexterBotBindingService.APP_ID) ??
      null;
    const username = (bound as { username?: unknown } | null)?.username;
    if (
      typeof username === 'string' &&
      username.trim() &&
      BOT_USERNAME_PATTERN.test(username.trim())
    ) {
      return username.trim();
    }
    this.logger.warn(
      'Gateway inventory exposes no username for the bound bot — skipping (getMe next); no gateway changes made',
    );
    return null;
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
