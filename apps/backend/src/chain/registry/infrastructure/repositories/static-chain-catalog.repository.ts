import { Injectable } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import { ChainFamily } from 'chain/identity/chain-family.vo';
import type { Capability } from 'chain/registry/domain/value-objects/chain-capabilities.vo';
import { Chain } from 'chain/registry/domain/entities/chain.entity';
import {
  ChainCatalogPort,
  STATIC_CHAINS,
} from 'chain/registry/domain/ports/chain-catalog.port';

/**
 * v1 implementation: static in-memory catalog.
 *
 * Replaces hardcoded `supportedChains: ChainId[]` arrays in adapters.
 */
@Injectable()
export class StaticChainCatalogRepository extends ChainCatalogPort {
  private readonly byId: ReadonlyMap<ChainId['value'], Chain>;
  private readonly all: ReadonlyArray<Chain>;

  public constructor() {
    super();
    const map = new Map<ChainId['value'], Chain>();
    for (const chain of STATIC_CHAINS) {
      map.set(chain.value, chain);
    }
    this.byId = map;
    this.all = Object.freeze([...STATIC_CHAINS]);
  }

  public async findById(id: ChainId): Promise<Chain | null> {
    return Promise.resolve(this.byId.get(id.value) ?? null);
  }

  public async listByFamily(
    family: ChainFamily,
  ): Promise<ReadonlyArray<Chain>> {
    return Promise.resolve(
      this.all.filter((c) => c.family.value === family.value),
    );
  }

  public async listAll(): Promise<ReadonlyArray<Chain>> {
    return Promise.resolve(this.all);
  }

  public async listSupporting(
    capability: Capability,
  ): Promise<ReadonlyArray<Chain>> {
    return Promise.resolve(this.all.filter((c) => c.supports(capability)));
  }
}
