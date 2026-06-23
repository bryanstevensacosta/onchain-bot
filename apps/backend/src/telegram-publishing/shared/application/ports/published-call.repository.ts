import { ChainId } from 'chain/identity/chain-id.vo';
import { PublishedCall } from '../../domain/entities/published-call.entity';

export abstract class PublishedCallRepository {
  public abstract save(call: PublishedCall): Promise<void>;
  public abstract findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<PublishedCall | null>;
  public abstract findRecent(limit: number): Promise<ReadonlyArray<PublishedCall>>;
  public abstract findPublished(limit: number): Promise<ReadonlyArray<PublishedCall>>;
  public abstract findFailed(limit: number): Promise<ReadonlyArray<PublishedCall>>;
  public abstract countPublished(): Promise<number>;
}