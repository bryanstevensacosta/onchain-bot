import { Inject, Injectable } from '@nestjs/common';
import { ChainFamily } from 'chain/identity/chain-family.vo';
import type { Capability } from 'chain/registry/domain/value-objects/chain-capabilities.vo';
import {
  CHAIN_CATALOG,
  ChainCatalogPort,
} from 'chain/registry/domain/ports/chain-catalog.port';
import {
  ChainMapper,
  ChainView,
} from 'chain/registry/application/mappers/chain.mapper';

export interface ListChainsInput {
  readonly family?: 'evm' | 'solana';
  readonly capability?: Capability;
}

/**
 * Use case: list chains, optionally filtered by family or capability.
 *
 * Replaces ad-hoc `supportedChains.some(...)` filters in consumers.
 */
@Injectable()
export class ListChainsUseCase {
  public constructor(
    @Inject(CHAIN_CATALOG) private readonly catalog: ChainCatalogPort,
  ) {}

  public async execute(
    input: ListChainsInput = {},
  ): Promise<ReadonlyArray<ChainView>> {
    let chains = await this.catalog.listAll();
    if (input.family) {
      const family = ChainFamily.fromString(input.family);
      chains = chains.filter((c) => c.family.value === family.value);
    }
    if (input.capability) {
      const cap = input.capability;
      chains = chains.filter((c) => c.supports(cap));
    }
    return chains.map((c) => ChainMapper.toView(c));
  }
}
