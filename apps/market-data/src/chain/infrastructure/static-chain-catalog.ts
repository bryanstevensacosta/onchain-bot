import { Injectable } from '@nestjs/common';
import { ChainFamily, ChainInfo, STATIC_CHAINS } from '../domain/chain-info';
import { ChainCatalogPort } from '../application/ports/chain-catalog.port';

/**
 * StaticChainCatalog (Tramo 3, todo 2; hexagonal home todo 12, P50).
 *
 * In-memory ChainCatalogPort over STATIC_CHAINS. Ids match ChainIdVo
 * normalization (lowercased slugs).
 */
@Injectable()
export class StaticChainCatalog extends ChainCatalogPort {
  public async findById(id: string): Promise<ChainInfo | null> {
    const normalized = (id ?? '').trim().toLowerCase();
    return STATIC_CHAINS.find((chain) => chain.id === normalized) ?? null;
  }

  public async listAll(): Promise<ReadonlyArray<ChainInfo>> {
    return [...STATIC_CHAINS];
  }

  public async listByFamily(family: ChainFamily): Promise<ReadonlyArray<ChainInfo>> {
    return STATIC_CHAINS.filter((chain) => chain.family === family);
  }
}
