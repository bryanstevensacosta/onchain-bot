import { HoneypotAnalysis } from 'discovery/honeypot/domain/entities/honeypot-analysis.entity';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';

export abstract class HoneypotAnalysisRepository {
  public abstract save(analysis: HoneypotAnalysis): Promise<void>;
  public abstract findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<HoneypotAnalysis | null>;
  public abstract findRecent(
    limit: number,
  ): Promise<ReadonlyArray<HoneypotAnalysis>>;
}
