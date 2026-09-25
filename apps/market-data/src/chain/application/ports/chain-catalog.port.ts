import { ChainFamily, ChainInfo } from '../../domain/chain-info';

/**
 * ChainCatalogPort (Tramo 3, todo 2).
 *
 * Read-only catalog of registered chains. v1 is static (in-memory);
 * a DB-backed implementation can swap in without changing consumers.
 */
export abstract class ChainCatalogPort {
  public abstract findById(id: string): Promise<ChainInfo | null>;
  public abstract listAll(): Promise<ReadonlyArray<ChainInfo>>;
  public abstract listByFamily(family: ChainFamily): Promise<ReadonlyArray<ChainInfo>>;
}
