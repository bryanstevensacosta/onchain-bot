import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ChainCatalogPort } from 'chain/application/ports/chain-catalog.port';
import { ProviderRegistryService } from 'provider/provider-registry.service';
import { GatewayRateLimitGuard } from '../../gateway-rate-limit.guard';

/**
 * TokensSnapshotController (Tramo 3, todo 2 shell, P43).
 *
 * Edge contract shell for GET /api/v1/tokens/:chain/:address. The full
 * snapshot (aggregators, persistence) lands in todo 3 — token/ stays
 * UNTOUCHED here. This shell validates the chain and composes provider
 * hints so consumers can integrate against the URL shape from day one.
 */
@UseGuards(GatewayRateLimitGuard)
@Controller('api/v1/tokens')
export class TokensSnapshotController {
  public constructor(
    private readonly catalog: ChainCatalogPort,
    private readonly providers: ProviderRegistryService,
  ) {}

  @Get(':chain/:address')
  public async getSnapshot(@Param('chain') chain: string, @Param('address') address: string): Promise<unknown> {
    const known = await this.catalog.findById(chain);
    if (known === null) {
      throw new NotFoundException(`Unknown chain: ${chain}`);
    }
    const supporting = this.providers
      .listProviders()
      .filter((provider) => provider.supportsChains.includes(known.id))
      .map((provider) => provider.name);
    return {
      chain: known.id,
      address: (address ?? '').trim().toLowerCase(),
      status: 'pending',
      todo3: 'TokenSnapshot aggregate + aggregators land in todo 3',
      providers: supporting,
    };
  }
}
