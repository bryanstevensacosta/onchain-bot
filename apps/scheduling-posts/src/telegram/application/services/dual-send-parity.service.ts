import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { TelegramSendResult } from '../../domain/ports/telegram-send-result';

/**
 * Gateway send record: the gateway outcome vs the planned expectation.
 */
export interface ParityInput {
  readonly postId: string;
  readonly botId: string;
  readonly chatId: string;
  readonly shape: string;
  readonly plannedOk: boolean;
  readonly gateway: TelegramSendResult;
  readonly chunks: number;
}

export interface ParityRecord extends ParityInput {
  readonly at: string;
  readonly diverged: boolean;
  readonly reasons: string[];
}

/**
 * Parity ledger (contract P42 + gateway migration pattern).
 *
 * Deviation from the sibling dual-send (gateway + direct legs): this
 * app has NO direct Bot API leg — contract P42 bans raw tokens here —
 * so parity compares the gateway outcome against the planned
 * expectation (`plannedOk`, true for every gateway-compatible shape
 * the fire path attempted). `messageId`s are never compared. A
 * gateway failure against a planned send is a divergence (cutover
 * signal), while a planned hold (delay/cap) never reaches the ledger
 * at all. Gateway-incompatible shapes (buttons, local-file media,
 * video) are recorded as `skipped` (never diverged): there is no
 * second leg that could carry them. `assertNoDivergence()` is the
 * cutover gate (any divergence blocks cutover). In-memory today.
 */
@Injectable()
export class DualSendParityService {
  private readonly records: ParityRecord[] = [];

  public static compare(
    plannedOk: boolean,
    gateway: TelegramSendResult,
  ): { diverged: boolean; reasons: string[] } {
    const reasons: string[] = [];
    if (plannedOk !== gateway.ok) {
      reasons.push(
        `ok-mismatch (planned:${plannedOk} gateway:${gateway.ok})`,
      );
    }
    return { diverged: reasons.length > 0, reasons };
  }

  public record(input: ParityInput): ParityRecord {
    const { diverged, reasons } = DualSendParityService.compare(
      input.plannedOk,
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

  public recordSkipped(
    input: Omit<ParityInput, 'plannedOk' | 'gateway'>,
  ): void {
    this.records.push({
      ...input,
      plannedOk: true,
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
