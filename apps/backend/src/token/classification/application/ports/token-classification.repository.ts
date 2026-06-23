import { TokenClassification } from 'token/classification/domain/entities/token-classification.entity';
import { ChainId } from 'chain/identity/chain-id.vo';

export abstract class TokenClassificationRepository {
  public abstract save(classification: TokenClassification): Promise<void>;
  public abstract findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<TokenClassification | null>;
  public abstract findRecent(
    limit: number,
  ): Promise<ReadonlyArray<TokenClassification>>;
}
