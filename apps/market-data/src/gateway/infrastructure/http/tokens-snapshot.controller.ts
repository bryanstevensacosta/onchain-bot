import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AddressSnapshotService } from 'snapshot/application/address-snapshot.service';
import { GatewayRateLimitGuard } from '../../application/gateway-rate-limit.guard';

/**
 * TokensSnapshotController (Tramo 3, P45).
 *
 * @deprecated Use GET /api/v1/addresses/:chain/:address?kind=token
 * (AddressesController) — the token model was absorbed into the
 * universal address model (Address = chain + value + kind). This
 * endpoint is a thin alias pinned to kind=token and will be removed
 * in the final review.
 */
@UseGuards(GatewayRateLimitGuard)
@Controller('api/v1/tokens')
export class TokensSnapshotController {
  public constructor(private readonly snapshots: AddressSnapshotService) {}

  @Get(':chain/:address')
  public async getSnapshot(
    @Param('chain') chain: string,
    @Param('address') address: string,
  ): Promise<unknown> {
    return (await this.snapshots.getSnapshot({
      chain,
      value: address,
      kindHint: 'token',
    })) as unknown;
  }
}
