import { Controller, Get, Query } from '@nestjs/common';
import { TokenScanService } from '../../application/token-scan.service';

@Controller('chain-dexter')
export class ChainDexterController {
  constructor(private readonly tokenScanService: TokenScanService) {}

  @Get('token')
  async getTokenInfo(@Query('address') address: string) {
    if (!address) {
      return { error: 'Address required' };
    }
    const info = await this.tokenScanService.getTokenInfo(address);
    if (!info) {
      return { error: 'Token not found' };
    }
    return info;
  }
}
