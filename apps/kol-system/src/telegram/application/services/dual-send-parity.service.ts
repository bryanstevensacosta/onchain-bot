import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import type { SendResult } from '../../domain/ports/telegram-publisher.port';

export interface ParityInput {
  readonly botId: string;
  readonly chatId: string;
  readonly direct: SendResult;
  readonly gateway: SendResult;
  readonly chunks: number;
}

export interface ParityRecord extends ParityInput {
  readonly at: string;
  readonly diverged: boolean;
  readonly reasons: string[];
}

/**
 * Dual-send parity ledger (telegram-bots-gateway todo 4).
 *
 * Parity = both legs agree on the OUTCOME (`ok`), chunk for chunk from
 * the same formatted card. `messageId`s are intentionally NOT compared —
 * two sends to the same chat are two distinct Telegram messages by
 * construction. `assertNoDivergence()` is the cutover gate (adversarial:
 * any divergence blocks cutover). In-memory today — persisted evidence
 * lands with the global cutover (gateway todo 7).
 */
@Injectable()
export class DualSendParityService {
  private readonly records: ParityRecord[] = [];

  public static compare(
    direct: SendResult,
    gateway: SendResult,
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
