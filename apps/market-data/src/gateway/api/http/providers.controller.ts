import { Controller, Get, NotFoundException, Param, UseGuards, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor } from 'cache/cache.interceptor';
import { CacheTTL } from 'cache/cache-ttl.decorator';
import { ProviderRegistryService } from 'provider/provider-registry.service';
import { GatewayRateLimitGuard } from '../../gateway-rate-limit.guard';

/**
 * ProvidersController (Tramo 3, todo 2, P43).
 *
 * The ONLY HTTP surface for provider status: health/latency registry
 * composed from the provider module port. Edge policies applied here.
 */
@UseGuards(GatewayRateLimitGuard)
@UseInterceptors(CacheInterceptor)
@Controller('api/v1/providers')
export class ProvidersController {
  public constructor(private readonly registry: ProviderRegistryService) {}

  @Get()
  @CacheTTL(15)
  public list(): unknown {
    return this.registry.listStatus() as unknown;
  }

  @Get(':name')
  public getByName(@Param('name') name: string): unknown {
    const status = this.registry.getStatus(name);
    if (status === null) {
      throw new NotFoundException(`Unknown provider: ${name}`);
    }
    return status as unknown;
  }
}
