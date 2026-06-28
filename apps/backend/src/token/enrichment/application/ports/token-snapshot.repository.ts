import { TokenSnapshot } from '../../domain/entities/token-snapshot.entity';
import { ChainId } from 'chain/identity/chain-id.vo';

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
