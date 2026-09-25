import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor } from 'cache/infrastructure/cache.interceptor';
import { CacheTTL } from 'cache/infrastructure/cache-ttl.decorator';
import { AddressSnapshotService } from 'snapshot/application/address-snapshot.service';
import { GatewayRateLimitGuard } from '../../application/gateway-rate-limit.guard';

/**
 * AddressesController (Tramo 3, P45).
 *
 * Universal edge: GET /api/v1/addresses/:chain/:address[?kind=].
 * Chain qualifier is mandatory (400 when missing/blank); kind hint is
 * optional and never crashes (unknown kinds resolve to explicit
 * `unknown`). Edge policies (auth via global ApiKeyGuard, rate-limit,
 * cache) applied here — never in address/ (P43).
 */
@UseGuards(GatewayRateLimitGuard)
@UseInterceptors(CacheInterceptor)
@Controller('api/v1/addresses')
export class AddressesController {
  public constructor(private readonly snapshots: AddressSnapshotService) {}

  @Get(':chain/:address')
  @CacheTTL(30)
  public async getAddress(
    @Param('chain') chain: string,
    @Param('address') address: string,
    @Query('kind') kind?: string,
  ): Promise<unknown> {
    if ((chain ?? '').trim() === '') {
      throw new BadRequestException(
        'Chain qualifier is required (GET /api/v1/addresses/:chain/:address)',
      );
    }
    return (await this.snapshots.getSnapshot({
      chain,
      value: address,
      kindHint: kind,
    })) as unknown;
  }
}
