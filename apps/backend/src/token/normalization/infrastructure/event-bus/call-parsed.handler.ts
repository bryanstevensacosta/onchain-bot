/**
 * @deprecated Moved to apps/kol-calls/src/normalization/ (Tramo 1, todo 7 + P18 companion).
 * Normalization as mention-index now lives in kol-calls: NormalizeCallUseCase →
 * (contract, kol, messageId) index WITHOUT collapse ("one card per coin" explicitly
 * derogated per P1). This file stays wired for dual-run; it will be removed in
 * todo 16 (cutover + cleanup). Do not extend it — add normalization logic in
 * apps/kol-calls/src/normalization/ instead.
 *
 * New location: apps/kol-calls/src/normalization/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CallParsedEvent } from 'token/intake/parsing/domain/events/call-parsed.event';
import { TokenMetrics } from 'shared/common/value-objects/token-metrics.vo';
import { NormalizeCallUseCase } from 'token/normalization/application/handlers/normalize-call.use-case';

/**
 * Subscribes to parsing.call.parsed and triggers normalization.
 *
 * Carries the KOL handle (when known) into the canonical call's `sources[].username`
 * so the frontend can render Telegram deep links via the public handle.
 */
@Injectable()
export class CallParsedHandler {
  private readonly logger = new Logger(CallParsedHandler.name);

  public constructor(private readonly normalize: NormalizeCallUseCase) {}

  @OnEvent('parsing.call.parsed', { async: true })
  public async handle(event: CallParsedEvent): Promise<void> {
    try {
      const result = await this.normalize.execute({
        chainHint: event.payload.contractChainHint,
        addressRaw: event.payload.contractAddress,
        ticker: event.payload.ticker,
        name: event.payload.name,
        chart: event.payload.chart,
        metrics: TokenMetrics.create({
          marketCapUsd: event.payload.marketCapUsd,
          liquidityUsd: event.payload.liquidityUsd,
          fdvUsd: event.payload.fdvUsd,
          holders: event.payload.holders,
        }),
        confidence: event.payload.confidence,
        kolId: event.payload.kolId,
        username: event.payload.username,
        messageId: event.payload.messageId,
        occurredAt: event.payload.occurredAt,
      });

      if (!result) {
        this.logger.debug(
          `Skipped unsupported chain: ${event.payload.contractChainHint}:${event.payload.contractAddress}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Normalization failed for ${event.payload.contractChainHint}:${event.payload.contractAddress}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
