import { Controller, Get, NotFoundException, Param, Query, UseGuards, UseInterceptors, BadRequestException } from '@nestjs/common';
import { CacheInterceptor } from 'cache/cache.interceptor';
import { CacheTTL } from 'cache/cache-ttl.decorator';
import { ChainCatalogPort } from 'chain/application/ports/chain-catalog.port';
import { DetectChainService } from 'chain/application/detect-chain.service';
import { GatewayRateLimitGuard } from '../../gateway-rate-limit.guard';

/**
 * ChainsController (Tramo 3, todo 2, P43).
 *
 * The ONLY HTTP surface for chain data: static catalog + detect-chain,
 * composed from chain module ports. Edge policies (auth via global
 * ApiKeyGuard, rate-limit, cache) applied here — never in chain/.
 */
@UseGuards(GatewayRateLimitGuard)
@UseInterceptors(CacheInterceptor)
@Controller('api/v1/chains')
export class ChainsController {
  public constructor(
    private readonly catalog: ChainCatalogPort,
    private readonly detectChain: DetectChainService,
  ) {}

  @Get()
  @CacheTTL(60)
  public list(): Promise<unknown> {
    return this.catalog.listAll() as Promise<unknown>;
  }

  @Get('detect')
  public async detect(@Query('address') address?: string): Promise<unknown> {
    if (address === undefined || address.trim() === '') {
      throw new BadRequestException('Query param "address" is required');
    }
    return (await this.detectChain.detect(address)) as unknown;
  }

  @Get(':id')
  public async getById(@Param('id') id: string): Promise<unknown> {
    const chain = await this.catalog.findById(id);
    if (chain === null) {
      throw new NotFoundException(`Unknown chain: ${id}`);
    }
    return chain as unknown;
  }
}
