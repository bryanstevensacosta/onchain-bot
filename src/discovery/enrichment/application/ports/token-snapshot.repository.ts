import { TokenSnapshot } from 'discovery/enrichment/domain/entities/token-snapshot.entity';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';

export abstract class TokenSnapshotRepository {
  public abstract save(snapshot: TokenSnapshot): Promise<void>;
  public abstract findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<TokenSnapshot | null>;
  public abstract findRecent(
    limit: number,
  ): Promise<ReadonlyArray<TokenSnapshot>>;
}
