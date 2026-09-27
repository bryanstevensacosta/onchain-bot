import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { RequireScope } from 'auth/application/require-scope.decorator';
import { ChainLogoService } from 'chain-logo/application/chain-logo.service';
import { Public } from '@/shared/infrastructure/decorators/public.decorator';
import { GatewayRateLimitGuard } from '@/gateway/application/gateway-rate-limit.guard';

/**
 * ChainLogoController (chain-logo resolver, P43 edge).
 *
 * Serves the persisted `uploads/chain-logo/<chain>.png` bytes for
 * frontend `[logo] name` badges. The GET is public with a long
 * `Cache-Control` (logos are immutable between explicit refreshes).
 * Refresh is an explicit admin POST — there is no periodic refresh.
 * Unknown chains get the placeholder (200, never 404/500).
 */
@UseGuards(GatewayRateLimitGuard)
@Controller('api/v1/chains')
export class ChainLogoController {
  public constructor(private readonly logos: ChainLogoService) {}

  @Public()
  @Get(':id/logo')
  @Header('Content-Type', 'image/png')
  @Header('Cache-Control', 'public, max-age=86400, immutable')
  public async getLogo(@Param('id') id: string): Promise<StreamableFile> {
    const result = await this.logos.resolveLogo(id);
    return new StreamableFile(result.bytes);
  }

  @RequireScope('admin')
  @Post(':id/logo/refresh')
  public async refreshLogo(@Param('id') id: string): Promise<{ id: string; source: string }> {
    const result = await this.logos.refreshLogo(id);
    return { id: id.trim().toLowerCase(), source: result.source };
  }
}
