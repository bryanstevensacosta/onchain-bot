import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '@/shared/kernel/domain-error';
import { VaultService } from '@/vault/application/vault.service';

export interface BotInventoryRow {
  readonly id: string;
  readonly label: string;
  readonly ownerApp: string;
  readonly boundApp: string | null;
  readonly available: boolean;
}

/**
 * Exclusive bot↔app binding (dexter task).
 *
 * One bot serves ONE app at a time: `bind` locks the vault bot to an
 * app id; a second bind to a different app throws CONFLICT (409) and a
 * locked bot cannot be instantiated/bound by any other app. `unbind`
 * releases the lock back to `available`. Idempotent re-bind to the
 * same app is a no-op. Register auto-binds to `ownerApp` so fresh
 * vault entries start locked, never floating.
 */
@Injectable()
export class BotBindingService {
  private readonly bound = new Map<string, string>();
  private readonly released = new Set<string>();

  public constructor(private readonly vault: VaultService) {}

  public async bind(botId: string, appId: string): Promise<BotInventoryRow> {
    const clean = (appId ?? '').trim();
    if (!clean) {
      throw new DomainError(ErrorCode.VALIDATION, 'appId must not be empty', {
        botId,
      });
    }
    const entry = await this.vault.get(botId);
    const current = this.effectiveBound(botId, entry.ownerApp);
    if (current !== null && current !== clean) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `bot ${botId} already bound to ${current}`,
        { botId, boundApp: current, appId: clean },
      );
    }
    this.bound.set(botId, clean);
    this.released.delete(botId);
    return {
      id: entry.id,
      label: entry.label,
      ownerApp: entry.ownerApp,
      boundApp: clean,
      available: false,
    };
  }

  public async unbind(botId: string): Promise<BotInventoryRow> {
    const entry = await this.vault.get(botId);
    this.bound.delete(botId);
    this.released.add(botId);
    return {
      id: entry.id,
      label: entry.label,
      ownerApp: entry.ownerApp,
      boundApp: null,
      available: true,
    };
  }

  public boundAppFor(botId: string): string | null {
    return this.bound.get(botId) ?? null;
  }

  private effectiveBound(botId: string, ownerApp: string): string | null {
    const explicit = this.bound.get(botId);
    if (explicit) return explicit;
    if (this.released.has(botId)) return null;
    return ownerApp ?? null;
  }

  public async inventory(): Promise<BotInventoryRow[]> {
    const rows = await this.vault.list();
    return rows.map((row) => {
      const boundApp = this.effectiveBound(row.id, row.ownerApp);
      return {
        id: row.id,
        label: row.label,
        ownerApp: row.ownerApp,
        boundApp,
        available: boundApp === null,
      };
    });
  }

  public assertUsable(botId: string, caller?: string, ownerApp?: string): void {
    if (!caller) return;
    const explicit = this.bound.get(botId);
    const boundApp =
      explicit ?? (this.released.has(botId) ? null : (ownerApp ?? null));
    if (boundApp && boundApp !== caller) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `bot ${botId} already bound to ${boundApp}`,
        { botId, boundApp, caller },
      );
    }
  }
}
