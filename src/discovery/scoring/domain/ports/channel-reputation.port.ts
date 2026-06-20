import { ChannelReputation } from 'discovery/scoring/domain/value-objects/channel-reputation.vo';

/**
 * Outbound port: look up the reputation of one or more Telegram channels.
 *
 * Implemented by adapters that may use:
 * - Hard-coded "known good" lists
 * - A database of historical accuracy (which channels called ATHs that held up)
 * - External reputation services
 *
 * Returns `ChannelReputation.unknown(channelId)` for unrecognized channels
 * (default 0.5 score, not trusted, not suspicious).
 */
export abstract class ChannelReputationPort {
  public abstract getReputation(channelId: string): Promise<ChannelReputation>;
  public abstract getAverageReputation(
    channelIds: ReadonlyArray<string>,
  ): Promise<number>;
}
