import { OutputChannel } from 'discovery/publishing/telegram/domain/value-objects/output-channel.vo';

/**
 * Outbound port: resolve which Telegram channels should receive
 * republished approved calls.
 *
 * v1: static list (PRIMARY, SECONDARY, PREMIUM tiers).
 * v2: database-backed config with per-user preferences.
 */
export abstract class OutputChannelResolverPort {
  public abstract listAll(): ReadonlyArray<OutputChannel>;
  public abstract listForScore(score: number): ReadonlyArray<OutputChannel>;
}
