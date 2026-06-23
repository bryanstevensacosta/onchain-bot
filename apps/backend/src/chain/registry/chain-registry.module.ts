import { Module } from '@nestjs/common';
import { CHAIN_CATALOG } from 'chain/registry/domain/ports/chain-catalog.port';
import { StaticChainCatalogRepository } from 'chain/registry/infrastructure/repositories/static-chain-catalog.repository';
import { GetChainUseCase } from 'chain/registry/application/handlers/get-chain.use-case';
import { ListChainsUseCase } from 'chain/registry/application/handlers/list-chains.use-case';

/**
 * Chain Registry BC module.
 *
 * Provides:
 * - Static catalog of registered chains (v1: in-memory; v2: configurable)
 * - GetChainUseCase, ListChainsUseCase (queries by id / family / capability)
 *
 * Exports `CHAIN_CATALOG` token for downstream adapters to inject.
 */
@Module({
  providers: [
    {
      provide: CHAIN_CATALOG,
      useClass: StaticChainCatalogRepository,
    },
    GetChainUseCase,
    ListChainsUseCase,
  ],
  exports: [CHAIN_CATALOG, GetChainUseCase, ListChainsUseCase],
})
export class ChainRegistryModule {}
