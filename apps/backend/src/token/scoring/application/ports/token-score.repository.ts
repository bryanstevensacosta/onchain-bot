import { TokenScore } from 'token/scoring/domain/entities/token-score.entity';
import { ChainId } from 'chain/identity/chain-id.vo';

export abstract class TokenScoreRepository {
  public abstract save(score: TokenScore): Promise<void>;
  public abstract findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<TokenScore | null>;
  public abstract findRecent(limit: number): Promise<ReadonlyArray<TokenScore>>;
  public abstract findTopScores(
    limit: number,
    minScore: number,
  ): Promise<ReadonlyArray<TokenScore>>;
}
