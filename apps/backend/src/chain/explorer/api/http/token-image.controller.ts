import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Logger,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { TokenImageService } from '../../application/services/token-image.service';

const ALLOWED_CHAINS = new Set<string>([
  'ethereum',
  'solana',
  'bsc',
  'base',
  'arbitrum',
  'polygon',
]);

const ADDRESS_PATTERN = /^[A-Za-z0-9]{1,100}$/;

@Controller('token/image')
export class TokenImageController {
  private readonly logger = new Logger(TokenImageController.name);

  public constructor(private readonly imageService: TokenImageService) {}

  @Get(':chain/:address')
  public async proxy(
    @Param('chain') chain: string,
    @Param('address') address: string,
    @Query('source') source?: string,
    @Headers('accept') acceptHeader?: string,
    @Res() res?: Response,
  ): Promise<void> {
    if (!ALLOWED_CHAINS.has(chain)) {
      throw new BadRequestException(`Unsupported chain: ${chain}`);
    }
    if (!ADDRESS_PATTERN.test(address)) {
      throw new BadRequestException(
        'Address must be 1-100 alphanumeric characters',
      );
    }
    this.logger.debug(
      `Image proxy requested: ${chain}/${address} (source=${source ?? 'none'}, acceptWebP=${
        acceptHeader?.toLowerCase().includes('image/webp') ?? false
      })`,
    );
    const image = await this.imageService.getImage(
      chain,
      address,
      source,
      acceptHeader,
    );
    res!.setHeader('Content-Type', image.contentType);
    res!.setHeader('Cache-Control', 'public, max-age=300');
    res!.send(image.buffer);
  }
}
