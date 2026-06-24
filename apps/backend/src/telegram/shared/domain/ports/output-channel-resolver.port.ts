import { OutputChannel } from '../value-objects/output-channel.vo';
import { ScoreTier } from 'token/scoring/domain/value-objects/score-tier.vo';

export abstract class OutputChannelResolverPort {
  public abstract listAll(): ReadonlyArray<OutputChannel>;
  public abstract listForTier(tier: ScoreTier): ReadonlyArray<OutputChannel>;
}
