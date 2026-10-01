import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequireScope } from 'auth/application/require-scope.decorator';
import { AssetResolverService } from 'asset-registry/application/asset-resolver.service';
import {
  AmbiguousAssetError,
  AssetNotFoundError,
  type AssetRecord,
} from 'asset-registry/domain/asset-record';
import { GatewayRateLimitGuard } from '@/gateway/application/gateway-rate-limit.guard';

/**
 * AssetsController (Tramo 3, asset-registry; P43 edge).
 *
 * Read path over the registry: contract+chain first, then cmc id,
 * then gecko id, then symbol+chain. Symbol collisions answer 409
 * with the candidate contracts (never a silent pick). Upsert is an
 * explicit `snapshot`-scoped POST (feed for backfills/seeds).
 */
@UseGuards(GatewayRateLimitGuard)
@Controller('api/v1/assets')
export class AssetsController {
  public constructor(private readonly resolver: AssetResolverService) {}

  private static toHttp(error: unknown): never {
    if (error instanceof AmbiguousAssetError) {
      throw new BadRequestException({
        message: error.message,
        candidates: error.candidates,
      });
    }
    if (error instanceof AssetNotFoundError) {
      throw new NotFoundException(error.message);
    }
    throw error;
  }

  @RequireScope('read')
  @Get('resolve')
  public async resolve(
    @Query('chain') chain: string,
    @Query('contract') contract?: string,
    @Query('symbol') symbol?: string,
    @Query('cmcId') cmcId?: string,
    @Query('geckoId') geckoId?: string,
  ): Promise<AssetRecord> {
    try {
      if (contract !== undefined && contract !== '') {
        return await this.resolver.resolve({ chain, contract });
      }
      if (cmcId !== undefined && cmcId !== '') {
        return await this.resolver.resolveByCmcId(Number(cmcId));
      }
      if (geckoId !== undefined && geckoId !== '') {
        return await this.resolver.resolveByGeckoId(geckoId);
      }
      if (symbol !== undefined && symbol !== '') {
        return await this.resolver.resolveBySymbol(chain, symbol);
      }
      throw new BadRequestException(
        'One of contract, symbol, cmcId or geckoId is required',
      );
    } catch (error: unknown) {
      AssetsController.toHttp(error);
    }
  }

  @RequireScope('read')
  @Get('cmc/:cmcId')
  public async resolveByCmc(
    @Param('cmcId') cmcId: string,
  ): Promise<AssetRecord> {
    try {
      return await this.resolver.resolveByCmcId(Number(cmcId));
    } catch (error: unknown) {
      AssetsController.toHttp(error);
    }
  }

  @RequireScope('read')
  @Get('gecko/:geckoId')
  public async resolveByGecko(
    @Param('geckoId') geckoId: string,
  ): Promise<AssetRecord> {
    try {
      return await this.resolver.resolveByGeckoId(geckoId);
    } catch (error: unknown) {
      AssetsController.toHttp(error);
    }
  }

  @RequireScope('snapshot')
  @Post('upsert')
  public async upsert(
    @Body() body: Record<string, unknown>,
  ): Promise<AssetRecord> {
    const chain = String(body.chain ?? '');
    const contract = String(body.contract ?? '');
    if (chain.trim() === '' || contract.trim() === '') {
      throw new BadRequestException('chain + contract are required');
    }
    const cmcRaw = body.cmcId;
    return this.resolver.upsert({
      chain,
      contract,
      symbol: body.symbol === undefined ? null : String(body.symbol),
      name: body.name === undefined ? null : String(body.name),
      cmcId:
        cmcRaw === undefined || cmcRaw === null || cmcRaw === ''
          ? null
          : Number(cmcRaw),
      geckoId: body.geckoId === undefined ? null : String(body.geckoId),
      providerIds:
        body.providerIds === undefined
          ? {}
          : (body.providerIds as Record<string, string>),
      logoUrl: body.logoUrl === undefined ? null : String(body.logoUrl),
      categories: Array.isArray(body.categories)
        ? (body.categories as Array<string>)
        : [],
    });
  }
}
