import { Inject, Injectable } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  CHAIN_CATALOG,
  ChainCatalogPort,
} from 'chain/registry/domain/ports/chain-catalog.port';
import {
  ChainMapper,
  ChainView,
} from 'chain/registry/application/mappers/chain.mapper';

export interface GetChainInput {
  readonly chain: string;
}

/**
 * Use case: resolve a chain by network id (e.g. "ethereum").
 *
 * Returns null for unknown ids — caller decides whether to throw.
 */
@Injectable()
export class GetChainUseCase {
  public constructor(
    @Inject(CHAIN_CATALOG) private readonly catalog: ChainCatalogPort,
  ) {}

  public async execute(input: GetChainInput): Promise<ChainView | null> {
    const id = ChainId.fromString(input.chain);
    const chain = await this.catalog.findById(id);
    return chain ? ChainMapper.toView(chain) : null;
  }
}
