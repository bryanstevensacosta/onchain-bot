import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { TelegramSendResult } from '../../domain/ports/telegram-publisher.port';

/**
 * Feed dual-send outcome (one direct leg + one gateway leg, same chat).
 */
export interface ParityInput {
  readonly botId: string;
  readonly chatId: string;
  readonly shape: string;
  readonly direct: TelegramSendResult;
  readonly gateway: TelegramSendResult;
  readonly chunks: number;
}

export interface ParityRecord extends ParityInput {
  readonly at: string;
  readonly diverged: boolean;
  readonly reasons: string[];
}

/**
 * Dual-send parity ledger (telegram-bots-gateway todo 5).
 *
 * Parity = both legs agree on the OUTCOME (`ok`) for the same chat +
 * shape. `messageId`s are intentionally NOT compared — two sends to the
 * same chat are two distinct Telegram messages by construction.
 * Gateway-incompatible shapes (local files, video, buttons) are recorded
 * as `skipped` (never diverged): the direct leg is the only leg that
 * can carry them today. `assertNoDivergence()` is the cutover gate
 * (adversarial: any divergence blocks cutover). In-memory today —
 * persisted evidence lands with the global cutover (gateway todo 7).
 */
@Injectable()
export class DualSendParityService {
  private readonly records: ParityRecord[] = [];

  public static compare(
    direct: TelegramSendResult,
    gateway: TelegramSendResult,
  ): { diverged: boolean; reasons: string[] } {
    const reasons: string[] = [];
    if (direct.ok !== gateway.ok) {
      reasons.push(`ok-mismatch (direct:${direct.ok} gateway:${gateway.ok})`);
    }
    return { diverged: reasons.length > 0, reasons };
  }

  public record(input: ParityInput): ParityRecord {
    const { diverged, reasons } = DualSendParityService.compare(
      input.direct,
      input.gateway,
    );
    const record: ParityRecord = {
      ...input,
      at: new Date().toISOString(),
      diverged,
      reasons,
    };
    this.records.push(record);
    return record;
  }

  public recordSkipped(input: Omit<ParityInput, 'direct' | 'gateway'>): void {
    this.records.push({
      ...input,
      direct: { ok: true, messageId: null, error: null },
      gateway: { ok: true, messageId: null, error: null },
      at: new Date().toISOString(),
      diverged: false,
      reasons: ['gateway-leg-skipped (shape not gateway-compatible)'],
    });
  }

  public snapshot(): {
    readonly total: number;
    readonly diverged: number;
    readonly records: ParityRecord[];
  } {
    const diverged = this.records.filter((row) => row.diverged).length;
    return { total: this.records.length, diverged, records: [...this.records] };
  }

  /** Cutover gate: throws CONFLICT while any divergence is recorded. */
  public assertNoDivergence(): void {
    const { total, diverged } = this.snapshot();
    if (diverged > 0) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `dual-send diverged (${diverged}/${total}) — cutover blocked until parity is 0`,
        { total, diverged },
      );
    }
  }

  public reset(): void {
    this.records.length = 0;
  }
}
