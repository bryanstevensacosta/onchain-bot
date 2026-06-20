import { PublishedCall } from 'discovery/publishing/telegram/domain/entities/published-call.entity';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';

export abstract class PublishedCallRepository {
  public abstract save(call: PublishedCall): Promise<void>;
  public abstract findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<PublishedCall | null>;
  public abstract findRecent(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>>;
  public abstract findPublished(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>>;
  public abstract findFailed(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>>;
}
