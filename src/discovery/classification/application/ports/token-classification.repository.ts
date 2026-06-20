import { TokenClassification } from 'discovery/classification/domain/entities/token-classification.entity';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';

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
